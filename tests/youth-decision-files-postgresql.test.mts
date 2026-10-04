import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
const disposableUrl = "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
async function setup() {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.DATABASE_URL !== disposableUrl || process.env.DIRECT_URL !== disposableUrl) throw Error("Youth file PG checks require the exact disposable CI database.");
  const [{ PrismaClient, Prisma }, { PrismaPg }, documents, uploads, cleanup] = await Promise.all([import("../src/generated/prisma/client.ts"), import("@prisma/adapter-pg"), import("../src/lib/youth-decision-documents.ts"), import("../src/lib/youth-decision-uploads.ts"), import("../src/lib/youth-decision-file-cleanup.ts")]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: disposableUrl, max: 4 }) }), prefix = "ci-youth-file-" + randomUUID();
  await db.department.create({ data: { id: prefix + "-dept", name: "합성 결정문 검증", code: prefix } });
  await db.position.create({ data: { id: prefix + "-position", name: "합성 검증", level: 1 } });
  const actor = await db.user.create({ data: { id: prefix + "-actor", name: "합성 직원", departmentId: prefix + "-dept", positionId: prefix + "-position", canManageYouth: true, canDownloadYouthDocuments: true } });
  const youth = await db.youth.create({ data: { id: prefix + "-youth", name: prefix, admissionDate: "2026-01-01", dischargeDate: "9999-12-31" } });
  const deleted: string[] = [], storage = { async deleteResourceStoredFile(ref: { storageKey: string }) { deleted.push(ref.storageKey); }, async resourceStoredFileExists() { return false; } };
  return { db, Prisma, prefix, actor, youth, documents, uploads, cleanup, storage, deleted, async dispose() {
    await db.youthDecisionFileCleanup.deleteMany({ where: { OR: [{ youthId: youth.id }, { storageKey: { startsWith: prefix } }] } });
    await db.youthDecisionUpload.deleteMany({ where: { actorId: actor.id } });
    await db.youthViewRequest.deleteMany({ where: { actorId: actor.id } });
    await db.youthMutationReceipt.deleteMany({ where: { actorId: actor.id } });
    await db.auditLog.deleteMany({ where: { actorId: actor.id } });
    await db.youth.delete({ where: { id: youth.id } });
    await db.user.delete({ where: { id: actor.id } }); await db.position.delete({ where: { id: prefix + "-position" } }); await db.department.delete({ where: { id: prefix + "-dept" } }); await db.$disconnect();
  } };
}
test("CI PG actual youth file consume/audit/receipt/queue rollback and unknown writer proof", { skip: process.env.GITHUB_ACTIONS !== "true", timeout: 60000 }, async () => {
  const s = await setup(); try {
    const now = new Date("2026-10-04T03:00:00Z"), ctx = { actorId: s.actor.id, db: s.db, now: () => now, storage: s.storage } as unknown as Parameters<typeof s.documents.attachYouthDecisionDocuments>[0];
    const ready = await s.db.youthDecisionUpload.create({ data: { actorId: s.actor.id, startRequestId: "pg-youth-upload", startPayloadHash: "a".repeat(64), targetYouthId: s.youth.id, originalName: "합성 결정문.pdf", mimeType: "application/pdf", size: 3, expectedSha256: "a".repeat(64), plaintextSha256: "a".repeat(64), storedSha256: "b".repeat(64), storedSize: 35, state: "ready", storageProvider: "local", stagingKey: s.prefix + "-staging", finalKey: s.prefix + "-final", expiresAt: new Date(now.getTime() + 100000), completedAt: now, finalizeWriteEvidence: "confirmed", hadUnknownWrite: true } });
    const failDb = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) {
      if (key === "auditLog") return new Proxy(target.auditLog, { get(delegate, name) { if (name === "create") return (args: Parameters<typeof delegate.create>[0]) => delegate.create({ ...args, data: { ...args.data, actorId: s.prefix + "-missing" } as unknown as typeof args.data }); const value = Reflect.get(delegate, name); return typeof value === "function" ? value.bind(delegate) : value; } });
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } })), options) } as unknown as NonNullable<typeof ctx.db>;
    const input = { requestId: "pg-youth-attach", expectedYouthUpdatedAt: s.youth.updatedAt.toISOString(), uploadIds: [ready.id] };
    await assert.rejects(s.documents.attachYouthDecisionDocuments({ ...ctx, db: failDb }, s.youth.id, input));
    assert.equal((await s.db.youthDecisionUpload.findUniqueOrThrow({ where: { id: ready.id } })).state, "ready"); assert.equal(await s.db.youthDecisionDocument.count({ where: { youthId: s.youth.id } }), 0); assert.equal(await s.db.youthDecisionFileCleanup.count({ where: { sourceUploadId: ready.id } }), 0); assert.equal(await s.db.youthMutationReceipt.count({ where: { actorId: s.actor.id } }), 0);
    const first = await s.documents.attachYouthDecisionDocuments(ctx, s.youth.id, input), replay = await s.documents.attachYouthDecisionDocuments(ctx, s.youth.id, input);
    assert.equal(replay.replayed, true); assert.equal(first.committedUpdatedAt, replay.committedUpdatedAt); assert.equal(await s.db.youthDecisionDocument.count({ where: { youthId: s.youth.id } }), 1);
    await assert.rejects(s.documents.attachYouthDecisionDocuments(ctx, s.youth.id, { ...input, requestId: "pg-youth-stale" }), { code: "YOUTH_CONFLICT" });
    const doc = await s.db.youthDecisionDocument.findFirstOrThrow({ where: { youthId: s.youth.id } });
    await s.documents.deleteYouthDecisionDocument(ctx, doc.id, { requestId: "pg-youth-delete", youthId: s.youth.id, expectedYouthUpdatedAt: first.committedUpdatedAt, expectedDocumentUpdatedAt: doc.updatedAt.toISOString() });
    const queues = await s.db.youthDecisionFileCleanup.findMany({ where: { sourceUploadId: ready.id } });
    assert.equal(queues.length, 2); assert.ok(queues.every(row => row.state === "pending" && row.lastErrorCode === "WRITE_PENDING")); assert.equal((await s.db.youthDecisionUpload.findUniqueOrThrow({ where: { id: ready.id } })).originalName, null);
    await s.db.youthDecisionFileCleanup.updateMany({ where: { sourceUploadId: ready.id }, data: { nextAttemptAt: now } });
    assert.equal((await s.cleanup.reconcileYouthDecisionFileQueue(ctx)).completed, 0); assert.ok(s.deleted.includes(ready.finalKey!));
    await s.db.user.update({ where: { id: s.actor.id }, data: { status: "INACTIVE" } }); await assert.rejects(s.uploads.getYouthDecisionUploadStatus(ctx, { id: ready.id }), { code: "UNAUTHORIZED" });
  } finally { await s.dispose(); }
});
test("CI PG youth ledger RLS zero policies, closed states and exact opaque extension proof", { skip: process.env.GITHUB_ACTIONS !== "true", timeout: 60000 }, async () => {
  const s = await setup(); try {
    const flags = await s.db.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; policies: bigint }>>(s.Prisma.sql`SELECT c.relname, c.relrowsecurity, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies FROM pg_class c WHERE c.relname IN ('YouthMutationReceipt','YouthViewRequest','YouthDecisionUpload','YouthDecisionFileCleanup')`);
    assert.equal(flags.length, 4); assert.ok(flags.every(row => row.relrowsecurity && Number(row.policies) === 0));
    const receipt = { actorId: s.actor.id, requestId: "pg-proof-extension", operation: "profile.extend", targetType: "Youth", targetId: s.youth.id, youthId: s.youth.id, payloadHash: "a".repeat(64), committedTargetsJson: { extensionId: "opaque-extension" } };
    await s.db.youthMutationReceipt.create({ data: receipt });
    await assert.rejects(s.db.youthMutationReceipt.create({ data: { ...receipt, requestId: "pg-invalid-proof", committedTargetsJson: { extensionId: "opaque-extension", reason: "MUST_NOT_PERSIST" } } }));
    await assert.rejects(s.db.youthMutationReceipt.create({ data: { ...receipt, requestId: "pg-invalid-operation", operation: "unknown" } }));
    await assert.rejects(s.db.youthMutationReceipt.updateMany({ where: { actorId: s.actor.id }, data: { state: "purged" } }));
    await s.db.youthMutationReceipt.updateMany({ where: { actorId: s.actor.id }, data: { state: "purged", payloadHash: null, committedUpdatedAt: null, committedTargetsJson: s.Prisma.DbNull, scrubbedAt: new Date() } });
    const stored = await s.db.youthMutationReceipt.findFirstOrThrow({ where: { actorId: s.actor.id } }); assert.equal(stored.committedTargetsJson, null); assert.equal(stored.payloadHash, null);
    await assert.rejects(s.db.youthViewRequest.create({ data: { actorId: s.actor.id, requestId: "pg-invalid-view", youthId: s.youth.id, kind: "decision-download" } }));
  } finally { await s.dispose(); }
});

