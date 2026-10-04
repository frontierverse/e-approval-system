import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const disposableUrl = "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
async function setup() {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.DATABASE_URL !== disposableUrl || process.env.DIRECT_URL !== disposableUrl) throw Error("Youth purge PG checks require the exact disposable CI database.");
  const [{ PrismaClient }, { PrismaPg }, mutations, queries, documents, purge] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("@prisma/adapter-pg"),
    import("../src/lib/youth-mobile-mutations.ts"), import("../src/lib/youth-mobile-queries.ts"),
    import("../src/lib/youth-decision-documents.ts"), import("../src/lib/youth-purge.ts"),
  ]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: disposableUrl, max: 4 }) });
  const prefix = "ci-youth-purge-" + randomUUID(), objects = new Set<string>(), deleted: string[] = [];
  let now = new Date("2026-10-04T03:00:00Z");
  let afterDelete: (key: string) => Promise<void> = async () => {};
  await db.department.create({ data: { id: prefix + "-dept", name: "합성 파기 검증", code: prefix } });
  await db.position.create({ data: { id: prefix + "-position", name: "합성 검증", level: 1 } });
  const actor = await db.user.create({ data: { id: prefix + "-actor", name: "합성 관리자", role: "ADMIN", departmentId: prefix + "-dept", positionId: prefix + "-position", canManageYouth: true, canDownloadYouthDocuments: true, canViewYouthDetails: true, canViewYouthContacts: true } });
  const storage = {
    async deleteResourceStoredFile(ref: { storageKey: string }) { deleted.push(ref.storageKey); objects.delete(ref.storageKey); await afterDelete(ref.storageKey); },
    async resourceStoredFileExists(ref: { storageKey: string }) { return objects.has(ref.storageKey); },
  };
  const context = { actorId: actor.id, db, now: () => now, storage } as unknown as Parameters<typeof purge.requestYouthPurge>[0];
  const input = { requestId: "pg-purge-create-request", name: prefix, admissionDate: "2026-01-01", dischargeDate: "9999-12-31", birthDate: "2009-01-01", phone: "010-1111-2222", familyContacts: [{ relationship: "합성 보호자", phone: "010-2222-3333" }], uploadIds: [] as string[] };
  const created = await mutations.createMobileYouth(context as Parameters<typeof mutations.createMobileYouth>[0], input), youthId = created.targetId;
  await queries.viewMobileYouth(context as Parameters<typeof queries.viewMobileYouth>[0], youthId, "contacts", "pg-purge-contact-view");
  async function file(indeterminate = false) {
    const upload = await db.youthDecisionUpload.create({ data: {
      actorId: actor.id, startRequestId: "pg-purge-upload-request", startPayloadHash: "a".repeat(64), targetYouthId: youthId,
      originalName: "합성 결정문.pdf", mimeType: "application/pdf", size: 3, expectedSha256: "a".repeat(64), plaintextSha256: "a".repeat(64), storedSha256: "b".repeat(64), storedSize: 35,
      state: "ready", storageProvider: "local", stagingKey: prefix + "-staging", finalKey: prefix + "-final", expiresAt: new Date(now.getTime() + 3600000), completedAt: now, finalizeWriteEvidence: "confirmed",
      ...(indeterminate ? { lastGrantExpiresAt: new Date(now.getTime() - 7200000), hadUnknownWrite: true } : {}),
    } });
    objects.add(upload.stagingKey!); objects.add(upload.finalKey!);
    const row = await db.youth.findUniqueOrThrow({ where: { id: youthId } });
    await documents.attachYouthDecisionDocuments(context as Parameters<typeof documents.attachYouthDecisionDocuments>[0], youthId, { requestId: "pg-purge-attach-request", expectedYouthUpdatedAt: row.updatedAt.toISOString(), uploadIds: [upload.id] });
    return upload;
  }
  async function due() { return db.youth.update({ where: { id: youthId }, data: { actualDischargeDate: "2020-06-01", caseClosedDate: "2020-07-01", retentionUntil: "2025-07-01" } }); }
  async function request(override = context) {
    const row = await db.youth.findUniqueOrThrow({ where: { id: youthId } });
    return purge.requestYouthPurge(override, youthId, { version: row.retentionVersion, confirmationName: row.name, reviewedCopies: true });
  }
  return { db, prefix, actor, youthId, input, context, purge, mutations, objects, deleted, file, due, request,
    advance(ms: number) { now = new Date(now.getTime() + ms); }, setAfterDelete(callback: typeof afterDelete) { afterDelete = callback; },
    async dispose() {
      await db.user.update({ where: { id: actor.id }, data: { profileImageStorageKey: null, profileImageStorageProvider: null, signatureImageStorageKey: null, signatureImageStorageProvider: null } });
      await db.dailyWorkReport.deleteMany({ where: { authorId: actor.id } });
      await db.youthDecisionFileCleanup.deleteMany({ where: { OR: [{ youthId }, { storageKey: { startsWith: prefix } }] } });
      await db.youthDecisionUpload.deleteMany({ where: { actorId: actor.id } });
      await db.youthViewRequest.deleteMany({ where: { actorId: actor.id } });
      await db.youthMutationReceipt.deleteMany({ where: { actorId: actor.id } });
      await db.auditLog.deleteMany({ where: { actorId: actor.id } });
      await db.youth.delete({ where: { id: youthId } });
      await db.user.delete({ where: { id: actor.id } }); await db.position.delete({ where: { id: prefix + "-position" } }); await db.department.delete({ where: { id: prefix + "-dept" } }); await db.$disconnect();
    },
  };
}
const options = { skip: process.env.GITHUB_ACTIONS !== "true", timeout: 60000 };

