import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import {
  persistAttachmentFiles, prepareAttachmentFiles, readStoredAttachmentFile,
  removeStoredAttachmentFiles, type PreparedAttachmentFile,
} from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import { mapMessage, messageSelect } from "@/lib/staff-chat";
import { getStaffChatToday, parseStaffChatId, parseStaffChatSend, StaffChatError } from "@/lib/staff-chat-core";
import { publishStaffChatChange } from "@/lib/staff-chat-events";
import { staffChatFileLeaseMs, staffChatFileMaxBytes } from "@/lib/staff-chat-file-core";
import type { ChatFilePolicy, ChatMessage } from "@/lib/staff-chat-types";

const attachmentSelect = {
  id: true, messageId: true, originalName: true, mimeType: true, size: true,
  fileDigest: true, storageKey: true, storageProvider: true,
  downloadRequestId: true, downloadToken: true, downloadExpiresAt: true,
  downloadedAt: true, deletionRequestedAt: true, deletedAt: true,
  message: { select: messageSelect },
} satisfies Prisma.StaffChatAttachmentSelect;
type AttachmentRecord = Prisma.StaffChatAttachmentGetPayload<{ select: typeof attachmentSelect }>;
const uploadMessageSelect = { ...messageSelect, attachment: { select: attachmentSelect } } satisfies Prisma.StaffChatMessageSelect;
type UploadMessageRecord = Prisma.StaffChatMessageGetPayload<{ select: typeof uploadMessageSelect }>;

export async function getStaffChatFilePolicy(): Promise<ChatFilePolicy> {
  const policy = await getAttachmentPolicy();
  return {
    maxFileSize: Math.min(staffChatFileMaxBytes, Math.floor(policy.maxFileSizeMb * 1024 * 1024)),
    maxFileCount: 1,
    allowedExtensions: policy.allowedExtensions,
  };
}

export async function sendStaffChatFile(userId: string, form: FormData): Promise<ChatMessage> {
  const entries = form.getAll("file");
  if (entries.length !== 1 || typeof entries[0] === "string" || entries[0].size <= 0) {
    throw new StaffChatError("전송할 파일을 한 개 선택해 주세요.");
  }
  for (const field of ["peerId", "body", "requestId"]) {
    if (form.getAll(field).length > 1) throw new StaffChatError("파일 전송 정보가 올바르지 않습니다.");
  }
  const input = entries[0];
  if (input.size > staffChatFileMaxBytes) throw new StaffChatError("파일은 4MB 이하만 전송할 수 있습니다.", 413);
  if (/[\x00-\x1f\x7f]/.test(input.name) || input.type.length > 255) {
    throw new StaffChatError("파일 이름이나 형식이 올바르지 않습니다.");
  }
  const policy = await getStaffChatFilePolicy();
  const prepared = await prepareAttachmentFiles(entries, {
    maxFileCount: 1, maxFileSizeMb: policy.maxFileSize / 1024 / 1024, allowedExtensions: policy.allowedExtensions,
  }, { storageKeyPrefix: "staff-chat/" });
  if (prepared.error || prepared.files.length !== 1) throw new StaffChatError(prepared.error || "전송할 파일을 선택해 주세요.");
  const file = prepared.files[0];
  const rawBody = form.get("body");
  if (rawBody !== null && typeof rawBody !== "string") throw new StaffChatError("메시지 정보가 올바르지 않습니다.");
  const { peerId, body, requestId } = parseStaffChatSend({
    peerId: form.get("peerId"), requestId: form.get("requestId"), body: rawBody?.trim() || `파일: ${file.originalName}`,
  }, userId);
  const fileDigest = createHash("sha256").update(file.buffer).digest("hex");
  const uniqueRequest = { senderId_requestId: { senderId: userId, requestId } };
  const existing = await prisma.staffChatMessage.findUnique({ where: uniqueRequest, select: uploadMessageSelect });
  if (existing) return reuseFileMessage(existing, peerId, body, file, fileDigest);

  let message: UploadMessageRecord;
  try {
    // Check eligibility before persisting bytes, then lock and re-check it during
    // message creation so a concurrent employee deactivation cannot race send.
    await prisma.$transaction((tx) => lockActiveParticipants(tx, userId, peerId));
    await persistAttachmentFiles([file]);
    message = await prisma.$transaction(async (tx) => {
      await lockActiveParticipants(tx, userId, peerId);
      return tx.staffChatMessage.create({
        data: {
          senderId: userId, recipientId: peerId, body, requestId,
          attachment: { create: {
            originalName: file.originalName, mimeType: file.mimeType, size: file.size, fileDigest,
            storageProvider: file.storageProvider, storageKey: file.storageKey,
          } },
        },
        select: uploadMessageSelect,
      });
    });
  } catch (error) {
    // Includes ambiguous storage-write failures, not just database failures.
    await removeStoredAttachmentFiles([file], { signal: AbortSignal.timeout(10_000) }).catch(() => { console.error("Staff chat orphan file cleanup failed"); });
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await prisma.staffChatMessage.findUnique({ where: uniqueRequest, select: uploadMessageSelect });
    if (!raced) throw error;
    return reuseFileMessage(raced, peerId, body, file, fileDigest);
  }
  await publishStaffChatChange([userId, peerId]);
  return mapMessage(message);
}

