import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
const ciUrl = "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
function disposable() { if (process.env.GITHUB_ACTIONS !== "true" || process.env.DATABASE_URL !== ciUrl || process.env.DIRECT_URL !== ciUrl) throw Error("Youth PostgreSQL tests require the exact disposable CI database."); }
async function setup() {
  disposable(); const [{ PrismaClient, Prisma }, { PrismaPg }, mutations, queries] = await Promise.all([import("../src/generated/prisma/client.ts"), import("@prisma/adapter-pg"), import("../src/lib/youth-mobile-mutations.ts"), import("../src/lib/youth-mobile-queries.ts")]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: ciUrl, max: 4 }) }), prefix = "ci-youth-mobile-" + randomUUID();
  await db.department.create({ data: { id: prefix + "-dept", name: "청소년 합성 검증", code: prefix } }); await db.position.create({ data: { id: prefix + "-position", name: "합성 직원", level: 1 } });
  const actor = await db.user.create({ data: { id: prefix + "-actor", name: "합성 직원", departmentId: prefix + "-dept", positionId: prefix + "-position", canManageYouth: true, canViewYouthDetails: true, canViewYouthContacts: true } });
  return { db, Prisma, prefix, actor, mutations, queries, async dispose() { const receipts = await db.youthMutationReceipt.findMany({ where: { actorId: actor.id } }), ids = receipts.map(row => row.youthId).filter((id): id is string => Boolean(id)); await db.youth.deleteMany({ where: { OR: [{ id: { in: ids } }, { name: { startsWith: prefix } }] } }); await db.youthMutationReceipt.deleteMany({ where: { actorId: actor.id } }); await db.youthViewRequest.deleteMany({ where: { actorId: actor.id } }); await db.auditLog.deleteMany({ where: { actorId: actor.id } }); await db.user.delete({ where: { id: actor.id } }); await db.position.delete({ where: { id: prefix + "-position" } }); await db.department.delete({ where: { id: prefix + "-dept" } }); await db.$disconnect(); } };
}
const value = (name: string, requestId: string) => ({ name, requestId, admissionDate: "2026-01-01", dischargeDate: "9999-12-31", birthDate: "2009-01-01", phone: "010-1111-2222", familyContacts: [{ relationship: "합성 보호자", phone: "010-2222-3333" }], uploadIds: [] as string[] });
test("CI PostgreSQL real youth profile CAS, stable audit windows, receipts, rollback and tombstone", { skip: process.env.GITHUB_ACTIONS !== "true", timeout: 60000 }, async () => {
  const s = await setup(); try {
    let now = new Date("2026-10-04T03:00:00Z"); const context = { actorId: s.actor.id, db: s.db, now: () => now }, input = value(s.prefix + "-student", "pg-youth-create");
    const created = await s.mutations.createMobileYouth(context, input), id = created.targetId, baseline = created.committedUpdatedAt!;
    const replay = await s.mutations.createMobileYouth(context, input); assert.equal(replay.targetId, id); assert.equal(replay.replayed, true); assert.equal(await s.db.youthMutationReceipt.count({ where: { actorId: s.actor.id } }), 1);
    const updated = await s.mutations.patchMobileYouth(context, id, { requestId: "pg-youth-patch", expectedUpdatedAt: baseline, patch: { name: s.prefix + "-edited" } }); assert.equal(updated.committedUpdatedAt, new Date(now.getTime() + 1).toISOString());
    const row = await s.db.youth.findUniqueOrThrow({ where: { id } }); assert.equal(row.birthDate, input.birthDate); assert.equal(row.phone, input.phone); assert.equal(await s.db.youthFamilyContact.count({ where: { youthId: id } }), 1);
    await assert.rejects(s.mutations.patchMobileYouth(context, id, { requestId: "pg-youth-stale", expectedUpdatedAt: baseline, patch: { name: row.name } }), { code: "YOUTH_CONFLICT" });
    const first = await s.queries.viewMobileYouth(context, id, "details", "pg-detail-first"); now = new Date(now.getTime() + 120000); const second = await s.queries.viewMobileYouth(context, id, "details", "pg-detail-second"); assert.equal(first.auditedAt, second.auditedAt); assert.notEqual(first.disclosureUntil, second.disclosureUntil); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id, action: "VIEW_YOUTH_DETAIL" } }), 1);
    await s.queries.viewMobileYouth(context, id, "contacts", "pg-contact-A"); await s.queries.viewMobileYouth(context, id, "contacts", "pg-contact-A"); await s.queries.viewMobileYouth(context, id, "contacts", "pg-contact-B"); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id, action: "VIEW_YOUTH_CONTACT" } }), 2);
    const ledgers = await s.db.youthViewRequest.findMany({ where: { actorId: s.actor.id } }); assert.doesNotMatch(JSON.stringify(ledgers), /010-|2009-|합성 보호자/);
    const badDb = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) { if (key === "auditLog") return new Proxy(target.auditLog, { get(delegate, name) { if (name === "create") return (args: Parameters<typeof delegate.create>[0]) => delegate.create({ ...args, data: { ...args.data, actorId: s.prefix + "-missing" } }); const v = Reflect.get(delegate, name); return typeof v === "function" ? v.bind(delegate) : v; } }); const v = Reflect.get(target, key); return typeof v === "function" ? v.bind(target) : v; } })), options) } as unknown as NonNullable<Parameters<typeof s.mutations.patchMobileYouth>[0]["db"]>;
    await assert.rejects(s.mutations.patchMobileYouth({ ...context, db: badDb }, id, { requestId: "pg-audit-rollback", expectedUpdatedAt: row.updatedAt.toISOString(), patch: { phone: null } })); assert.equal((await s.db.youth.findUniqueOrThrow({ where: { id } })).phone, input.phone); assert.equal(await s.db.youthMutationReceipt.count({ where: { actorId: s.actor.id, requestId: "pg-audit-rollback" } }), 0);
    await s.db.youthMutationReceipt.updateMany({ where: { actorId: s.actor.id, requestId: input.requestId }, data: { state: "purged", payloadHash: null, committedUpdatedAt: null, committedTargetsJson: s.Prisma.DbNull, scrubbedAt: now } }); await assert.rejects(s.mutations.createMobileYouth(context, input), { code: "REQUEST_CONFLICT" });
    await s.db.user.update({ where: { id: s.actor.id }, data: { status: "INACTIVE" } }); await assert.rejects(s.queries.getMobileYouthDetail(context, id), { code: "UNAUTHORIZED" });
  } finally { await s.dispose(); }
});
test("CI PostgreSQL concurrent same-key create and logical view serialize with one object/audit", { skip: process.env.GITHUB_ACTIONS !== "true", timeout: 60000 }, async () => {
  const s = await setup(); try {
    function pairStore() { let entered = 0, release: () => void = () => {}; const barrier = new Promise<void>(yes => { release = yes; }); return { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(async tx => operation(new Proxy(tx, { get(target, key) { if (key === "$queryRaw") return async (...args: Parameters<typeof target.$queryRaw>) => { const result = await target.$queryRaw(...args), sql = args[0] as { strings?: string[] }; if (sql.strings?.join("").includes('FROM "User"') && entered < 2) { entered++; if (entered === 2) release(); await barrier; } return result; }; const result = Reflect.get(target, key); return typeof result === "function" ? result.bind(target) : result; } })), options) }; }
    const now = new Date("2026-10-04T03:00:00Z"), context = { actorId: s.actor.id, db: pairStore(), now: () => now } as unknown as Parameters<typeof s.mutations.createMobileYouth>[0], input = value(s.prefix + "-concurrent", "pg-parallel-create");
    const created = await Promise.all([s.mutations.createMobileYouth(context, input), s.mutations.createMobileYouth(context, input)]); assert.equal(created[0].targetId, created[1].targetId); assert.equal(created.filter(row => row.replayed).length, 1); assert.equal(await s.db.youth.count({ where: { name: input.name } }), 1); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id, action: "CREATE_YOUTH" } }), 1);
    const viewContext = { ...context, db: pairStore() as typeof context.db }, viewed = await Promise.all([s.queries.viewMobileYouth(viewContext, created[0].targetId, "details", "pg-parallel-view"), s.queries.viewMobileYouth(viewContext, created[0].targetId, "details", "pg-parallel-view")]); assert.equal(viewed.filter(row => row.replayed).length, 1); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id, action: "VIEW_YOUTH_DETAIL" } }), 1); assert.equal(await s.db.youthViewRequest.count({ where: { actorId: s.actor.id, requestId: "pg-parallel-view" } }), 1);
  } finally { await s.dispose(); }
});

