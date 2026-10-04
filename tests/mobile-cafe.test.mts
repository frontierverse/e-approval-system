import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createCafeHarness } from './helpers/mobile-cafe.mjs';

const suite = createCafeHarness();
const { h, ctx, load } = suite;
const core = load('lib/mobile-cafe-core.ts');
const queries = load('lib/cafe-queries.ts');
const context = load('lib/cafe-context.ts');
const date = (v: string) => new Date(v + 'T00:00:00.000Z');
const query = (values = {}) => ({ category: 'all', deadline: 'all', sort: 'latest', held: 'all', query: '', page: 1, ...values });
const historyQuery = (values = {}) => ({ action: 'all', actorId: 'all', query: '', itemId: null, page: 1, ...values });
const item = (id: string, values = {}) => ({ id, name: id, category: 'food', purchasedAt: date('2026-06-26'), priceWon: null, purchaseReason: null, expirationDate: date('2026-10-04'), expirationHoldReason: null, createdAt: date('2026-10-01'), updatedAt: date('2026-10-01'), ...values });
const log = (id: string, values = {}) => ({ id, actorId: 'actor', action: 'UPDATE_CAFE_ITEM', targetType: 'CafeItem', targetId: 'deleted-item', message: 'PRIVATE_RAW_MESSAGE', metadata: { source: 'cafe-item', changeType: 'cafeItem.delete', itemName: '삭제 물품', PRIVATE_METADATA: 'PRIVATE_DETAIL' }, createdAt: date('2026-10-01'), ...values });
const sourceRows = () => [
  item('expired-held', { name: '우유', expirationDate: date('2026-10-03'), expirationHoldReason: '보류 사유', priceWon: 0 }),
  item('expired-normal', { name: '쿠키', expirationDate: date('2026-10-02') }),
  item('today', { expirationDate: date('2026-10-04') }),
  item('day30', { expirationDate: date('2026-11-03') }),
  item('day31', { expirationDate: date('2026-11-04') }),
  item('equipment100', { category: 'equipment', purchasedAt: date('2026-06-26'), expirationDate: null }),
  item('equipment99', { category: 'equipment', purchasedAt: date('2026-06-27'), expirationDate: null }),
];