function reuseFileMessage(existing: UploadMessageRecord, peerId: string, body: string, file: PreparedAttachmentFile, digest: string): ChatMessage {
  const attachment = existing.attachment;
  if (existing.recipientId !== peerId || existing.body !== body || !attachment
    || attachment.originalName !== file.originalName || attachment.mimeType !== file.mimeType
    || attachment.size !== file.size || attachment.fileDigest !== digest) {
    throw new StaffChatError("전송 요청이 다른 메시지에 이미 사용되었습니다. 다시 전송해 주세요.", 409);
  }
  return mapMessage(existing);
}

async function lockActiveParticipants(tx: Prisma.TransactionClient, actorId: string, peerId?: string): Promise<void> {
  const participants = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "User"
    WHERE "id" IN (${actorId}, ${peerId ?? actorId}) AND "status" = 'ACTIVE'
      AND ("resignationDate" IS NULL OR "resignationDate" > ${getStaffChatToday()})
    ORDER BY "id" FOR SHARE
  `);
  if (!participants.some((participant) => participant.id === actorId)) throw new StaffChatError("인증이 필요합니다.", 401);
  if (peerId && !participants.some((participant) => participant.id === peerId)) {
    throw new StaffChatError("현재 메시지를 받을 수 없는 직원입니다.", 404);
  }
}

async function lockParticipantAttachment(tx: Prisma.TransactionClient, userId: string, id: string): Promise<AttachmentRecord> {
  await lockActiveParticipants(tx, userId);
  // Both the authorization predicate and row lock are in SQL. Administrators
  // receive no override, and all lease/consume decisions occur under this lock.
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a."id" FROM "StaffChatAttachment" a
    JOIN "StaffChatMessage" m ON m."id" = a."messageId"
    WHERE a."id" = ${id} AND (m."senderId" = ${userId} OR m."recipientId" = ${userId})
    FOR UPDATE OF a
  `);
  if (!rows.length) throw new StaffChatError("파일을 찾을 수 없습니다.", 404);
  const attachment = await tx.staffChatAttachment.findUnique({ where: { id }, select: attachmentSelect });
  if (!attachment) throw new StaffChatError("파일을 찾을 수 없습니다.", 404);
  return attachment;
}

function parseDownloadValue(value: unknown, key: "requestId" | "token"): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StaffChatError("파일 요청 정보가 올바르지 않습니다.");
  const parsed = parseStaffChatId((value as Record<string, unknown>)[key]);
  if (parsed.length < 8) throw new StaffChatError("파일 요청 정보가 올바르지 않습니다.");
  return parsed;
}

