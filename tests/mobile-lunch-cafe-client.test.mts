import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createLunchCafeHarness, deferred, nodes, tick } from './helpers/mobile-lunch-cafe-client.mjs';
const suite = createLunchCafeHarness(), { state, api, core, load, mount, find } = suite;
const ApiError = api.ApiError;
const iso = '2026-10-04T03:00:00.000Z', newer = '2026-10-04T03:00:00.001Z';
const item = (patch = {}) => ({ id: 'item', name: 'PRIVATE_ITEM', category: 'food', purchasedAt: '2026-10-01', priceWon: 0, expirationDate: '2026-10-03', isHeld: false, usage: { basisLabel: '유통기한', label: '기한 경과', status: 'expired' }, ...patch });
const detail = (patch = {}) => ({ today: '2026-10-04', item: { ...item(), purchaseReason: 'PRIVATE_REASON', expirationHoldReason: null, createdAt: iso, updatedAt: iso, ...patch } });
const page = (patch = {}) => ({ today: '2026-10-04', filters: core.defaultCafeFilters, summary: { expiredFoodCount: 1, dueSoonFoodCount: 0, heldItemCount: 0 }, items: [item()], page: 1, pageSize: 20, total: 1, totalPages: 1, ...patch });
const meal = (date = '2026-10-04') => ({ today: '2026-10-04', date, menuItems: ['PRIVATE_MENU_' + date], summary: { schoolCount: 0, totalCount: 0, preservationCount: 0, deliveryDriverCount: 0 }, schools: [] });
const proof = (attempt, patch = {}) => ({ ok: true, message: '저장 확정', replayed: false, requestId: attempt.requestId, operation: attempt.operation, targetType: attempt.operation.startsWith('item.') ? 'CafeItem' : 'CafeComplianceNote', targetId: attempt.targetId ?? 'item', outcome: attempt.operation.endsWith('.delete') ? 'deleted' : 'present', committedAt: iso, committedUpdatedAt: attempt.operation.endsWith('.delete') ? null : iso, result: attempt.operation.endsWith('.delete') ? null : detail(), ...patch });
const readModule = load('components/lunch-cafe-read.ts');
const Read = ({ path, guard = (v) => core.isCafeDetail(v) }) => readModule.useLunchCafeRead(path, guard);
const mutationModule = load('components/lunch-cafe-mutation.tsx');
const Mutation = () => mutationModule.useCafeMutation({ current: () => state.account && state.foreground, onSuccess: v => state.success.push(v), onLoss: () => state.loss++ });
const submitInput = () => ({ operation: 'item.update', targetId: 'item', path: '/cafe/items/item', method: 'PUT', body: { expectedUpdatedAt: iso, input: { name: '원래 물품', category: 'food', purchasedAt: '2026-10-01', priceWon: 0, purchaseReason: '입력 보존', expirationDate: '2026-10-03' } } });
const writes = () => state.requests.filter(row => row.method && row.method !== 'GET');
const update = async h => { await tick(); h.update(); await tick(); h.update(); };