describe('actual cafe shared read and bounded-input source', () => {
  beforeEach(() => suite.reset());
  test('every supplied read remains in one RepeatableRead transaction and changes no business/audit/receipt', async () => {
    h.forbidGlobalDb = true;
    for (const fn of [() => queries.getMobileMealMenu(ctx), () => queries.getMobileCafeItems(ctx, query()), () => queries.getMobileCafeHistory(ctx, historyQuery()), () => queries.getMobileCafeNotes(ctx)]) await fn();
    assert.equal(h.globalDbReads, 0);
    assert.equal(h.transactions.length, 4);
    assert.ok(h.transactions.every((v: { isolationLevel: string }) => v.isolationLevel === 'RepeatableRead'));
    assert.equal(h.writes.length, 0);
    assert.equal(h.auditLog.length, 0);
    assert.equal(h.cafeMutationReceipt.length, 0);
    assert.ok(h.locks.every((v: { sql: string }) => /FROM "User".*FOR SHARE/.test(v.sql)));
  });
  test('USER and ADMIN ACTIVE are equal; status changes after session are checked inside transaction before business read', async () => {
    for (const role of ['USER', 'ADMIN']) { h.user[0].role = role; assert.equal((await queries.getMobileCafeItems(ctx, query())).total, 0); }
    h.beforeTx = () => { h.user[0].status = 'INACTIVE'; };
    h.reads = [];
    await assert.rejects(queries.getMobileMealMenu(ctx), { code: 'UNAUTHORIZED', status: 401 });
    assert.deepEqual(h.reads.map((v: { model: string }) => v.model), ['user']);
    assert.equal(h.writes.length, 0);
  });
  test('actual meal query preserves Gregorian 0001/0099/1900/2000/9999 without year remapping', async () => {
    for (const value of ['0001-01-01', '0099-12-31', '0100-01-01', '1900-02-28', '2000-02-29', '9999-12-31']) {
      h.lunchBoxMenu = [{ id: value, date: date(value), items: ['① 합성 메뉴★', '  국  ', ''] }];
      const result = await queries.getMobileMealMenu(ctx, value);
      assert.equal(result.date, value);
      assert.deepEqual(result.menuItems, ['합성 메뉴', '국']);
      assert.equal(h.reads.findLast((v: { model: string }) => v.model === 'lunchBoxMenu').where.date.toISOString().slice(0, 10), value);
    }
    for (const value of ['0000-01-01', '1900-02-29', '2000-02-30', '2026-2-03', '10000-01-01']) await assert.rejects(queries.getMobileMealMenu(ctx, value), { code: 'INVALID_REQUEST' });
  });
  test('meal uses one KST today and active-school zero rows; original seven count fields include preservation and driver', async () => {
    h.now = new Date('2026-10-03T15:00:00.000Z');
    h.lunchBoxSchool = [{ id: 'a', name: '가학교', type: 'elementary', order: 1, active: true }, { id: 'b', name: '나유치원', type: 'kindergarten', order: 2, active: true }, { id: 'inactive', name: '비활성', type: 'elementary', order: 0, active: false }];
    h.lunchBoxCount = [{ schoolId: 'a', date: date('2026-10-04'), class1Count: 1, class2Count: 2, class3Count: 3, class4Count: 4, linkedCount: 5, preservationCount: 6, deliveryDriverCount: 7 }, { schoolId: 'inactive', date: date('2026-10-04'), class1Count: 999 }];
    const result = await queries.getMobileMealMenu(ctx);
    assert.equal(result.today, '2026-10-04'); assert.equal(result.date, result.today);
    assert.deepEqual(result.summary, { schoolCount: 2, totalCount: 28, preservationCount: 6, deliveryDriverCount: 7 });
    assert.deepEqual(result.schools.map((v: { schoolId: string; totalCount: number }) => [v.schoolId, v.totalCount]), [['a', 28], ['b', 0]]);
    assert.deepEqual(result.menuItems, []);
  });
  test('category/deadline/q/held are intersections while global summary still counts held expired food and 30-day boundary', async () => {
    h.cafeItem = sourceRows();
    const result = await queries.getMobileCafeItems(ctx, query({ category: 'food', deadline: 'expired', held: 'only', query: '우유' }));
    assert.deepEqual(result.items.map((v: { id: string }) => v.id), ['expired-held']);
    assert.equal(result.items[0].priceWon, 0);
    assert.equal(result.total, 1);
    assert.deepEqual(result.summary, { expiredFoodCount: 2, dueSoonFoodCount: 2, heldItemCount: 1 });
    const empty = await queries.getMobileCafeItems(ctx, query({ category: 'equipment', deadline: 'expired' }));
    assert.equal(empty.total, 0); assert.deepEqual(empty.items, []); assert.deepEqual(empty.summary, result.summary);
    const over = await queries.getMobileCafeItems(ctx, query({ deadline: 'over100' }));
    assert.deepEqual(over.items.map((v: { id: string }) => v.id), ['equipment100']);
  });
  test('boundary-year deadline counts saturate upper date and do not invent year0001 over100 eligibility', async () => {
    h.now = new Date('9999-12-01T00:00:00.000Z'); h.cafeItem = [item('last', { expirationDate: date('9999-12-31') })];
    assert.equal((await queries.getMobileCafeItems(ctx, query({ deadline: 'dueSoon' }))).total, 1);
    h.now = new Date('0001-01-01T00:00:00.000Z'); h.cafeItem = [item('oldest', { category: 'other', purchasedAt: date('0001-01-01'), expirationDate: null })];
    const earliest = await queries.getMobileCafeItems(ctx, query({ deadline: 'over100' }));
    assert.equal(earliest.total, 0); assert.equal(earliest.today, '0001-01-01');
  });
  test('page20 clamp and ID ties are deterministic; null expiration remains last and 0 differs from null', async () => {
    h.cafeItem = Array.from({ length: 25 }, (_, i) => item('row-' + String(i).padStart(2, '0'), { priceWon: i === 0 ? 0 : null }));
    const result = await queries.getMobileCafeItems(ctx, query({ page: 999 }));
    assert.equal(result.page, 2); assert.equal(result.pageSize, 20); assert.equal(result.totalPages, 2); assert.equal(result.items.length, 5);
    assert.deepEqual(result.items.map((v: { id: string }) => v.id), ['row-04', 'row-03', 'row-02', 'row-01', 'row-00']);
    h.cafeItem = [item('null', { expirationDate: null }), item('first', { expirationDate: date('2026-10-01'), priceWon: 0 }), item('later', { expirationDate: date('2026-10-02') })];
    const sorted = await queries.getMobileCafeItems(ctx, query({ sort: 'expirationAsc' }));
    assert.deepEqual(sorted.items.map((v: { id: string }) => v.id), ['first', 'later', 'null']);
    assert.equal(sorted.items[0].priceWon, 0); assert.equal(sorted.items[1].priceWon, null);
  });
  test('history preserves deleted-target audit with safe standard message and no email-only search oracle', async () => {
    h.auditLog = [log('cafe'), log('foreign', { targetType: 'Youth', metadata: { source: 'youth', itemName: '삭제 물품' } })];
    const result = await queries.getMobileCafeHistory(ctx, historyQuery({ itemId: 'deleted-item' }));
    assert.equal(result.total, 1); assert.equal(result.logs[0].itemName, '삭제 물품');
    const text = JSON.stringify(result);
    for (const value of ['PRIVATE_EMAIL', 'PRIVATE_RAW_MESSAGE', 'PRIVATE_METADATA', 'PRIVATE_DETAIL', 'userAgent', 'ipAddress']) assert.ok(!text.includes(value));
    assert.deepEqual(result.actors, [{ id: 'actor', name: '합성 직원' }]);
    assert.equal((await queries.getMobileCafeHistory(ctx, historyQuery({ query: 'PRIVATE_EMAIL_ONLY' }))).total, 0);
    assert.equal((await queries.getMobileCafeHistory(ctx, historyQuery({ query: '합성' }))).total, 1);
  });
  test('shared notes show another active author and deleted-author null; no read side effects', async () => {
    h.cafeComplianceNote = [{ id: 'a', content: '공유 메모', createdById: 'other', createdAt: h.now, updatedAt: h.now }, { id: 'b', content: '삭제 작성자', createdById: null, createdAt: h.now, updatedAt: h.now }];
    const result = await queries.getMobileCafeNotes(ctx, 9);
    assert.equal(result.page, 1); assert.equal(result.total, 2);
    assert.equal(result.notes[0].createdBy, null); assert.deepEqual(result.notes[1].createdBy, { id: 'other', name: '다른 직원' });
    assert.ok(result.notes.every((v: { updatedAt: string }) => v.updatedAt === h.now.toISOString()));
    assert.equal(h.writes.length, 0);
  });
  test('database failure is not converted to a successful empty menu/list', async () => {
    h.modelFailure = 'lunchBoxMenu'; await assert.rejects(queries.getMobileMealMenu(ctx), /PRIVATE_PROVIDER_FAILURE/);
    h.modelFailure = 'cafeItem'; await assert.rejects(queries.getMobileCafeItems(ctx, query()), /PRIVATE_PROVIDER_FAILURE/);
  });
  test('canonical query defaults apply only to omission; duplicate/unknown/empty aliases are rejected', () => {
    for (const suffix of ['?date=2026-10-04&date=2026-10-04', '?date=', '?date=1900-02-29', '?DATE=2026-10-04']) assert.throws(() => core.parseMealMenuDate(new URL('https://fixture.invalid/' + suffix), '2026-10-04'), { code: 'INVALID_REQUEST' });
    for (const suffix of ['?page=0', '?page=01', '?page=1.1', '?page=1000000000', '?held=', '?sort=Latest', '?category=food&category=food', '?actorId=other']) assert.throws(() => core.parseCafePageQuery(new URL('https://fixture.invalid/' + suffix)), { code: 'INVALID_REQUEST' });
    assert.equal(core.parseMealMenuDate(new URL('https://fixture.invalid/'), '0099-12-31'), '0099-12-31');
    assert.equal(core.parseCafePageQuery(new URL('https://fixture.invalid/?q=%20%20')).query, '');
  });
  test('actual bounded JSON rejects duplicate decoded keys, invalid UTF8, declared mismatch and streamed oversize', async () => {
    const req = (body: string | Uint8Array, headers = {}) => new Request('https://fixture.invalid/', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
    for (const body of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"nested":{"a":1,"a":2}}']) await assert.rejects(core.readCafeJson(req(body)), { code: 'INVALID_REQUEST' });
    await assert.rejects(core.readCafeJson(req(new Uint8Array([0xff]))), { code: 'INVALID_REQUEST' });
    await assert.rejects(core.readCafeJson(req('{}', { 'content-length': '3' })), { code: 'INVALID_REQUEST' });
    await assert.rejects(core.readCafeJson(req(' '.repeat(65537))), { code: 'PAYLOAD_TOO_LARGE', status: 413 });
    assert.deepEqual(await core.readCafeJson(req('{"a":{"b":1},"c":[2,3]}')), { a: { b: 1 }, c: [2, 3] });
    assert.equal(h.timeouts.size, 0);
  });
  test('held reader deadline cancels actual body without leaking a pending timer', async () => {
    let cancelled = 0;
    const body = new ReadableStream({ cancel() { cancelled++; } });
    const promise = core.readCafeJson(new Request('https://fixture.invalid/', { method: 'POST', body, duplex: 'half', headers: { 'content-type': 'application/json' } } as RequestInit));
    suite.fireTimeouts(); await assert.rejects(promise, { code: 'REQUEST_TIMEOUT', status: 408 });
    assert.equal(cancelled, 1); assert.equal(h.timeouts.size, 0);
  });
  test('continuously ready body cannot commit after the total deadline even when reader has no wait', async () => {
    h.clock = 1000; let pull = 0, cancelled = 0;
    const body = new ReadableStream({ pull(controller) { if (++pull === 1) controller.enqueue(new TextEncoder().encode('{}')); else { h.clock = 11001; controller.close(); } }, cancel() { cancelled++; } });
    await assert.rejects(core.readCafeJson(new Request('https://fixture.invalid/', { method: 'POST', body, duplex: 'half', headers: { 'content-type': 'application/json' } } as RequestInit)), { code: 'REQUEST_TIMEOUT', status: 408 });
    assert.ok(cancelled <= 1); assert.equal(h.timeouts.size, 0);
  });
  test('transaction retry recognizes actual adapter cause and is bounded; unknown/constraint/cyclic errors are not retried', async () => {
    const { DriverAdapterError } = await import('@prisma/driver-adapter-utils');
    const conflict = new DriverAdapterError({ kind: 'TransactionWriteConflict' });
    h.nextTxErrors = [conflict, conflict];
    await queries.getMobileCafeNotes(ctx); assert.equal(h.transactions.length, 3);
    h.transactions = []; h.nextTxErrors = [conflict, conflict, conflict];
    await assert.rejects(queries.getMobileCafeNotes(ctx)); assert.equal(h.transactions.length, 3);
    const constraint = new DriverAdapterError({ kind: 'postgres', code: '23514', severity: 'ERROR', message: 'PRIVATE_CONSTRAINT' });
    assert.equal(context.cafeTransactionConflict(constraint), false);
    const cyclic = new Error('P2034 word is not evidence', { cause: null }); cyclic.cause = cyclic;
    assert.equal(context.cafeTransactionConflict(cyclic), false);
    assert.equal(context.cafeTransactionConflict({ code: 'P2034' }), false);
  });
});

const mutation = load('lib/cafe-mutations.ts');
const commands = load('lib/cafe-mutations-core.ts');
const input = (patch = {}) => ({ name: '합성 물품', category: 'food', purchasedAt: '2026-10-01', priceWon: 0, purchaseReason: '합성 구매 사유', expirationDate: '2026-10-03', ...patch });
const token = '2026-10-01T00:00:00.000Z';

describe('actual cafe mutation transaction and receipt source', () => {
  beforeEach(() => suite.reset());
  test('same canonical key creates one item/audit/receipt; changed payload conflicts and different actor is isolated', async () => {
    const command = { operation: 'item.create', requestId: 'create-key', input: input() };
    const first = await mutation.mutateCafe(ctx, command), again = await mutation.mutateCafe(ctx, command);
    assert.equal(first.replayed, false); assert.equal(again.replayed, true); assert.equal(first.targetId, again.targetId);
    assert.equal(h.cafeItem.length, 1); assert.equal(h.auditLog.length, 1); assert.equal(h.cafeMutationReceipt.length, 1);
    assert.equal(h.auditLog[0].actorId, 'actor'); assert.equal(h.auditLog[0].metadata.source, 'cafe-item');
    assert.ok(h.transactions.every((v: { isolationLevel: string }) => v.isolationLevel === 'Serializable'));
    assert.ok(h.locks.some((v: { sql: string }) => /^SELECT 1 FROM pg_advisory_xact_lock/.test(v.sql)));
    await assert.rejects(mutation.mutateCafe(ctx, { ...command, input: input({ name: '다른 입력' }) }), { code: 'REQUEST_CONFLICT', status: 409 });
    const other = await mutation.mutateCafe({ ...ctx, actorId: 'other' }, command);
    assert.notEqual(first.targetId, other.targetId); assert.equal(h.cafeItem.length, 2);
    const status = await mutation.getCafeMutationStatus(ctx, command.requestId);
    assert.equal(status.targetId, first.targetId); assert.equal(h.cafeMutationReceipt.length, 2);
  });
  test('CAS precedes equality and changed hold; same-time writes have strictly increasing tokens', async () => {
    h.cafeItem = [item('target', { updatedAt: h.now })];
    const first = await mutation.mutateCafe(ctx, { operation: 'item.update', requestId: 'update-one', targetId: 'target', expectedUpdatedAt: h.now.toISOString(), input: input() });
    assert.equal(first.committedUpdatedAt, new Date(h.now.getTime() + 1).toISOString());
    await assert.rejects(mutation.mutateCafe(ctx, { operation: 'item.update', requestId: 'update-stale', targetId: 'target', expectedUpdatedAt: h.now.toISOString(), input: input() }), { code: 'ITEM_CONFLICT' });
    const second = await mutation.mutateCafe(ctx, { operation: 'item.hold', requestId: 'hold-next', targetId: 'target', expectedUpdatedAt: first.committedUpdatedAt, reason: '첫 보류' });
    assert.equal(second.committedUpdatedAt, new Date(h.now.getTime() + 2).toISOString());
    await assert.rejects(mutation.mutateCafe(ctx, { operation: 'item.hold', requestId: 'hold-stale', targetId: 'target', expectedUpdatedAt: first.committedUpdatedAt, reason: '첫 보류' }), { code: 'ITEM_CONFLICT' });
    assert.equal(h.cafeMutationReceipt.length, 2); assert.equal(h.auditLog.length, 2);
  });
  test('expired food hold is revalidated in transaction; today/nonfood/missing reject without effect', async () => {
    for (const row of [item('target'), item('target', { category: 'equipment', expirationDate: date('2026-10-01') }), item('target', { expirationDate: null })]) {
      h.cafeItem = [row];
      await assert.rejects(mutation.mutateCafe(ctx, { operation: 'item.hold', requestId: 'hold-ineligible', targetId: 'target', expectedUpdatedAt: token, reason: '사유' }), { code: 'VALIDATION_ERROR', status: 400 });
      assert.equal(h.cafeMutationReceipt.length, 0); assert.equal(h.auditLog.length, 0);
    }
    h.cafeItem = [];
    await assert.rejects(mutation.mutateCafe(ctx, { operation: 'item.hold', requestId: 'hold-missing', targetId: 'target', expectedUpdatedAt: token, reason: '사유' }), { code: 'NOT_FOUND', status: 404 });
  });
  test('editing expired food retains hold but changed category/nonexpired date removes obsolete hold', async () => {
    for (const patch of [{}, { expirationDate: '2026-10-04' }, { category: 'equipment', expirationDate: '2026-10-03' }]) {
      suite.reset(); h.cafeItem = [item('target', { expirationDate: date('2026-10-03'), expirationHoldReason: '기존 보류' })];
      const result = await mutation.mutateCafe(ctx, { operation: 'item.update', requestId: 'edit-hold', targetId: 'target', expectedUpdatedAt: token, input: input(patch) });
      assert.equal(result.result.item.expirationHoldReason, Object.keys(patch).length ? null : '기존 보류');
      if (patch.category) assert.equal(result.result.item.expirationDate, null);
    }
  });
  test('successful commit status keeps immutable token but projects fresh target; deleted target cannot be recreated on replay', async () => {
    const command = { operation: 'item.create', requestId: 'create-proof', input: input() };
    const first = await mutation.mutateCafe(ctx, command);
    const changed = await mutation.mutateCafe(ctx, { operation: 'item.update', requestId: 'later-update', targetId: first.targetId, expectedUpdatedAt: first.committedUpdatedAt, input: input({ name: '후속 수정' }) });
    const status = await mutation.getCafeMutationStatus(ctx, command.requestId);
    assert.equal(status.committedUpdatedAt, first.committedUpdatedAt); assert.equal(status.result.item.updatedAt, changed.committedUpdatedAt); assert.equal(status.result.item.name, '후속 수정');
    await mutation.mutateCafe(ctx, { operation: 'item.delete', requestId: 'delete-proof', targetId: first.targetId, expectedUpdatedAt: changed.committedUpdatedAt });
    const replay = await mutation.mutateCafe(ctx, command);
    assert.equal(replay.outcome, 'deleted'); assert.equal(replay.result, null); assert.equal(replay.committedUpdatedAt, first.committedUpdatedAt);
    assert.equal(h.cafeItem.length, 0); assert.equal(h.auditLog.length, 3);
    await assert.rejects(mutation.getCafeMutationStatus({ ...ctx, actorId: 'other' }, command.requestId), { code: 'NOT_FOUND' });
  });
  test('item delete checks existing stale token but missing target records only idempotent proof and no audit', async () => {
    h.cafeItem = [item('target', { updatedAt: new Date(h.now) })];
    await assert.rejects(mutation.mutateCafe(ctx, { operation: 'item.delete', requestId: 'stale-delete', targetId: 'target', expectedUpdatedAt: token }), { code: 'ITEM_CONFLICT' });
    assert.equal(h.cafeItem.length, 1); assert.equal(h.cafeMutationReceipt.length, 0);
    h.cafeItem = [];
    const command = { operation: 'item.delete', requestId: 'missing-delete', targetId: 'target', expectedUpdatedAt: token };
    const result = await mutation.mutateCafe(ctx, command);
    assert.equal(result.outcome, 'deleted'); assert.equal(result.result, null); assert.equal(result.committedUpdatedAt, null);
    assert.equal(h.auditLog.length, 0); assert.equal(h.cafeMutationReceipt.length, 1);
    assert.equal((await mutation.mutateCafe(ctx, command)).replayed, true);
  });
  test('any ACTIVE colleague may delete note with correct token; notes never write item audit', async () => {
    const created = await mutation.mutateCafe(ctx, { operation: 'note.create', requestId: 'note-create', content: '  공유 준수사항  ' });
    assert.equal(created.result.content, '공유 준수사항'); assert.equal(created.result.createdBy.id, 'actor');
    h.cafeComplianceNote[0].updatedAt = new Date(h.now.getTime() + 1);
    await assert.rejects(mutation.mutateCafe({ ...ctx, actorId: 'other' }, { operation: 'note.delete', requestId: 'note-stale', targetId: created.targetId, expectedUpdatedAt: created.committedUpdatedAt }), { code: 'NOTE_CONFLICT' });
    const removed = await mutation.mutateCafe({ ...ctx, actorId: 'other' }, { operation: 'note.delete', requestId: 'note-delete', targetId: created.targetId, expectedUpdatedAt: h.cafeComplianceNote[0].updatedAt.toISOString() });
    assert.equal(removed.outcome, 'deleted'); assert.equal(removed.committedUpdatedAt, null); assert.equal(h.auditLog.length, 0);
    assert.equal((await mutation.getCafeMutationStatus(ctx, 'note-create')).outcome, 'deleted');
  });
  test('audit or receipt failure rolls back item and all evidence; cache failure cannot reverse committed proof', async () => {
    const command = { operation: 'item.create', requestId: 'atomic-create', input: input() };
    for (const failure of ['auditFailure', 'receiptFailure']) {
      h[failure] = true; await assert.rejects(mutation.mutateCafe(ctx, command), /PRIVATE_COMMIT_FAILURE/);
      assert.equal(h.cafeItem.length, 0); assert.equal(h.auditLog.length, 0); assert.equal(h.cafeMutationReceipt.length, 0); h[failure] = false;
    }
    h.cacheFailure = true; const result = await mutation.mutateCafe(ctx, command);
    assert.equal(result.ok, true); assert.equal(h.cafeItem.length, 1); assert.equal((await mutation.getCafeMutationStatus(ctx, command.requestId)).targetId, result.targetId);
  });
  test('inactive transaction actor rejects mutation and own status before item/receipt lookup', async () => {
    h.user[0].status = 'INACTIVE';
    for (const fn of [() => mutation.mutateCafe(ctx, { operation: 'note.create', requestId: 'retired-note', content: '금지' }), () => mutation.getCafeMutationStatus(ctx, 'other-key')]) {
      h.reads = []; await assert.rejects(fn(), { code: 'UNAUTHORIZED', status: 401 }); assert.deepEqual(h.reads.map((v: { model: string }) => v.model), ['user']);
    }
    assert.equal(h.writes.length, 0);
  });
  test('serialization conflict after real effects rolls back and retries one committed effect', async () => {
    const { DriverAdapterError } = await import('@prisma/driver-adapter-utils');
    h.nextTxErrors = [new DriverAdapterError({ kind: 'TransactionWriteConflict' })];
    const result = await mutation.mutateCafe(ctx, { operation: 'item.create', requestId: 'retry-commit', input: input() });
    assert.equal(result.ok, true); assert.equal(h.transactions.length, 2); assert.equal(h.cafeItem.length, 1); assert.equal(h.auditLog.length, 1); assert.equal(h.cafeMutationReceipt.length, 1);
  });
  test('trusted mutation input cannot smuggle client actor/request metadata or invalid date/price into DB', async () => {
    for (const patch of [{ purchasedAt: '1900-02-29' }, { expirationDate: '2000-02-30' }, { priceWon: -1 }, { priceWon: '0' }, { priceWon: 1.2 }, { priceWon: 1000000000 }, { name: '' }, { category: 'stock' }]) await assert.rejects(mutation.mutateCafe(ctx, { operation: 'item.create', requestId: 'invalid-key', input: input(patch) }), { status: 400 });
    assert.throws(() => commands.parseCafeCommand('note.create', undefined, { requestId: 'smuggle-key', content: '내용', actorId: 'other' }), { code: 'INVALID_REQUEST' });
    assert.equal(h.transactions.length, 0); assert.equal(h.writes.length, 0);
  });
});

const privateHeaders = (response: Response) => {
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('pragma'), 'no-cache'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('vary'), 'Authorization, Cookie');
};
const http = load('lib/mobile-cafe.ts');
const bodyRequest = (body: unknown, method = 'POST', query = '') => new Request('https://fixture.invalid/api/mobile/cafe/items' + query, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
describe('actual mobile cafe HTTP handler and route source', () => {
  beforeEach(() => suite.reset());
  test('auth precedes path/body/query parsing and unauthenticated routes touch no transaction', async () => {
    h.session = null; let params = 0, pulled = 0;
    const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new TextEncoder().encode('{invalid')); c.close(); } }, { highWaterMark: 0 });
    const request = new Request('https://fixture.invalid/?page=0&unknown=x', { method: 'PUT', body: stream, duplex: 'half', headers: { 'content-type': 'text/plain' } } as RequestInit);
    const before = pulled;
    const response = await http.mobileCafeResponse(request, 'item.update', async () => { params++; return '../auth'; });
    assert.equal(response.status, 401); privateHeaders(response); assert.equal(params, 0); assert.equal(pulled, before); assert.equal(h.transactions.length, 0);
  });
  test('all read endpoints and status remain private/pure including missing item/receipt and provider500', async () => {
    const calls = [['meal-menu', undefined], ['items', undefined], ['history', undefined], ['notes', undefined], ['item', 'missing'], ['mutation-status', 'missing-key']];
    for (const [action, id] of calls) {
      const response = await http.mobileCafeResponse(new Request('https://fixture.invalid/'), action, id ? async () => id : undefined);
      privateHeaders(response); assert.equal(response.status, id ? 404 : 200);
    }
    h.modelFailure = 'cafeItem'; const failed = await http.mobileCafeResponse(new Request('https://fixture.invalid/'), 'items');
    assert.equal(failed.status, 500); privateHeaders(failed); assert.ok(!(await failed.text()).includes('PRIVATE_PROVIDER_FAILURE')); assert.equal(h.writes.length, 0);
  });
  test('actual items route POST201 then replay200 and GET returns new authoritative summary', async () => {
    const route = load('app/api/mobile/cafe/items/route.ts'); const body = { requestId: 'http-create-key', input: input() };
    const created = await route.POST(bodyRequest(body)); const value = await created.json();
    assert.equal(created.status, 201); privateHeaders(created); assert.equal(value.result.item.priceWon, 0);
    const replay = await route.POST(bodyRequest(body)); assert.equal(replay.status, 200); assert.equal((await replay.json()).replayed, true);
    const page = await route.GET(new Request('https://fixture.invalid/')); assert.equal((await page.json()).total, 1); assert.equal(h.cafeItem.length, 1); assert.equal(h.auditLog.length, 1);
  });
  test('malformed400/415/413 and conflict409 carry private headers, fields and no storage effects', async () => {
    const invalid = await http.mobileCafeResponse(bodyRequest({ requestId: 'invalid-http', input: input({ name: '' }) }), 'item.create');
    assert.equal(invalid.status, 400); privateHeaders(invalid); assert.equal((await invalid.json()).fields.name, '물품명을 입력하세요.');
    const wrongType = await http.mobileCafeResponse(new Request('https://fixture.invalid/', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } }), 'note.create');
    assert.equal(wrongType.status, 415); privateHeaders(wrongType);
    const large = await http.mobileCafeResponse(new Request('https://fixture.invalid/', { method: 'POST', body: ' '.repeat(65537), headers: { 'content-type': 'application/json' } }), 'note.create');
    assert.equal(large.status, 413); privateHeaders(large);
    h.cafeItem = [item('target')]; const conflict = await http.mobileCafeResponse(bodyRequest({ requestId: 'http-conflict', expectedUpdatedAt: h.now.toISOString(), input: input() }, 'PUT'), 'item.update', async () => 'target');
    assert.equal(conflict.status, 409); privateHeaders(conflict); assert.equal(h.writes.length, 0);
  });
  test('current session actor becoming INACTIVE yields private401 on otherwise valid write', async () => {
    h.beforeTx = () => { h.user[0].status = 'INACTIVE'; };
    const response = await http.mobileCafeResponse(bodyRequest({ requestId: 'inactive-http', content: '금지' }), 'note.create');
    assert.equal(response.status, 401); privateHeaders(response); assert.equal(h.writes.length, 0);
  });
});