test("CI PostgreSQL approved tracked no-file purge atomically scrubs new ledgers and preserves no-recreate tombstones", { skip: process.env.GITHUB_ACTIONS !== "true", timeout: 60000 }, async () => {
  const s = await setup(); try {
    const purge = await import("../src/lib/youth-purge.ts");
    await s.db.user.update({ where: { id: s.actor.id }, data: { role: "ADMIN" } });
    const context = { actorId: s.actor.id, db: s.db }, input = value(s.prefix + "-purge", "pg-purge-create-request");
    const created = await s.mutations.createMobileYouth(context, input);
    await s.queries.viewMobileYouth(context, created.targetId, "contacts", "pg-purge-view-request");
    await s.db.youth.update({ where: { id: created.targetId }, data: { actualDischargeDate: "2020-06-01", caseClosedDate: "2020-07-01", retentionUntil: "2025-07-01" } });
    const before = await s.db.youth.findUniqueOrThrow({ where: { id: created.targetId } });
    const result = await purge.requestYouthPurge(context, before.id, { version: before.retentionVersion, confirmationName: before.name, reviewedCopies: true });
    assert.equal(result.status, "complete"); const after = await s.db.youth.findUniqueOrThrow({ where: { id: before.id } });
    assert.ok(after.purgedAt); assert.equal(after.birthDate, null); assert.equal(after.phone, null); assert.equal(await s.db.youthFamilyContact.count({ where: { youthId: before.id } }), 0);
    const receipt = await s.db.youthMutationReceipt.findUniqueOrThrow({ where: { actorId_requestId: { actorId: s.actor.id, requestId: input.requestId } } });
    assert.equal(receipt.state, "purged"); assert.equal(receipt.payloadHash, null); assert.equal(receipt.committedUpdatedAt, null); assert.equal(receipt.committedTargetsJson, null); assert.ok(receipt.scrubbedAt);
    const views = await s.db.youthViewRequest.findMany({ where: { actorId: s.actor.id, youthId: before.id } }); assert.equal(views.length, 1); assert.equal(views[0].state, "purged"); assert.equal(views[0].sourceUpdatedAt, null); assert.equal(views[0].auditLogId, null); assert.equal(views[0].disclosureUntil, null);
    await assert.rejects(s.mutations.createMobileYouth(context, input), { code: "REQUEST_CONFLICT" }); assert.equal(await s.db.youth.count({ where: { id: before.id } }), 1);
    await assert.rejects(s.queries.getMobileYouthDetail(context, before.id), { code: "NOT_FOUND" });
  } finally { await s.dispose(); }
});
