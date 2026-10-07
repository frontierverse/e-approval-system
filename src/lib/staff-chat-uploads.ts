import "server-only";
import { queueChatPush } from "@/lib/mobile-push-events";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type StaffChatUpload } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAttachmentStorageConfig, resolveAttachmentStorageProvider } from "@/lib/attachment-storage-core";
import { staffChatChunkSize } from "@/lib/staff-chat-file-limits";
import { getStaffChatChunkRef, removeStaffChatChunkUpload, writeStaffChatChunk, writeStaffChatManifest } from "@/lib/staff-chat-chunk-storage";
import { StaffChatError, getStaffChatToday, parseStaffChatId } from "@/lib/staff-chat-core";
import { lockActiveParticipants, type StaffChatContext } from "@/lib/staff-chat-actor";
import { mapMessage, messageSelect } from "@/lib/staff-chat";
import { publishStaffChatChange } from "@/lib/staff-chat-events";
import { getStaffChatPartSize, parseStaffChatUpload, parseStaffChatUploadId, staffChatUploadLifetimeMs } from "@/lib/staff-chat-upload-core";

import type { ChatUploadStatus } from "@/lib/staff-chat-types";

const transactionOptions = { maxWait: 10_000, timeout: 60_000 };

export async function startStaffChatUpload(userId: string, value: unknown, context: StaffChatContext = {}) {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  const input = parseStaffChatUpload(value, userId);
  const storage = getAttachmentStorageConfig(process.env);
  if (!storage.ok) throw new StaffChatError("첨부파일 저장소 설정이 올바르지 않습니다. 관리자에게 문의하세요.", 503);
  await cleanupExpiredStaffChatUploads(userId, { db, today });
  return db.$transaction(async (tx) => {
    await lockActiveParticipants(tx, userId, input.peerId, today);
    // Return an integer column: Prisma's PostgreSQL adapter cannot decode void.
    await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`staff-chat-upload:${userId}`}))`);
    let upload = await tx.staffChatUpload.findUnique({ where: { senderId_requestId: { senderId: userId, requestId: input.requestId } } });
    if (upload) {
      if (upload.recipientId !== input.peerId || upload.body !== input.body || upload.originalName !== input.originalName
        || upload.mimeType !== input.mimeType || upload.size !== input.size || upload.fileDigest !== input.fileDigest) {
        throw new StaffChatError("전송 요청이 다른 파일에 이미 사용되었습니다. 파일을 다시 선택해 주세요.", 409);
      }
      assertUploadAvailable(upload);
    } else {
      const priorMessage = await tx.staffChatMessage.findUnique({ where: { senderId_requestId: { senderId: userId, requestId: input.requestId } }, select: { id: true } });
      if (priorMessage) throw new StaffChatError("전송 요청이 다른 메시지에 이미 사용되었습니다.", 409);
      upload = await tx.staffChatUpload.create({ data: {
        id: randomUUID(), senderId: userId, recipientId: input.peerId, requestId: input.requestId,
        body: input.body, originalName: input.originalName, mimeType: input.mimeType, size: input.size,
        chunkDigests: input.chunkDigests, fileDigest: input.fileDigest, uploadedParts: [],
        storageProvider: storage.provider, expiresAt: new Date(Date.now() + staffChatUploadLifetimeMs),
      } });
    }
    const message = upload.messageId ? await tx.staffChatMessage.findUnique({ where: { id: upload.messageId }, select: messageSelect }) : null;
    return { uploadId: upload.id, uploadedParts: upload.uploadedParts as number[], ...(message ? { message: mapMessage(message) } : {}) };
  }, transactionOptions);
}

async function lockUpload(tx: Prisma.TransactionClient, userId: string, id: string, today = getStaffChatToday()): Promise<StaffChatUpload> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "StaffChatUpload" WHERE "id" = ${id} AND "senderId" = ${userId} FOR UPDATE
  `);
  if (!rows.length) throw new StaffChatError("파일 전송 정보를 찾을 수 없습니다.", 404);
  const upload = await tx.staffChatUpload.findUnique({ where: { id } });
  if (!upload) throw new StaffChatError("파일 전송 정보를 찾을 수 없습니다.", 404);
  assertUploadAvailable(upload);
  await lockActiveParticipants(tx, userId, upload.recipientId, today);
  return upload;
}