test("CI PG actual reencrypt proven no-write resets to valid null evidence and retries one immutable attempt", { skip: process.env.GITHUB_ACTIONS !== "true", timeout: 60000 }, async () => {
  const s = await setup(); const previousKey = process.env.ATTACHMENT_ENCRYPTION_KEY;
  try {
    process.env.ATTACHMENT_ENCRYPTION_KEY = "a".repeat(64);
    await s.db.user.update({ where:{id:s.actor.id}, data:{role:"ADMIN"} });
    const doc = await s.db.youthDecisionDocument.create({data:{youthId:s.youth.id,originalName:"합성 결정문.pdf",mimeType:"application/pdf",size:3,storageProvider:"local",storageKey:s.prefix+"-legacy.pdf"}});
    const {reencryptYouthDecisionDocuments} = await import("../src/lib/youth-decision-reencrypt.ts");
    let failBeforeWrite = true, writes = 0;
    const storage = { ...s.storage,
      async readResourceStoredFile(_ref:unknown,input:{beforeExpose:()=>Promise<unknown>}) {await input.beforeExpose();return{encrypted:false,verifiedSha256:"a".repeat(64),size:3,body:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(3));controller.close();}})};},
      async reencryptResourceStoredFile(input:{size:number;wholeSha256:string;ivBase64:string}) {writes++;if(failBeforeWrite)throw Object.assign(Error("synthetic failure before write"),{writeEvidence:"none"});return{alreadyEncrypted:false,writeEvidence:"confirmed",size:input.size,wholeSha256:input.wholeSha256,storedSha256:"b".repeat(64),storedSize:input.size+32,encryptionIvBase64:input.ivBase64};},
    };
    const ctx = {actorId:s.actor.id,db:s.db,storage,now:()=>new Date("2026-10-04T03:00:00Z")} as unknown as Parameters<typeof reencryptYouthDecisionDocuments>[0];
    const first = await reencryptYouthDecisionDocuments(ctx);
    assert.equal(first.summary.failed,1);
    const attempt = await s.db.youthDecisionUpload.findFirstOrThrow({where:{actorId:s.actor.id}});
    assert.equal(attempt.state,"uploading");assert.equal(attempt.finalizeWriteEvidence,null);assert.equal(attempt.hadUnknownWrite,false);assert.equal(attempt.finalizeLeaseUntil,null);
    assert.equal(await s.db.youthDecisionFileCleanup.count({where:{youthId:s.youth.id}}),0);
    assert.equal((await s.db.youthDecisionDocument.findUniqueOrThrow({where:{id:doc.id}})).storageKey,doc.storageKey);
    await assert.rejects(s.db.youthDecisionUpload.update({where:{id:attempt.id},data:{finalizeWriteEvidence:"none"}}));
    failBeforeWrite=false;
    const second = await reencryptYouthDecisionDocuments(ctx);
    assert.equal(second.summary.encrypted,1);assert.equal(second.physicalCleanupComplete,false);assert.equal(writes,2);
    assert.equal(await s.db.youthDecisionUpload.count({where:{actorId:s.actor.id}}),1);
    const consumed = await s.db.youthDecisionUpload.findUniqueOrThrow({where:{id:attempt.id}});
    assert.equal(consumed.state,"consumed");assert.equal(consumed.finalKey,attempt.finalKey);assert.equal(consumed.finalizeIv,attempt.finalizeIv);
    assert.equal((await s.db.youthDecisionDocument.findUniqueOrThrow({where:{id:doc.id}})).storageKey,attempt.finalKey);
  } finally { if(previousKey===undefined)delete process.env.ATTACHMENT_ENCRYPTION_KEY;else process.env.ATTACHMENT_ENCRYPTION_KEY=previousKey;await s.dispose(); }
});
