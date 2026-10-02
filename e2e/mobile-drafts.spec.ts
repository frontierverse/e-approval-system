import { expect, test } from "@playwright/test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { getDefaultDocumentTemplateSchema } from "../src/lib/document-template-schema";

test("native draft API enforces ownership, retries, concurrency and attachment ownership", async ({ request }) => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(database.hostname) || !database.pathname.includes("test")) throw new Error("Mobile draft integration checks require an isolated local test database.");
  const suffix = randomUUID();
  const userIds: string[] = [], fileKeys: string[] = [];
  let templateId = "";
  const department = await prisma.department.findFirstOrThrow();
  const staffPosition = await prisma.position.findFirstOrThrow({ where: { name: { not: "시설장" } } });
  const headPosition = await prisma.position.findFirstOrThrow({ where: { name: "시설장" } });
  const makeUser = async (head = false) => {
    const user = await prisma.user.create({ data: { name: "E2E 앱 기안 " + suffix + (head ? " 시설장" : " 직원"), departmentId: department.id, positionId: head ? headPosition.id : staffPosition.id } });
    userIds.push(user.id);
    const token = randomBytes(32).toString("base64url");
    await prisma.mobileSession.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000 * 10) } });
    return { id: user.id, token };
  };
  try {
    const staff = await makeUser(), other = await makeUser(), head = await makeUser(true);
    const headers = { Authorization: "Bearer " + staff.token }, otherHeaders = { Authorization: "Bearer " + other.token };
    const template = await prisma.documentTemplate.create({ data: { name: "E2E 앱 양식 " + suffix, schema: getDefaultDocumentTemplateSchema() } });
    templateId = template.id;
    const payload = { requestId: randomUUID(), title: "모바일 검증 기안", templateId, fieldValues: { content: "앱에서 작성한 테스트 문서의 입력 내용입니다." }, approverIds: [head.id], uploadIds: [] as string[], intent: "draft", expectedUpdatedAt: null as string | null };
    expect((await request.get("/api/mobile/drafts/options")).status()).toBe(401);
    const options = await request.get("/api/mobile/drafts/options", { headers });
    expect(options.status()).toBe(200);
    expect((await options.json()).templates.some((t: { id: string }) => t.id === templateId)).toBe(true);
    const created = await Promise.all([request.post("/api/mobile/drafts", { headers, data: payload }), request.post("/api/mobile/drafts", { headers, data: payload })]);
    expect(created.map(r => r.status())).toEqual([200, 200]);
    const a = await created[0].json(), b = await created[1].json();
    expect(a.documentId).toBe(b.documentId);
    expect(await prisma.auditLog.count({ where: { documentId: a.documentId, action: "CREATE_DRAFT" } })).toBe(1);
    expect((await request.post("/api/mobile/drafts", { headers, data: { ...payload, title: "같은 요청 번호의 다른 내용" } })).status()).toBe(409);
    expect((await request.get("/api/mobile/drafts/" + a.documentId, { headers: otherHeaders })).status()).toBe(404);
    expect((await request.post("/api/mobile/drafts/" + a.documentId, { headers: otherHeaders, data: { ...payload, requestId: randomUUID(), expectedUpdatedAt: a.updatedAt } })).status()).toBe(404);
    const saved = await request.post("/api/mobile/drafts/" + a.documentId, { headers, data: { ...payload, requestId: randomUUID(), expectedUpdatedAt: a.updatedAt, title: "수정한 앱 기안" } });
    expect(saved.status()).toBe(200);
    const revision = await saved.json();
    expect((await request.post("/api/mobile/drafts/" + a.documentId, { headers, data: { ...payload, requestId: randomUUID(), expectedUpdatedAt: a.updatedAt } })).status()).toBe(409);
    const invalid = await request.post("/api/mobile/drafts/" + a.documentId, { headers, data: { ...payload, requestId: randomUUID(), expectedUpdatedAt: revision.updatedAt, fieldValues: { content: "" }, intent: "submit" } });
    expect(invalid.status()).toBe(400);
    expect((await prisma.approvalDocument.findUniqueOrThrow({ where: { id: a.documentId } })).status).toBe("DRAFT");

    const uploadId = randomUUID(), storageKey = randomUUID() + ".pdf";
    fileKeys.push(storageKey);
    await mkdir("uploads/attachments", { recursive: true });
    const bytes = Buffer.from("%PDF-1.4\nE2E attachment bytes\n");
    await writeFile(path.join("uploads/attachments", storageKey), bytes);
    await prisma.mobileDraftUpload.create({ data: { id: uploadId, userId: staff.id, originalName: "검증 자료.pdf", mimeType: "application/pdf", size: bytes.length, storageProvider: "local", storageKey, expiresAt: new Date(Date.now() + 60_000 * 10) } });
    expect((await request.post("/api/mobile/drafts/uploads/" + uploadId + "/complete", { headers: otherHeaders })).status()).toBe(404);
    const claimBeforeComplete = await request.post("/api/mobile/drafts", { headers, data: { ...payload, requestId: randomUUID(), uploadIds: [uploadId] } });
    expect(claimBeforeComplete.status()).toBe(400);
    for (let i = 0; i < 2; i++) expect((await request.post("/api/mobile/drafts/uploads/" + uploadId + "/complete", { headers })).status()).toBe(200);
    const submit = { ...payload, requestId: randomUUID(), title: "첨부 포함 앱 상신", expectedUpdatedAt: revision.updatedAt, uploadIds: [uploadId], intent: "submit" };
    const submitted = await Promise.all([request.post("/api/mobile/drafts/" + a.documentId, { headers, data: submit }), request.post("/api/mobile/drafts/" + a.documentId, { headers, data: submit })]);
    expect(submitted.map(r => r.status())).toEqual([200, 200]);
    expect((await submitted[0].json()).status).toBe("submitted");
    expect(await prisma.auditLog.count({ where: { documentId: a.documentId, action: "SUBMIT" } })).toBe(1);
    expect(await prisma.notification.count({ where: { documentId: a.documentId, userId: head.id, type: "APPROVAL_REQUESTED" } })).toBe(1);
    expect(await prisma.attachment.count({ where: { documentId: a.documentId, storageKey } })).toBe(1);
    expect((await request.delete("/api/mobile/drafts/uploads/" + uploadId, { headers })).status()).toBe(404);
    expect((await request.post("/api/mobile/drafts", { headers, data: { ...payload, requestId: randomUUID(), uploadIds: [uploadId] } })).status()).toBe(400);
    expect((await request.get("/api/mobile/drafts/" + a.documentId, { headers })).status()).toBe(404);
    await prisma.user.update({ where: { id: staff.id }, data: { status: "INACTIVE" } });
    expect((await request.get("/api/mobile/drafts", { headers })).status()).toBe(401);
  } finally {
    const attached = await prisma.attachment.findMany({ where: { document: { drafterId: { in: userIds } } }, select: { storageKey: true, storageProvider: true } });
    fileKeys.push(...attached.filter(a => a.storageProvider === "local").map(a => a.storageKey));
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.approvalDocument.deleteMany({ where: { drafterId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (templateId) await prisma.documentTemplate.delete({ where: { id: templateId } });
    const root = path.resolve("uploads/attachments");
    for (const key of new Set(fileKeys)) {
      const target = path.resolve(root, key);
      if (target.startsWith(root + path.sep)) await rm(target, { force: true });
    }
  }
});
