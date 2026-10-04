import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
const ciUrl = "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
const ci = process.env.GITHUB_ACTIONS === "true";
async function setup() {
  if (!ci || process.env.DATABASE_URL !== ciUrl || process.env.DIRECT_URL !== ciUrl) throw Error("Draft recovery PostgreSQL tests require exact disposable CI database.");
  const [{ PrismaClient }, { PrismaPg }, domain, { getDefaultDocumentTemplateSchema }] = await Promise.all([import("../src/generated/prisma/client.ts"), import("@prisma/adapter-pg"), import("../src/lib/mobile-drafts.ts"), import("../src/lib/document-template-schema.ts")]);
  const prefix = "ci-draft-" + randomUUID(), db = new PrismaClient({ adapter: new PrismaPg({ connectionString: ciUrl, max: 4 }) });
  await db.department.create({ data: { id: prefix + "-dept", name: "합성 기안 검증", code: prefix } });
  await db.position.create({ data: { id: prefix + "-position", name: "합성 직원", level: 1 } });
  const actor = await db.user.create({ data: { id: prefix + "-actor", name: "합성 작성자", departmentId: prefix + "-dept", positionId: prefix + "-position" } });
  const template = await db.documentTemplate.create({ data: { id: prefix + "-template", name: "합성 일반 기안", schema: getDefaultDocumentTemplateSchema() } });
  const deps = { db, cache: () => undefined, generatePdf: async () => undefined, now: () => new Date("2026-10-04T03:00:00.000Z") };
  const body = (requestId: string, patch: object = {}) => ({ requestId, title: prefix, templateId: template.id, fieldValues: { content: "합성 업무 내용을 임시저장합니다." }, approverIds: [], uploadIds: [], intent: "draft" as const, expectedUpdatedAt: null, ...patch });
  return { prefix, db, actor, template, deps, body, domain, async dispose() {
    await db.approvalDocument.deleteMany({ where: { drafterId: actor.id } });
    await db.auditLog.deleteMany({ where: { actorId: actor.id } });
    await db.documentTemplate.delete({ where: { id: template.id } });
    await db.user.delete({ where: { id: actor.id } });
    await db.position.delete({ where: { id: prefix + "-position" } }); await db.department.delete({ where: { id: prefix + "-dept" } }); await db.$disconnect();
  } };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
function actorBarrier(s: Fixture) {
  let entered = 0, release = () => {}; const barrier = new Promise<void>(yes => { release = yes; });
  const db = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) {
    if (key === "$queryRaw") return async (...args: Parameters<typeof target.$queryRaw>) => { const result = await target.$queryRaw(...args), sql = args[0] as { strings?: string[] }; if (sql.strings?.join("").includes('FROM "User"') && entered < 2) { entered++; if (entered === 2) release(); await barrier; } return result; };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } })), options) } as unknown as typeof s.deps.db;
  return { db, entered: () => entered };
}
test("CI PostgreSQL draft same-key concurrent create commits one document and one immutable bound audit under actual locks", { skip: !ci, timeout: 60000 }, async () => {
  const s = await setup(); try {
    const pair = actorBarrier(s), body = s.body("pg-draft-concurrent-create"), deps = { ...s.deps, db: pair.db };
    const results = await Promise.all([s.domain.saveMobileDraft(s.actor.id, body, null, deps), s.domain.saveMobileDraft(s.actor.id, body, null, deps)]);
    assert.equal(pair.entered(), 2); assert.equal(results[0].documentId, results[1].documentId); assert.deepEqual(results[0].proof, results[1].proof);
    assert.equal(await s.db.approvalDocument.count({ where: { drafterId: s.actor.id } }), 1); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id } }), 1);
    const status = await s.domain.getMobileDraftRequestStatus(s.actor.id, body.requestId, null, s.deps);
    assert.equal(status.documentId, results[0].documentId); assert.equal(status.committedUpdatedAt, results[0].proof!.committedUpdatedAt); assert.equal(status.outcome, "present");
    await assert.rejects(s.domain.getMobileDraftRequestStatus(s.actor.id, body.requestId, results[0].documentId, s.deps), { code: "REQUEST_SCOPE_CONFLICT" });
    await assert.rejects(s.domain.saveMobileDraft(s.actor.id, { ...body, title: "다른 입력" }, null, s.deps), { code: "REQUEST_CONFLICT" });
  } finally { await s.dispose(); }
});
test("CI PostgreSQL draft commit-proof audit binding FK failure atomically rolls back document and audit", { skip: !ci, timeout: 60000 }, async () => {
  const s = await setup(); try {
    const badDb = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) {
      if (key === "auditLog") return new Proxy(target.auditLog, { get(delegate, name) { if (name === "update") return (args: Parameters<typeof delegate.update>[0]) => delegate.update({ ...args, data: { metadata: args.data.metadata, documentId: s.prefix + "-missing" } }); const value = Reflect.get(delegate, name); return typeof value === "function" ? value.bind(delegate) : value; } });
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } })), options) } as unknown as typeof s.deps.db;
    await assert.rejects(s.domain.saveMobileDraft(s.actor.id, s.body("pg-draft-binding-rollback"), null, { ...s.deps, db: badDb }), { code: "P2003" });
    assert.equal(await s.db.approvalDocument.count({ where: { drafterId: s.actor.id } }), 0); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id } }), 0);
  } finally { await s.dispose(); }
});
test("CI PostgreSQL draft delete keeps immutable target proof after actual SetNull and legacy replay never invents proof or recreates", { skip: !ci, timeout: 60000 }, async () => {
  const s = await setup(); try {
    const body = s.body("pg-draft-delete-recovery"), first = await s.domain.saveMobileDraft(s.actor.id, body, null, s.deps);
    await s.db.approvalDocument.delete({ where: { id: first.documentId } });
    const audit = await s.db.auditLog.findFirstOrThrow({ where: { actorId: s.actor.id, targetId: first.documentId } }); assert.equal(audit.documentId, null);
    const status = await s.domain.getMobileDraftRequestStatus(s.actor.id, body.requestId, null, s.deps);
    assert.equal(status.outcome, "deleted"); assert.equal(status.current, null); assert.equal(status.documentId, first.documentId); assert.equal(status.committedUpdatedAt, first.proof!.committedUpdatedAt);
    await assert.rejects(s.domain.saveMobileDraft(s.actor.id, body, null, s.deps), { code: "REQUEST_ALREADY_DELETED" }); assert.equal(await s.db.approvalDocument.count({ where: { drafterId: s.actor.id } }), 0);
    const legacyBody = s.body("pg-draft-legacy-replay"), legacy = await s.domain.saveMobileDraft(s.actor.id, legacyBody, null, s.deps);
    const oldAudit = await s.db.auditLog.findFirstOrThrow({ where: { actorId: s.actor.id, targetId: legacy.documentId } }), metadata = oldAudit.metadata as Record<string, unknown>;
    assert.ok(typeof metadata.mobileRequestId === "string" && typeof metadata.mobilePayloadHash === "string");
    await s.db.auditLog.update({ where: { id: oldAudit.id }, data: { metadata: { source: "mobile", mobileRequestId: metadata.mobileRequestId, mobilePayloadHash: metadata.mobilePayloadHash } } });
    const replay = await s.domain.saveMobileDraft(s.actor.id, legacyBody, null, s.deps);
    assert.deepEqual(Object.keys(replay).sort(), ["documentId", "status", "updatedAt"]); assert.equal(replay.documentId, legacy.documentId);
    await assert.rejects(s.domain.getMobileDraftRequestStatus(s.actor.id, legacyBody.requestId, null, s.deps), { code: "REQUEST_PROOF_UNAVAILABLE" });
  } finally { await s.dispose(); }
});
test("CI PostgreSQL draft concurrent CAS edits advance future token monotonically and current INACTIVE blocks replay and pure status before audit", { skip: !ci, timeout: 60000 }, async () => {
  const s = await setup(); try {
    const createBody = s.body("pg-draft-edit-original"), first = await s.domain.saveMobileDraft(s.actor.id, createBody, null, s.deps);
    const future = new Date("2030-01-01T00:00:00.000Z"); await s.db.approvalDocument.update({ where: { id: first.documentId }, data: { updatedAt: future } });
    const pair = actorBarrier(s), commands = [s.body("pg-draft-parallel-edit-a", { title: "첫 수정", expectedUpdatedAt: future.toISOString() }), s.body("pg-draft-parallel-edit-b", { title: "둘째 수정", expectedUpdatedAt: future.toISOString() })];
    const results = await Promise.allSettled(commands.map(body => s.domain.saveMobileDraft(s.actor.id, body, first.documentId, { ...s.deps, db: pair.db })));
    assert.equal(pair.entered(), 2); assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason.code, "DRAFT_CONFLICT");
    const successful = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof s.domain.saveMobileDraft>>>).value;
    assert.equal(successful.updatedAt, new Date(future.getTime() + 1).toISOString()); assert.equal(successful.proof!.committedUpdatedAt, successful.updatedAt); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id } }), 2);
    const immutable = await s.domain.getMobileDraftRequestStatus(s.actor.id, createBody.requestId, null, s.deps); assert.equal(immutable.committedUpdatedAt, first.proof!.committedUpdatedAt); assert.equal(immutable.current!.updatedAt, successful.updatedAt);
    await s.db.user.update({ where: { id: s.actor.id }, data: { status: "INACTIVE" } });
    let auditReads = 0; const retiredDb = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) { if (key === "auditLog") { auditReads++; throw Error("Inactive actor reached audit"); } const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; } })), options) } as unknown as typeof s.deps.db;
    await assert.rejects(s.domain.saveMobileDraft(s.actor.id, createBody, null, { ...s.deps, db: retiredDb }), { code: "UNAUTHORIZED" }); await assert.rejects(s.domain.getMobileDraftRequestStatus(s.actor.id, createBody.requestId, null, { ...s.deps, db: retiredDb }), { code: "UNAUTHORIZED" }); assert.equal(auditReads, 0);
  } finally { await s.dispose(); }
});