export async function downloadStaffChatFile(userId: string, requestedId: unknown, value: unknown): Promise<Response> {
  const id = parseStaffChatId(requestedId);
  const requestId = parseDownloadValue(value, "requestId");
  const { attachment, token } = await prisma.$transaction(async (tx) => {
    const attachment = await lockParticipantAttachment(tx, userId, id);
    if (attachment.deletedAt || attachment.deletionRequestedAt || !attachment.storageKey) {
      throw new StaffChatError("수신자가 다운로드하여 삭제된 파일입니다.", 410);
    }
    if (attachment.message.senderId === userId) return { attachment, token: null };
    const now = new Date();
    if (attachment.downloadExpiresAt && attachment.downloadExpiresAt > now && attachment.downloadRequestId !== requestId) {
      throw new StaffChatError("다른 창에서 파일을 받고 있습니다. 잠시 후 다시 시도해 주세요.", 409);
    }
    const token = attachment.downloadRequestId === requestId && attachment.downloadToken ? attachment.downloadToken : randomUUID();
    await tx.staffChatAttachment.update({
      where: { id }, data: { downloadRequestId: requestId, downloadToken: token, downloadExpiresAt: new Date(now.getTime() + staffChatFileLeaseMs) },
    });
    return { attachment, token };
  });
  try {
    const file = await readStoredAttachmentFile({ storageKey: attachment.storageKey!, storageProvider: attachment.storageProvider });
    if (file.size !== attachment.size) {
      await file.body.cancel();
      throw new StaffChatError("파일을 온전히 읽지 못했습니다. 다시 시도해 주세요.", 503);
    }
    const headers = new Headers({
      "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
      "Content-Type": "application/octet-stream", "Content-Length": String(attachment.size),
      "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.originalName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    });
    if (token) headers.set("X-Chat-Download-Token", token);
    return new Response(file.body, { headers });
  } catch (error) {
    if (token) {
      await prisma.staffChatAttachment.updateMany({
        where: { id, downloadToken: token, deletionRequestedAt: null, deletedAt: null },
        data: { downloadExpiresAt: new Date(0) },
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function completeStaffChatFileDownload(userId: string, requestedId: unknown, value: unknown): Promise<ChatMessage> {
  const id = parseStaffChatId(requestedId);
  const token = parseDownloadValue(value, "token");
  const attachment = await prisma.$transaction(async (tx) => {
    const attachment = await lockParticipantAttachment(tx, userId, id);
    if (attachment.message.recipientId !== userId) throw new StaffChatError("파일을 찾을 수 없습니다.", 404);
    if (attachment.downloadToken !== token) throw new StaffChatError("다운로드 확인 정보가 만료되었습니다. 다시 시도해 주세요.", 409);
    if (attachment.deletedAt || attachment.deletionRequestedAt) return attachment;
    const now = new Date();
    return tx.staffChatAttachment.update({
      where: { id }, data: { downloadedAt: now, deletionRequestedAt: now, downloadExpiresAt: null }, select: attachmentSelect,
    });
  });
  // The durable pending state commits before external storage removal. A failure
  // keeps its storage references for retry and never advertises false deletion.
  await deleteConsumedAttachment(attachment);
  const message = await prisma.staffChatMessage.findUnique({ where: { id: attachment.messageId }, select: messageSelect });
  if (!message) throw new StaffChatError("메시지를 찾을 수 없습니다.", 404);
  return mapMessage(message);
}

async function deleteConsumedAttachment(attachment: AttachmentRecord, signal = AbortSignal.timeout(10_000)): Promise<void> {
  if (attachment.deletedAt) return;
  if (!attachment.deletionRequestedAt || !attachment.storageKey) throw new Error("Invalid staff chat deletion state");
  try {
    await removeStoredAttachmentFiles([{ storageKey: attachment.storageKey, storageProvider: attachment.storageProvider }], { signal });
    const changed = await prisma.staffChatAttachment.updateMany({
      where: { id: attachment.id, deletedAt: null, deletionRequestedAt: { not: null }, storageKey: attachment.storageKey },
      data: { deletedAt: new Date(), storageKey: null, storageProvider: null, downloadExpiresAt: null },
    });
    if (changed.count) await publishStaffChatChange([attachment.message.senderId, attachment.message.recipientId]);
  } catch {
    throw new StaffChatError("파일 수신은 완료했지만 저장소 삭제를 마치지 못했습니다. 삭제를 다시 시도해 주세요.", 503);
  }
}

export async function retryPendingStaffChatFileDeletes(userId: string): Promise<void> {
  const pending = await prisma.staffChatAttachment.findMany({
    where: { deletedAt: null, deletionRequestedAt: { not: null }, message: { OR: [{ senderId: userId }, { recipientId: userId }] } },
    orderBy: { deletionRequestedAt: "asc" }, take: 3, select: attachmentSelect,
  });
  // Storage trouble must not stall the primary conversation. Aborted deletions
  // keep their durable pending record and retry on a later chat refresh.
  const signal = AbortSignal.timeout(2_000);
  await Promise.allSettled(pending.map((attachment) => deleteConsumedAttachment(attachment, signal)));
}