test("CI PG approved tracked purge uses real four-ledger CHECKs, rolls final scrub back, then retains opaque no-recreate proof", options, async () => {
  const s = await setup(); try {
    const upload = await s.file(); await s.due();
    const report = await s.db.dailyWorkReport.create({ data: { authorId: s.actor.id, workDate: new Date("2026-01-02T00:00:00Z"), mainContent: "보존할 일반 업무", youthReports: [{ youthId: s.youthId, youthName: s.input.name, content: "파기할 개인정보" }, { youthId: "unrelated-youth", youthName: "다른 합성", content: "보존" }] } });
    const failureDb = { $transaction: (operation: (tx: unknown) => Promise<unknown>, settings: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) {
      if (key === "auditLog") return new Proxy(target.auditLog, { get(delegate, name) {
        if (name === "create") return (args: Parameters<typeof delegate.create>[0]) => {
          const metadata = args.data.metadata as { changeType?: string } | undefined;
          return delegate.create(metadata?.changeType === "youth.retention.purged" ? { ...args, data: { ...args.data, actorId: s.prefix + "-missing" } as typeof args.data } : args);
        };
        const value = Reflect.get(delegate, name); return typeof value === "function" ? value.bind(delegate) : value;
      } });
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } })), settings) } as unknown as NonNullable<typeof s.context.db>;
    const first = await s.request({ ...s.context, db: failureDb });
    assert.equal(first.status, "pending"); assert.equal(first.progress.blockedReason, "PURGE_RETRY_REQUIRED");
    assert.equal((await s.db.youth.findUniqueOrThrow({ where: { id: s.youthId } })).birthDate, s.input.birthDate);
    const preserved = await s.db.youthDecisionUpload.findUniqueOrThrow({ where: { id: upload.id } });
    assert.equal(preserved.state, "consumed"); assert.equal(preserved.finalKey, upload.finalKey); assert.equal(preserved.originalName, upload.originalName);
    assert.equal(await s.db.youthMutationReceipt.count({ where: { youthId: s.youthId, state: "purged" } }), 0);
    assert.equal((await s.db.dailyWorkReport.findUniqueOrThrow({ where: { id: report.id } })).version, 1);
    const queues = await s.db.youthDecisionFileCleanup.findMany({ where: { youthId: s.youthId } }); assert.equal(queues.length, 2); assert.ok(queues.every(row => row.state === "done" && row.sourceUploadId === upload.id && row.storageKey));
    s.advance(3600001);
    const complete = await s.request(); assert.equal(complete.status, "complete"); assert.equal(complete.progress.canRetry, false);
    const parent = await s.db.youth.findUniqueOrThrow({ where: { id: s.youthId } }); assert.ok(parent.purgedAt); assert.equal(parent.birthDate, null); assert.equal(parent.phone, null);
    assert.equal(await s.db.youthDecisionDocument.count({ where: { youthId: s.youthId } }), 0); assert.equal(await s.db.youthFamilyContact.count({ where: { youthId: s.youthId } }), 0);
    const tombstone = await s.db.youthDecisionUpload.findUniqueOrThrow({ where: { id: upload.id } });
    assert.equal(tombstone.state, "purged"); assert.equal(tombstone.actorId, s.actor.id); assert.equal(tombstone.startRequestId, upload.startRequestId); assert.ok(tombstone.scrubbedAt);
    for (const key of ["startPayloadHash", "originalName", "mimeType", "size", "expectedSha256", "plaintextSha256", "storedSha256", "storedSize", "finalizeIv", "stagingKey", "finalKey"] as const) assert.equal(tombstone[key], null, key);
    const views = await s.db.youthViewRequest.findMany({ where: { youthId: s.youthId } }); assert.equal(views.length, 1); assert.ok(views.every(row => row.state === "purged" && !row.sourceUpdatedAt && !row.auditLogId && !row.disclosureUntil && row.scrubbedAt));
    const receipts = await s.db.youthMutationReceipt.findMany({ where: { youthId: s.youthId } }); assert.equal(receipts.length, 2); assert.ok(receipts.every(row => row.state === "purged" && row.payloadHash === null && row.committedTargetsJson === null && row.scrubbedAt));
    const cleanedReport = await s.db.dailyWorkReport.findUniqueOrThrow({ where: { id: report.id } }); assert.equal(cleanedReport.version, 2); assert.equal(cleanedReport.mainContent, "보존할 일반 업무"); assert.deepEqual(cleanedReport.youthReports, [{ youthId: "unrelated-youth", youthName: "다른 합성", content: "보존" }]);
    assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id, metadata: { path: ["changeType"], equals: "youth.retention.purged" } } }), 1);
    await assert.rejects(s.mutations.createMobileYouth(s.context as Parameters<typeof s.mutations.createMobileYouth>[0], s.input), { code: "REQUEST_CONFLICT" });
  } finally { await s.dispose(); }
});