describe('actual mobile lunch/cafe request and account provider source', () => {
  beforeEach(() => suite.reset());
  test('closed paths reject traversal and foreign auth while legitimate encoded query values are passed as data', async () => {
    const request = load('lib/lunch-cafe-request.ts').lunchCafeRequest;
    for (const path of ['/cafe/../../auth', '/cafe/items/../auth', '/cafe/items/%2e%2e', '/auth', '//cafe/items', '/cafe/items/item#x', '/cafe/items\\auth']) await assert.rejects(request(path, 'synthetic-token'), { status: 400 });
    assert.equal(state.fetches.length, 0);
    await request('/cafe/items?q=%2Fauth%3F%26%23', 'synthetic-token');
    const [url, options] = state.fetches[0];
    assert.equal(url, 'https://fixture.invalid/api/mobile/cafe/items?q=%2Fauth%3F%26%23'); assert.equal(options.headers.Authorization, 'Bearer synthetic-token'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    assert.ok(!url.includes('synthetic-token')); assert.equal(state.timers.size, 0);
  });
  test('held response and held body both timeout, abort the actual request and release timers', async () => {
    const request = load('lib/lunch-cafe-request.ts').lunchCafeRequest;
    for (const held of ['fetch', 'body']) {
      state.onFetch = async () => held === 'fetch' ? new Promise(() => {}) : new Response(new ReadableStream());
      const pending = request('/cafe/items', 'synthetic-token'); await tick(); suite.fireTimeouts();
      await assert.rejects(pending, { status: 0 }); assert.equal(state.fetches.at(-1)[1].signal.aborted, true); assert.equal(state.timers.size, 0);
    }
  });
  test('caller cancellation and invalid 2xx differ from definitive fields; oversize is rejected before fetch', async () => {
    const request = load('lib/lunch-cafe-request.ts').lunchCafeRequest;
    const controller = new AbortController(); state.onFetch = async () => new Promise(() => {});
    const pending = request('/cafe/notes', 'synthetic-token', { signal: controller.signal }); controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
    state.onFetch = async () => new Response('{bad', { status: 201 }); await assert.rejects(request('/cafe/notes', 'synthetic-token'), { status: 201 });
    state.onFetch = async () => Response.json({ error: '검증 오류', code: 'VALIDATION_ERROR', fields: { content: '필수', extra: 1 } }, { status: 400 });
    await assert.rejects(request('/cafe/notes', 'synthetic-token'), { status: 400, code: 'VALIDATION_ERROR', fields: { content: '필수' } });
    const count = state.fetches.length; await assert.rejects(request('/cafe/notes', 'synthetic-token', { method: 'POST', body: { content: '한'.repeat(30000) } }), { status: 413 }); assert.equal(state.fetches.length, count);
  });
  test('provider Android blur/focus changes numeric generation even batched; no read-side network or lingering listeners', async () => {
    const Account = load('providers/LunchCafeProvider.tsx', 'AccountLunchCafe').QAExposed;
    const h = mount(Account, { token: 'captured-a', isAccount: () => state.account, expireSession: async token => state.expired.push(token) }); await update(h);
    const value = find(h, 'LunchCafeContextProvider').value; assert.equal(value.foreground, true); const generation = value.foregroundGeneration();
    for (const fn of state.listeners.get('blur')) fn(); for (const fn of state.listeners.get('focus')) fn();
    assert.equal(value.isForeground(), true); assert.equal(value.foregroundGeneration(), generation + 2);
    assert.equal(state.requests.length, 0); h.unmount(); assert.equal([...state.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  });
  test('old account response/401 does not publish or expire newer token; current401 captures exact token', async () => {
    const Account = load('providers/LunchCafeProvider.tsx', 'AccountLunchCafe').QAExposed;
    const h = mount(Account, { token: 'captured-a', isAccount: () => state.account, expireSession: async token => state.expired.push(token) }); await update(h);
    const value = find(h, 'LunchCafeContextProvider').value, old = deferred(); state.onRequest = () => old.promise;
    const pending = value.get('/cafe/items'); state.account = false; old.reject(new ApiError('old401', 401)); await assert.rejects(pending, { name: 'AbortError' }); assert.deepEqual(state.expired, []);
    state.account = true; state.onRequest = async () => { throw new ApiError('current401', 401); }; await assert.rejects(value.get('/cafe/items'), { status: 401 }); assert.deepEqual(state.expired, ['captured-a']);
  });
  test('StrictMode cleanup/setup fences pending response even same account becomes active again', async () => {
    const Account = load('providers/LunchCafeProvider.tsx', 'AccountLunchCafe').QAExposed;
    const h = mount(Account, { token: 'captured-a', isAccount: () => state.account, expireSession: async token => state.expired.push(token) }); await update(h);
    const old = deferred(); state.onRequest = () => old.promise; const pending = find(h, 'LunchCafeContextProvider').value.get('/cafe/items'); h.unmount(); h.strictSetup(); old.resolve({ private: 'old' }); await assert.rejects(pending, { name: 'AbortError' });
  });
});

describe('actual mobile lunch/cafe read hook render and stale response source', () => {
  beforeEach(() => suite.reset());
  test('changed query render masks old private snapshot before effects; old GET cannot overwrite new query', async () => {
    state.onRequest = async () => detail(); const h = mount(Read, { path: '/cafe/items/item' }); await update(h); assert.equal(h.tree.data.item.name, 'PRIVATE_ITEM');
    const pending = deferred(), latest = deferred(); state.onRequest = path => path === '/cafe/items/new' ? pending.promise : latest.promise;
    h.render({ path: '/cafe/items/new' }); assert.equal(h.tree.data, null); h.flush();
    h.update({ path: '/cafe/items/latest' }); pending.resolve(detail({ id: 'new', name: 'OLD_PRIVATE' })); await update(h); assert.equal(h.tree.data, null); latest.resolve(detail({ id: 'latest', name: 'NEW_PRIVATE' })); await update(h); assert.equal(h.tree.data.item.name, 'NEW_PRIVATE');
  });
  test('background and resumed first render hide cache; batched foreground generation cannot accept old in-flight GET', async () => {
    const pending = deferred(), fresh = deferred(); let n = 0; state.onRequest = () => ++n === 1 ? pending.promise : fresh.promise; const h = mount(Read, { path: '/cafe/items/item' });
    suite.foreground(false); suite.foreground(true); pending.resolve(detail()); await tick(); h.render(); h.flush();
    assert.equal(h.tree.data, null); assert.equal(h.tree.current(), false);
  });
  test('previous verified foreground stamp is masked synchronously on return even before fresh effects', async () => {
    state.onRequest = async () => detail(); const h = mount(Read, { path: '/cafe/items/item' }); await update(h);
    suite.foreground(false); h.render(); assert.equal(h.tree.data, null); h.flush(); suite.foreground(true); h.render(); assert.equal(h.tree.data, null);
  });
  test('fresh focus503 never reveals cached content; same-focus refresh503 keeps clearly stale snapshot but blocks actions', async () => {
    state.onRequest = async () => detail(); const h = mount(Read, { path: '/cafe/items/item' }); await update(h);
    state.onRequest = async () => { throw new ApiError('same503', 503); }; await h.tree.refresh(); h.update(); assert.equal(h.tree.data.item.name, 'PRIVATE_ITEM'); assert.equal(h.tree.error, 'same503');
    h.blur(); h.render(); assert.equal(h.tree.data, null); h.focus(); await update(h); assert.equal(h.tree.data, null); assert.equal(h.tree.loading, false); assert.equal(h.tree.current(), false);
  });
  test('definitive permission loss removes private snapshot and captured actions immediately; unmount late reply ignored', async () => {
    state.onRequest = async () => detail(); const h = mount(Read, { path: '/cafe/items/item' }); await update(h); const current = h.tree.current;
    state.onRequest = async () => { throw new ApiError('revoked', 403); }; await h.tree.refresh(); h.update(); assert.equal(h.tree.data, null); assert.equal(current(), false);
    const old = deferred(); state.onRequest = () => old.promise; const pending = h.tree.refresh(); h.unmount(); old.resolve(detail()); await pending; assert.equal(current(), false);
  });
  test('malformed2xx shape becomes error rather than empty; invalid route path performs no default fetch', async () => {
    state.onRequest = async () => ({ today: '2026-10-04', item: null }); const h = mount(Read, { path: '/cafe/items/item' }); await update(h); assert.equal(h.tree.data, null); assert.equal(h.tree.loading, false); assert.match(h.tree.error, /조회 결과/);
    const n = state.requests.length; const invalid = mount(Read, { path: null }); await update(invalid); assert.equal(state.requests.length, n); assert.equal(invalid.tree.loading, false);
  });
});

describe('actual mobile cafe immutable mutation hook source', () => {
  beforeEach(() => suite.reset());
  test('double submit causes one POST and captured callback cannot submit again after acknowledged success', async () => {
    const response = deferred(); state.onRequest = () => response.promise; const h = mount(Mutation), submit = h.tree.submit;
    const first = submit(submitInput()); await submit(submitInput()); assert.equal(writes().length, 1);
    response.resolve(proof(h.tree.attempt.current)); await first; h.update(); await submit(submitInput()); assert.equal(writes().length, 1); assert.equal(state.success.length, 1);
  });
  test('unknown201 freezes normalized original payload; retry checks receipt first then only404 permits same-key write', async () => {
    state.onRequest = async () => { throw new ApiError('truncated201', 201); }; const h = mount(Mutation); await h.tree.submit(submitInput()); h.update(); const original = structuredClone(writes()[0].body);
    state.onRequest = async (path, options) => { if (!options.method) throw new ApiError('missing', 404); return proof(h.tree.attempt.current); };
    await h.tree.retry(); h.update(); assert.deepEqual(writes()[1].body, original); assert.match(state.requests[1].path, /\/cafe\/mutations\//); assert.equal(state.success.length, 1);
  });
  test('receipt404 check alone preserves unknown attempt and never automatically resends', async () => {
    state.onRequest = async () => { throw new ApiError('lost', 0); }; const h = mount(Mutation); await h.tree.submit(submitInput()); h.update(); const original = h.tree.attempt.current;
    state.onRequest = async () => { throw new ApiError('missing', 404); }; await h.tree.check(); h.update(); assert.equal(writes().length, 1); assert.equal(h.tree.attempt.current, original); assert.equal(h.tree.state, 'uncertain');
  });
  test('malformed matching2xx and unknown then409 preserve attempt; definitive400 alone frees new-key correction', async () => {
    const h = mount(Mutation); state.onRequest = async () => ({ ok: true }); await h.tree.submit(submitInput()); h.update(); assert.equal(h.tree.state, 'uncertain');
    const original = h.tree.attempt.current; state.onRequest = async () => { throw new ApiError('conflict', 409); }; await h.tree.retry(); h.update(); assert.equal(h.tree.attempt.current, original); assert.equal(h.tree.state, 'uncertain'); assert.equal(h.tree.resetConflict(), false);
    suite.reset(); const clean = mount(Mutation); state.onRequest = async () => { throw new ApiError('invalid', 400, { name: '필수' }); }; await clean.tree.submit(submitInput()); clean.update(); assert.equal(clean.tree.attempt.current, null); assert.equal(clean.tree.state, 'idle'); assert.deepEqual(clean.tree.fields, { name: '필수' });
  });
  test('known409 keeps original attempt until explicit safe baseline choice, no hidden repeat', async () => {
    state.onRequest = async () => { throw new ApiError('changed', 409); }; const h = mount(Mutation); await h.tree.submit(submitInput()); h.update(); assert.equal(h.tree.state, 'conflict'); await h.tree.submit(submitInput()); assert.equal(writes().length, 1);
    assert.equal(h.tree.resetConflict(), true); h.update(); state.onRequest = async () => proof(h.tree.attempt.current); await h.tree.submit({ ...submitInput(), body: { ...submitInput().body, expectedUpdatedAt: newer } }); assert.notEqual(writes()[0].body.requestId, writes()[1].body.requestId); assert.equal(writes()[1].body.expectedUpdatedAt, newer);
  });
  test('permission loss purges original body but retains own receipt-only proof; old account late success is ignored', async () => {
    state.onRequest = async () => { throw new ApiError('forbidden', 403); }; const h = mount(Mutation); await h.tree.submit(submitInput()); h.update(); assert.equal(h.tree.attempt.current.body, null); assert.equal(state.loss, 1);
    state.onRequest = async () => proof(h.tree.attempt.current, { outcome: 'deleted', result: null }); await h.tree.check(); assert.equal(state.success.length, 1); assert.equal(writes().length, 1);
    suite.reset(); const old = deferred(); state.onRequest = () => old.promise; const late = mount(Mutation); const sent = late.tree.submit(submitInput()); state.account = false; old.resolve(proof(late.tree.attempt.current)); await sent; assert.equal(state.success.length, 0);
  });
  test('receipt validation uses immutable commit proof independently from fresh updated target and delete requires null evidence', () => {
    const expected = { requestId: 'known-request', operation: 'item.update', targetId: 'item' };
    assert.equal(core.isCafeMutation(proof(expected, { result: detail({ updatedAt: newer }) }), expected), true);
    assert.equal(core.isCafeMutation(proof(expected, { outcome: 'deleted', result: null }), expected), true);
    assert.equal(core.isCafeMutation(proof(expected, { committedUpdatedAt: null, outcome: 'deleted', result: null }), expected), false);
    const deleted = { ...expected, operation: 'item.delete' }; assert.equal(core.isCafeMutation(proof(deleted), deleted), true);
    for (const patch of [{ outcome: 'present' }, { result: detail() }, { committedUpdatedAt: iso }]) assert.equal(core.isCafeMutation(proof(deleted, patch), deleted), false);
  });
});

const screens = load('components/LunchCafeScreens.tsx');
describe('actual mobile meal/list/history and editor TSX source', () => {
  beforeEach(() => suite.reset());
  test('list filter change synchronously masks rows, late old refresh cannot publish foreign filter', async () => {
    state.onRequest = async () => page(); const h = mount(screens.CafeItemsScreen); await update(h); const oldRow = find(h, 'LunchCafeRow').onPress;
    find(h, 'TextAction', '기한 경과 1').onPress(); h.render(); assert.equal(nodes(h.tree).some(row => row.type === 'LunchCafeRow'), false); h.flush();
    oldRow(); assert.equal(state.routes.length, 0); await update(h); assert.equal(nodes(h.tree).some(row => row.type === 'LunchCafeRow'), false);
  });
  test('meal same route prop date changes mask old menu; invalid explicit date never falls back to today', async () => {
    state.onRequest = async path => meal(new URL('https://fixture.invalid' + path).searchParams.get('date') ?? undefined);
    const h = mount(screens.MealMenuScreen, { date: '2026-10-03' }); await update(h); assert.ok(JSON.stringify(h.tree).includes('PRIVATE_MENU_2026-10-03'));
    h.render({ date: '2026-10-04' }); assert.equal(JSON.stringify(h.tree).includes('PRIVATE_MENU_2026-10-03'), false); h.flush(); await update(h);
    h.render({ date: '1900-02-29' }); h.flush(); const n = state.requests.length; await update(h); assert.equal(state.requests.length, n); assert.equal(nodes(h.tree).some(row => row.type === 'LunchCafeRow'), false);
  });
  test('cold503 error is visible without false successful-empty menu and old navigation remains blocked after focus', async () => {
    state.onRequest = async () => meal(); const h = mount(screens.MealMenuScreen); await update(h); const next = find(h, 'TextAction', '다음 날').onPress;
    h.blur(); state.onRequest = async () => { throw new ApiError('503', 503); }; h.focus(); await update(h); next(); assert.equal(state.routes.length, 0); assert.equal(nodes(h.tree).some(row => row.type === 'LunchCafeRow'), false); assert.equal(JSON.stringify(h.tree).includes('등록된 메뉴가 없습니다.'), false);
  });
  test('notes delete cancel causes zero writes; double confirmation cannot dispatch duplicate delete', async () => {
    state.onRequest = async () => ({ notes: [{ id: 'note', content: '합성 메모', createdAt: iso, updatedAt: iso, createdBy: null }], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    const h = mount(screens.CafeNotesScreen); await update(h); state.confirm = false; await find(h, 'TextAction', '삭제').onPress(); assert.equal(writes().length, 0);
    state.confirm = true; const held = deferred(); state.onRequest = () => held.promise; const remove = find(h, 'TextAction', '삭제').onPress; const one = remove(), two = remove(); await tick(); assert.equal(writes().length, 1);
    held.resolve(proof({ requestId: writes()[0].body.requestId, operation: 'note.delete', targetId: 'note' })); await Promise.all([one, two]);
  });
});

describe('actual provider/read integration and editor input safety', () => {
  beforeEach(() => suite.reset());
  test('batched actual Android blur/focus fences previous GET then fresh read accepts only new generation', async () => {
    const Account = load('providers/LunchCafeProvider.tsx', 'AccountLunchCafe').QAExposed;
    const account = mount(Account, { token: 'captured-a', isAccount: () => state.account, expireSession: async token => state.expired.push(token) }); await update(account);
    state.context = find(account, 'LunchCafeContextProvider').value;
    const old = deferred(), fresh = deferred(); let n = 0; state.onRequest = () => ++n === 1 ? old.promise : fresh.promise;
    const h = mount(Read, { path: '/cafe/items/item' });
    for (const fn of state.listeners.get('blur')) fn(); for (const fn of state.listeners.get('focus')) fn();
    old.resolve(detail({ name: 'OLD_BEFORE_BLUR' })); await tick(); account.update(); state.context = find(account, 'LunchCafeContextProvider').value;
    h.render(); assert.equal(h.tree.data, null); h.flush(); fresh.resolve(detail({ name: 'FRESH_AFTER_CYCLE' })); await update(h);
    assert.equal(h.tree.data.item.name, 'FRESH_AFTER_CYCLE'); assert.equal(n, 2);
  });
  test('item editor validation/400 preserves all input and duplicate click sends once', async () => {
    const Editor = load('components/CafeWriteScreens.tsx').CafeItemEditorScreen;
    state.onRequest = async () => page(); const h = mount(Editor); await update(h);
    find(h, 'LunchCafeField', '물품명').onChange('입력 보존'); h.update(); find(h, 'LunchCafeField', '유통기한').onChange('2026-10-03'); h.update();
    state.onRequest = async () => { throw new ApiError('validation', 400, { name: '이름 오류' }); };
    const save = find(h, 'PrimaryButton', '저장').onPress; await Promise.all([save(), save()]); await update(h); assert.equal(writes().length, 1); assert.equal(find(h, 'LunchCafeField', '물품명').value, '입력 보존'); assert.equal(find(h, 'LunchCafeField', '유통기한').value, '2026-10-03');
  });
  test('edit409 keeps input; fresh GET does not mutate automatically; explicit adoption uses new token', async () => {
    const Editor = load('components/CafeWriteScreens.tsx').CafeItemEditorScreen;
    state.onRequest = async () => detail(); const h = mount(Editor, { id: 'item' }); await update(h);
    find(h, 'LunchCafeField', '구매 사유').onChange('내 입력'); h.update(); state.onRequest = async () => { throw new ApiError('changed', 409); }; await find(h, 'PrimaryButton', '저장').onPress(); await update(h);
    state.onRequest = async () => detail({ name: '최신 서버', updatedAt: newer });
    // Recovery is a real child component; invoke its published refresh callback rather than a cloned UI implementation.
    const recovery = nodes(h.tree).find(row => typeof row.type === 'function' && row.type.name === 'CafeRecovery'); await recovery.props.onRefresh(); await update(h);
    assert.equal(writes().length, 1); assert.equal(find(h, 'LunchCafeField', '구매 사유').value, '내 입력');
    await find(h, 'TextAction', '입력 유지·최신 기준 선택').onPress(); h.update(); state.onRequest = async () => { throw new ApiError('stop after payload', 400); };
    await find(h, 'PrimaryButton', '저장').onPress(); assert.equal(writes()[1].body.expectedUpdatedAt, newer); assert.equal(writes()[1].body.input.purchaseReason, '내 입력'); assert.notEqual(writes()[0].body.requestId, writes()[1].body.requestId);
  });
  test('editor fresh focus503 masks fields but successful fresh authorization restores dirty memory;403 wipes', async () => {
    const Editor = load('components/CafeWriteScreens.tsx').CafeItemEditorScreen;
    state.onRequest = async () => detail(); const h = mount(Editor, { id: 'item' }); await update(h); find(h, 'LunchCafeField', '물품명').onChange('PRIVATE_DIRTY'); h.update();
    h.blur(); state.onRequest = async () => { throw new ApiError('fresh503', 503); }; h.focus(); await update(h); assert.equal(nodes(h.tree).some(row => row.type === 'LunchCafeField'), false);
    state.onRequest = async () => detail(); find(h, 'LunchCafeReadState').retry(); await update(h); assert.equal(find(h, 'LunchCafeField', '물품명').value, 'PRIVATE_DIRTY');
    h.blur(); state.onRequest = async () => { throw new ApiError('revoked', 403); }; h.focus(); await update(h); assert.equal(JSON.stringify(h.tree).includes('PRIVATE_DIRTY'), false);
  });
  test('dirty leave cancel preserves input and stale account confirmation cannot dispatch removal', async () => {
    const Editor = load('components/CafeWriteScreens.tsx').CafeNoteEditorScreen;
    state.onRequest = async () => page(); const h = mount(Editor); await update(h); find(h, 'LunchCafeField', '준수사항').onChange('PRIVATE_UNSAVED'); h.update();
    state.confirm = false; h.prevent.fn({ data: { action: 'BACK' } }); await update(h); assert.equal(state.routes.length, 0); assert.equal(find(h, 'LunchCafeField', '준수사항').value, 'PRIVATE_UNSAVED');
    const pending = deferred(); state.confirm = () => pending.promise; h.prevent.fn({ data: { action: 'BACK' } }); state.account = false; pending.resolve(true); await tick(); assert.equal(state.routes.length, 0);
  });
});

describe('actual final mobile route/foreground/denied boundaries', () => {
  beforeEach(() => suite.reset());
  test('same-route date and history IDs produce distinct child keys; repeated route values remain invalid rather than default', () => {
    const mealRoute = load('app/meal-menu/index.tsx').default, historyRoute = load('app/cafe/history.tsx').default;
    state.params = { date: '0001-01-01' }; const a = mount(mealRoute); assert.equal(a.tree.key, '0001-01-01'); assert.equal(a.tree.props.date, '0001-01-01');
    state.params = { date: '0099-12-31' }; a.render(); assert.equal(a.tree.key, '0099-12-31');
    state.params = { date: ['2026-10-04', '2026-10-04'] }; a.render(); assert.equal(a.tree.props.date, ''); assert.equal(a.tree.key, '');
    state.params = { itemId: 'old' }; const b = mount(historyRoute); assert.equal(b.tree.key, 'old'); state.params = { itemId: 'new' }; b.render(); assert.equal(b.tree.key, 'new');
  });
  test('mutation response after batched foreground cycle preserves original unknown attempt, then only receipt GET restores success', async () => {
    const old = deferred(); state.onRequest = () => old.promise; const h = mount(Mutation); const sent = h.tree.submit(submitInput()); const original = h.tree.attempt.current;
    suite.foreground(false); suite.foreground(true); old.resolve(proof(original)); await sent; h.update(); assert.equal(state.success.length, 0); assert.equal(h.tree.state, 'uncertain'); assert.equal(h.tree.attempt.current, original);
    state.onRequest = async () => proof(original); await h.tree.check(); assert.equal(state.success.length, 1); assert.equal(writes().length, 1); assert.equal(state.requests.at(-1).path, '/cafe/mutations/' + original.requestId);
  });
  test('definitive fresh403 clears dirty memory and original attempt body but keeps minimal own receipt recovery', async () => {
    const Editor = load('components/CafeWriteScreens.tsx').CafeItemEditorScreen;
    state.onRequest = async () => detail(); const h = mount(Editor, { id: 'item' }); await update(h); find(h, 'LunchCafeField', '물품명').onChange('PRIVATE_PENDING'); h.update();
    state.onRequest = async () => { throw new ApiError('lost', 0); }; await find(h, 'PrimaryButton', '저장').onPress(); await update(h); const key = writes()[0].body.requestId;
    h.blur(); state.onRequest = async () => { throw new ApiError('revoked', 403); }; h.focus(); await update(h); assert.equal(JSON.stringify(h.tree).includes('PRIVATE_PENDING'), false);
    const recovery = nodes(h.tree).find(row => typeof row.type === 'function' && row.type.name === 'CafeRecovery'); assert.equal(recovery.props.mutation.attempt.current.body, null); assert.equal(recovery.props.mutation.attempt.current.requestId, key);
    state.onRequest = async () => proof({ requestId: key, operation: 'item.update', targetId: 'item' }, { outcome: 'deleted', result: null }); await recovery.props.mutation.check(); await update(h); assert.equal(writes().length, 1);
  });
});