function assertUploadAvailable(upload: Pick<StaffChatUpload, "deletionRequestedAt" | "messageId" | "expiresAt">) {
  if (upload.deletionRequestedAt || (!upload.messageId && upload.expiresAt <= new Date())) {
    throw new StaffChatError("파일 전송이 만료되었습니다. 파일을 다시 전송해 주세요.", 410);
  }
}

function uploadProvider(upload: StaffChatUpload) {
  const provider = resolveAttachmentStorageProvider(upload.storageProvider);
  if (!provider) throw new StaffChatError("파일 저장소를 확인할 수 없습니다.", 503);
  return provider;
}

export async function putStaffChatUploadPart(userId: string, requestedId: unknown, index: number, bytes: Buffer, context: StaffChatContext = {}) {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  const id = parseStaffChatUploadId(requestedId);
  const digest = createHash("sha256").update(bytes).digest("hex");
  await db.$transaction(async (tx) => {
    const upload = await lockUpload(tx, userId, id, today);
    const expectedSize = getStaffChatPartSize(upload.size, index);
    const digests = upload.chunkDigests as string[];
    if (bytes.byteLength !== expectedSize || digest !== digests[index]) throw new StaffChatError("파일 내용이 일치하지 않습니다. 파일을 다시 선택해 주세요.", 409);
    const uploaded = upload.uploadedParts as number[];
    // Completed/published chunks are immutable, including after recipient deletion.
    if (upload.messageId || uploaded.includes(index)) return;
    // The upload row records every possible deterministic object key from start.
    // A process failure can leave bytes, but expiry cleanup can always find them.
    await writeStaffChatChunk(upload.id, index, uploadProvider(upload), bytes, digest);
    await tx.staffChatUpload.update({ where: { id }, data: {
      uploadedParts: [...uploaded, index].sort((left, right) => left - right),
      expiresAt: new Date(Date.now() + staffChatUploadLifetimeMs),
    } });
  }, transactionOptions);
  return { ok: true };
}

export async function completeStaffChatUpload(userId: string, requestedId: unknown, context: StaffChatContext = {}) {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  const id = parseStaffChatUploadId(requestedId);
  const message = await db.$transaction(async (tx) => {
    const upload = await lockUpload(tx, userId, id, today);
    if (upload.messageId) {
      const existing = await tx.staffChatMessage.findUnique({ where: { id: upload.messageId }, select: messageSelect });
      if (!existing) throw new StaffChatError("메시지를 찾을 수 없습니다.", 404);
      return existing;
    }
    const digests = upload.chunkDigests as string[];
    const uploaded = upload.uploadedParts as number[];
    if (digests.some((_, index) => !uploaded.includes(index))) throw new StaffChatError("파일 전송이 아직 끝나지 않았습니다. 다시 전송해 주세요.", 409);
    const provider = uploadProvider(upload);
    const parts = digests.map((digest, index) => ({ ...getStaffChatChunkRef(id, index, provider), size: getStaffChatPartSize(upload.size, index), digest }));
    const manifest = await writeStaffChatManifest(id, provider, parts, upload.size);
    const created = await tx.staffChatMessage.create({ data: {
      senderId: userId, recipientId: upload.recipientId, requestId: upload.requestId, body: upload.body,
      attachment: { create: {
        originalName: upload.originalName, mimeType: upload.mimeType, size: upload.size, fileDigest: upload.fileDigest,
        storageKey: manifest.storageKey, storageProvider: manifest.storageProvider,
      } },
    }, select: messageSelect });
    await tx.staffChatUpload.update({ where: { id }, data: { messageId: created.id } });
    await queueChatPush(tx, created);
    return created;
  }, transactionOptions).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new StaffChatError("전송 요청이 다른 메시지에 이미 사용되었습니다. 파일을 다시 선택해 주세요.", 409);
    }
    throw error;
  });
  await publishStaffChatChange([message.senderId, message.recipientId]);
  return mapMessage(message);
}