test("CI PG expired signed grant and unknown writer stay pending after repeated delete/absence; another owner stays intact", options, async () => {
  const s = await setup(); try {
    const upload = await s.file(true); await s.due();
    await s.db.user.update({ where: { id: s.actor.id }, data: { signatureImageStorageProvider: "local", signatureImageStorageKey: upload.finalKey } });
    const first = await s.request(); assert.equal(first.status, "pending"); assert.equal(first.progress.blockedReason, "WRITE_PENDING"); assert.equal(first.progress.canRetry, false);
    assert.ok(s.objects.has(upload.finalKey!)); assert.ok(!s.deleted.includes(upload.finalKey!));
    const stage = await s.db.youthDecisionFileCleanup.findUniqueOrThrow({ where: { storageProvider_storageKey: { storageProvider: "local", storageKey: upload.stagingKey! } } }); assert.equal(stage.state, "pending"); assert.equal(stage.lastErrorCode, "WRITE_PENDING");
    s.objects.add(upload.stagingKey!); s.advance(3600001);
    const second = await s.request(); assert.equal(second.status, "pending"); assert.equal(second.progress.blockedReason, "WRITE_PENDING");
    assert.ok(!s.objects.has(upload.stagingKey!)); assert.ok(s.objects.has(upload.finalKey!));
    assert.ok(s.deleted.filter(key => key === upload.stagingKey).length >= 2);
    assert.equal((await s.db.youth.findUniqueOrThrow({ where: { id: s.youthId } })).purgedAt, null);
    assert.equal((await s.db.youthDecisionUpload.findUniqueOrThrow({ where: { id: upload.id } })).hadUnknownWrite, true);
    assert.equal(await s.db.youthMutationReceipt.count({ where: { youthId: s.youthId, state: "purged" } }), 0);
    assert.ok((await s.db.youthDecisionFileCleanup.findMany({ where: { youthId: s.youthId } })).every(row => row.state !== "done" && row.storageKey));
  } finally { await s.dispose(); }
});

test("CI PG newer parent claim acquired during provider callback fences stale purge result and final scrub", options, async () => {
  const s = await setup(); try {
    const upload = await s.file(); await s.due(); let replacementVersion = 0;
    const replacementLease = new Date("2026-10-04T04:00:00Z");
    s.setAfterDelete(async key => {
      if (key !== upload.finalKey || replacementVersion) return;
      const row = await s.db.youth.update({ where: { id: s.youthId }, data: { retentionVersion: { increment: 1 }, purgeLeaseUntil: replacementLease } }); replacementVersion = row.retentionVersion;
    });
    const stale = await s.request(); assert.equal(stale.status, "pending"); assert.equal(stale.retentionVersion, replacementVersion); assert.equal(stale.progress.phase, "running");
    const row = await s.db.youth.findUniqueOrThrow({ where: { id: s.youthId } }); assert.equal(row.retentionVersion, replacementVersion); assert.equal(row.purgeLeaseUntil?.toISOString(), replacementLease.toISOString()); assert.equal(row.purgedAt, null); assert.equal(row.phone, s.input.phone);
    assert.equal(await s.db.youthDecisionDocument.count({ where: { youthId: s.youthId } }), 1); assert.equal(await s.db.youthMutationReceipt.count({ where: { youthId: s.youthId, state: "purged" } }), 0);
    assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id, metadata: { path: ["changeType"], equals: "youth.retention.purged" } } }), 0);
    const final = await s.db.youthDecisionFileCleanup.findUniqueOrThrow({ where: { storageProvider_storageKey: { storageProvider: "local", storageKey: upload.finalKey! } } }); assert.equal(final.state, "pending"); assert.equal(final.lastErrorCode, "LIVE_REFERENCE");
  } finally { await s.dispose(); }
});