const webActions = load('app/work-schedule/cafe/actions.ts');
const formData = (patch = {}) => { const values = { expectedActorId: 'actor', cafeRequestId: 'web-create-key', ...input(), priceWon: '0', ...patch }; const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, String(value)); return result; };
describe('actual cafe web server actions share mobile domain authorization and CAS', () => {
  beforeEach(() => suite.reset());
  test('web create same-key replay and update CAS use shared receipt/audit; invalid input keeps fields', async () => {
    const created = await webActions.createCafeItemAction({}, formData()); assert.equal(created.receipt.result.item.priceWon, 0); assert.equal(created.receipt.operation, 'item.create');
    assert.equal((await webActions.createCafeItemAction({}, formData())).receipt.replayed, true); assert.equal(h.cafeItem.length, 1); assert.equal(h.auditLog.length, 1);
    const invalid = await webActions.createCafeItemAction({}, formData({ cafeRequestId: 'invalid-web', name: '' })); assert.equal(invalid.status, 400); assert.equal(invalid.values.name, ''); assert.equal(h.cafeItem.length, 1);
    const conflict = await webActions.updateCafeItemAction(created.receipt.targetId, {}, formData({ cafeRequestId: 'stale-web', expectedUpdatedAt: token })); assert.equal(conflict.code, 'ITEM_CONFLICT'); assert.equal(conflict.values.purchaseReason, '합성 구매 사유');
  });
  test('web actor binding failure never starts transaction or echoes old private inputs', async () => {
    const result = await webActions.createCafeItemAction({}, formData({ expectedActorId: 'other', purchaseReason: 'PRIVATE_OLD_ACCOUNT_INPUT' })); assert.equal(result.status, 403); assert.equal(result.values, undefined); assert.equal(h.transactions.length, 0); assert.equal(JSON.stringify(result).includes('PRIVATE_OLD_ACCOUNT_INPUT'), false);
    const status = await webActions.getCafeMutationStatusAction('missing-request', 'other'); assert.equal(status.status, 403); assert.equal(h.transactions.length, 0);
  });
  test('web auth redirect rethrows before parsing and valid stale session fails fresh ACTIVE transaction', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' }); h.authError = redirect;
    await assert.rejects(webActions.createCafeItemAction({}, formData()), error => error === redirect); assert.equal(h.transactions.length, 0);
    h.authError = null; h.user[0].status = 'INACTIVE'; const result = await webActions.createCafeItemAction({}, formData()); assert.equal(result.status, 401); assert.equal(result.values, undefined); assert.equal(h.writes.length, 0);
  });
});