export async function cleanupExpiredStaffChatUploads(userId: string, context: StaffChatContext = {}) {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  // Authenticate before the candidate query, then recheck under each claim lock.
  await db.$transaction(tx => lockActiveParticipants(tx, userId, undefined, today));
  const candidates = await db.staffChatUpload.findMany({ where: {
    senderId: userId, messageId: null, OR: [{ expiresAt: { lte: new Date() } }, { deletionRequestedAt: { not: null } }],
  }, orderBy: { expiresAt: "asc" }, take: 3 });
  for (const candidate of candidates) {
    // Claim cleanup under the same row lock as parts/finalization. Once marked,
    // no request can add bytes or publish a message referencing these objects.
    const claimed = await db.$transaction(async (tx) => {
      await lockActiveParticipants(tx, userId, undefined, today);
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "StaffChatUpload" WHERE "id" = ${candidate.id} AND "senderId" = ${userId} FOR UPDATE
      `);
      if (!rows.length) return null;
      const upload = await tx.staffChatUpload.findUnique({ where: { id: candidate.id } });
      if (!upload || upload.messageId || (!upload.deletionRequestedAt && upload.expiresAt > new Date())) return null;
      return tx.staffChatUpload.update({ where: { id: upload.id }, data: { deletionRequestedAt: new Date() } });
    }, transactionOptions);
    if (!claimed) continue;
    try {
      await removeStaffChatChunkUpload(claimed.id, uploadProvider(claimed), { signal: AbortSignal.timeout(10_000) });
      await db.staffChatUpload.deleteMany({ where: { id: claimed.id, messageId: null, deletionRequestedAt: { not: null } } });
    } catch {
      console.error("Staff chat expired upload cleanup pending");
    }
  }
}

/** Pure sender recovery by original request ID; published results survive peer retirement. */
export async function getStaffChatUploadStatus(userId: string, requestedRequestId: unknown, context: StaffChatContext = {}): Promise<ChatUploadStatus> {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  const requestId = parseStaffChatId(requestedRequestId);
  if (requestId.length < 8) throw new StaffChatError("파일 전송 정보가 올바르지 않습니다.");
  return db.$transaction(async tx => {
    await lockActiveParticipants(tx, userId, undefined, today);
    const upload = await tx.staffChatUpload.findUnique({ where: { senderId_requestId: { senderId: userId, requestId } }, select: {
      id: true, senderId: true, recipientId: true, size: true, uploadedParts: true, messageId: true, expiresAt: true, deletionRequestedAt: true,
    } });
    if (!upload || upload.senderId !== userId) throw new StaffChatError("파일 전송 정보를 찾을 수 없습니다.", 404);
    assertUploadAvailable(upload);
    const message = upload.messageId ? await tx.staffChatMessage.findFirst({ where: { id: upload.messageId, senderId: userId, recipientId: upload.recipientId }, select: messageSelect }) : null;
    if (upload.messageId && !message) throw new StaffChatError("메시지를 찾을 수 없습니다.", 404);
    const count = Math.ceil(upload.size / staffChatChunkSize), parts = upload.uploadedParts;
    if (!Array.isArray(parts) || parts.some(part => typeof part !== "number" || !Number.isInteger(part) || part < 0 || part >= count)) throw new StaffChatError("파일 전송 정보를 확인할 수 없습니다.", 503);
    return { uploadId: upload.id, uploadedParts: [...new Set(parts as number[])].sort((a, b) => a - b), ...(message ? { message: mapMessage(message) } : {}) };
  }, { isolationLevel: "RepeatableRead" });
}
