import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
const ciUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test';
async function setup() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.DATABASE_URL !== ciUrl || process.env.DIRECT_URL !== ciUrl) throw Error('Cafe PostgreSQL tests require exact disposable CI database.');
  const [{ PrismaClient }, { PrismaPg }, mutations, queries] = await Promise.all([import('../src/generated/prisma/client.ts'), import('@prisma/adapter-pg'), import('../src/lib/cafe-mutations.ts'), import('../src/lib/cafe-queries.ts')]);
  const prefix = 'ci-cafe-' + randomUUID(), db = new PrismaClient({ adapter: new PrismaPg({ connectionString: ciUrl, max: 4 }) });
  await db.department.create({ data: { id: prefix + '-dept', name: '합성 카페 검증', code: prefix } });
  await db.position.create({ data: { id: prefix + '-position', name: '합성 직원', level: 1 } });
  const actor = await db.user.create({ data: { id: prefix + '-actor', name: '합성 직원', departmentId: prefix + '-dept', positionId: prefix + '-position' } });
  const now = new Date('2026-10-04T03:00:00.000Z'), ctx = { actorId: actor.id, db, now: () => now };
  return { prefix, db, actor, now, ctx, mutations, queries, async dispose() {
    const receipts = await db.cafeMutationReceipt.findMany({ where: { actorId: actor.id }, select: { targetType: true, targetId: true } });
    await db.cafeItem.deleteMany({ where: { id: { in: receipts.filter(v => v.targetType === 'CafeItem').map(v => v.targetId) } } });
    await db.cafeComplianceNote.deleteMany({ where: { createdById: actor.id } });
    await db.cafeMutationReceipt.deleteMany({ where: { actorId: actor.id } }); await db.auditLog.deleteMany({ where: { actorId: actor.id } });
    await db.user.delete({ where: { id: actor.id } }); await db.position.delete({ where: { id: prefix + '-position' } }); await db.department.delete({ where: { id: prefix + '-dept' } }); await db.$disconnect();
  } };
}
const input = (name: string) => ({ name, category: 'food' as const, purchasedAt: '0001-01-01', priceWon: 0, purchaseReason: '합성 구매 사유', expirationDate: '2026-10-03' });
function actorBarrier(s: Awaited<ReturnType<typeof setup>>) {
  let entered = 0, release = () => {}; const barrier = new Promise<void>(yes => { release = yes; });
  const db = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) {
    if (key === '$queryRaw') return async (...args: Parameters<typeof target.$queryRaw>) => { const result = await target.$queryRaw(...args), sql = args[0] as { strings?: string[] }; if (sql.strings?.join('').includes('FROM "User"') && entered < 2) { entered++; if (entered === 2) release(); await barrier; } return result; };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } })), options) } as unknown as typeof s.ctx.db;
  return { db, entered: () => entered };
}
test('CI PostgreSQL cafe same-key parallel transaction serializes actual actor/advisory locks and commits one item/audit/receipt', { skip: process.env.GITHUB_ACTIONS !== 'true', timeout: 60000 }, async () => {
  const s = await setup(); try {
    const pair = actorBarrier(s), body = { operation: 'item.create' as const, requestId: 'pg-concurrent-create', input: input(s.prefix) };
    const results = await Promise.all([s.mutations.mutateCafe({ ...s.ctx, db: pair.db }, body), s.mutations.mutateCafe({ ...s.ctx, db: pair.db }, body)]);
    assert.equal(pair.entered(), 2); assert.equal(results[0].targetId, results[1].targetId); assert.equal(results.filter(v => v.replayed).length, 1);
    assert.equal(await s.db.cafeItem.count({ where: { id: results[0].targetId } }), 1); assert.equal(await s.db.cafeMutationReceipt.count({ where: { actorId: s.actor.id, requestId: body.requestId } }), 1); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id, targetId: results[0].targetId } }), 1);
    assert.equal(results[0].result && 'item' in results[0].result ? results[0].result.item.purchasedAt : null, '0001-01-01');
  } finally { await s.dispose(); }
});
test('CI PostgreSQL cafe concurrent update-delete CAS permits one effect and immutable old receipt never recreates target', { skip: process.env.GITHUB_ACTIONS !== 'true', timeout: 60000 }, async () => {
  const s = await setup(); try {
    const create = { operation: 'item.create' as const, requestId: 'pg-original-create', input: input(s.prefix) }, first = await s.mutations.mutateCafe(s.ctx, create);
    const pair = actorBarrier(s), commands = [
      { operation: 'item.update' as const, requestId: 'pg-racing-update', targetId: first.targetId, expectedUpdatedAt: first.committedUpdatedAt!, input: input(s.prefix + '-changed') },
      { operation: 'item.delete' as const, requestId: 'pg-racing-delete', targetId: first.targetId, expectedUpdatedAt: first.committedUpdatedAt! },
    ];
    const results = await Promise.allSettled(commands.map(command => s.mutations.mutateCafe({ ...s.ctx, db: pair.db }, command)));
    assert.equal(pair.entered(), 2); assert.equal(results.filter(v => v.status === 'fulfilled').length, 1);
    const rejected = results.find(v => v.status === 'rejected') as PromiseRejectedResult; assert.ok(['ITEM_CONFLICT', 'NOT_FOUND'].includes(rejected.reason.code));
    assert.equal(await s.db.cafeMutationReceipt.count({ where: { actorId: s.actor.id } }), 2); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id } }), 2);
    const row = await s.db.cafeItem.findUnique({ where: { id: first.targetId } });
    if (row) await s.mutations.mutateCafe(s.ctx, { operation: 'item.delete', requestId: 'pg-delete-after-race', targetId: row.id, expectedUpdatedAt: row.updatedAt.toISOString() });
    const replay = await s.mutations.mutateCafe(s.ctx, create); assert.equal(replay.outcome, 'deleted'); assert.equal(replay.result, null); assert.equal(replay.committedUpdatedAt, first.committedUpdatedAt); assert.equal(await s.db.cafeItem.count({ where: { id: first.targetId } }), 0);
  } finally { await s.dispose(); }
});
test('CI PostgreSQL cafe audit FK failure rolls back item+receipt and current ACTIVE authorization precedes own status', { skip: process.env.GITHUB_ACTIONS !== 'true', timeout: 60000 }, async () => {
  const s = await setup(); try {
    const badDb = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) {
      if (key === 'auditLog') return new Proxy(target.auditLog, { get(delegate, name) { if (name === 'create') return (args: Parameters<typeof delegate.create>[0]) => delegate.create({ ...args, data: { ...args.data, actorId: s.prefix + '-missing' } }); const value = Reflect.get(delegate, name); return typeof value === 'function' ? value.bind(delegate) : value; } });
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } })), options) } as unknown as typeof s.ctx.db;
    await assert.rejects(s.mutations.mutateCafe({ ...s.ctx, db: badDb }, { operation: 'item.create', requestId: 'pg-audit-rollback', input: input(s.prefix) }));
    assert.equal(await s.db.cafeItem.count({ where: { name: s.prefix } }), 0); assert.equal(await s.db.cafeMutationReceipt.count({ where: { actorId: s.actor.id } }), 0);
    const note = await s.mutations.mutateCafe(s.ctx, { operation: 'note.create', requestId: 'pg-note-shared', content: '합성 공용 준수사항' }); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id } }), 0);
    await s.db.user.update({ where: { id: s.actor.id }, data: { status: 'INACTIVE' } });
    await assert.rejects(s.mutations.getCafeMutationStatus(s.ctx, note.requestId), { code: 'UNAUTHORIZED' }); await assert.rejects(s.mutations.mutateCafe(s.ctx, { operation: 'note.delete', requestId: 'pg-retired-delete', targetId: note.targetId, expectedUpdatedAt: note.committedUpdatedAt! }), { code: 'UNAUTHORIZED' }); assert.equal(await s.db.cafeComplianceNote.count({ where: { id: note.targetId } }), 1);
  } finally { await s.dispose(); }
});

test('CI PostgreSQL cafe note receipt CHECK rollback, same-key concurrency and receipt table RLS/no policies/no target FK', { skip: process.env.GITHUB_ACTIONS !== 'true', timeout: 60000 }, async () => {
  const s = await setup(); try {
    const broken = { $transaction: (operation: (tx: unknown) => Promise<unknown>, options: object) => s.db.$transaction(tx => operation(new Proxy(tx, { get(target, key) {
      if (key === 'cafeMutationReceipt') return new Proxy(target.cafeMutationReceipt, { get(delegate, name) { if (name === 'create') return (args: Parameters<typeof delegate.create>[0]) => delegate.create({ ...args, data: { ...args.data, payloadHash: 'invalid-not-sha' } }); const value = Reflect.get(delegate, name); return typeof value === 'function' ? value.bind(delegate) : value; } });
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } })), options) } as unknown as typeof s.ctx.db;
    await assert.rejects(s.mutations.mutateCafe({ ...s.ctx, db: broken }, { operation: 'note.create', requestId: 'pg-note-rollback', content: s.prefix + '-rollback' }));
    assert.equal(await s.db.cafeComplianceNote.count({ where: { createdById: s.actor.id } }), 0); assert.equal(await s.db.cafeMutationReceipt.count({ where: { actorId: s.actor.id } }), 0); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id } }), 0);
    const pair = actorBarrier(s), command = { operation: 'note.create' as const, requestId: 'pg-note-concurrent', content: s.prefix + '-note' };
    const results = await Promise.all([s.mutations.mutateCafe({ ...s.ctx, db: pair.db }, command), s.mutations.mutateCafe({ ...s.ctx, db: pair.db }, command)]); assert.equal(results[0].targetId, results[1].targetId); assert.equal(results.filter(v => v.replayed).length, 1); assert.equal(await s.db.cafeComplianceNote.count({ where: { createdById: s.actor.id } }), 1); assert.equal(await s.db.cafeMutationReceipt.count({ where: { actorId: s.actor.id } }), 1); assert.equal(await s.db.auditLog.count({ where: { actorId: s.actor.id } }), 0);
    const meta = await s.db.$queryRaw<Array<{ rls: boolean; policies: bigint; foreign_keys: bigint }>>`SELECT c.relrowsecurity AS rls, (SELECT count(*) FROM pg_policies WHERE schemaname=current_schema() AND tablename='CafeMutationReceipt') AS policies, (SELECT count(*) FROM pg_constraint WHERE conrelid=c.oid AND contype='f') AS foreign_keys FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='CafeMutationReceipt'`;
    assert.deepEqual(meta, [{ rls: true, policies: 0n, foreign_keys: 0n }]);
  } finally { await s.dispose(); }
});
