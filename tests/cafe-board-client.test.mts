import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, test } from 'node:test';
import ts from 'typescript';
// Actual unchanged web TSX/hooks with lexical React, DOM FormData and server-action ports.
// No browser, cookie/session, network, DB, native dialog or visual verification claim.
const require = createRequire(import.meta.url), state: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
let active: Hooks;
function activate(scope: Hooks) { active = scope; }
const same = (a: unknown[] | undefined, b: unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function cell(kind: string) { const i = active.cursor++; const c = active.cells[i] ??= { kind }; assert.equal(c.kind, kind); return c; }
const effect = (fn: () => unknown, deps?: unknown[]) => { const c = cell('effect'); if (!same(c.deps, deps)) { c.deps = deps; c.fn = fn; active.effects.push(c); } };
const react = {
  useRef(v: unknown) { return cell('ref').ref ??= { current: v }; },
  useState(v: unknown) { const c = cell('state'); if (!Object.hasOwn(c, 'value')) c.value = typeof v === 'function' ? v() : v; c.set ??= (next: unknown) => { c.value = typeof next === 'function' ? next(c.value) : next; }; return [c.value, c.set]; },
  useEffect: effect, useLayoutEffect: effect,
  useCallback(fn: unknown, deps: unknown[]) { const c = cell('callback'); if (!same(c.deps, deps)) { c.deps = deps; c.fn = fn; } return c.fn; },
  useId: () => 'qa-' + active.cursor++,
  useActionState(action: (previous: Row, payload: FormData) => Promise<Row>, initial: Row) { const c = cell('action'); c.value ??= initial; c.dispatch ??= async (payload: FormData) => { c.value = await action(c.value, payload); }; return [c.value, c.dispatch, false]; },
  startTransition(fn: () => unknown) { state.jobs.push(Promise.resolve(fn())); },
};
class SyntheticFormData extends FormData { constructor(form?: { values: Record<string, string> }) { super(); for (const [key, value] of Object.entries(form?.values ?? {})) this.set(key, value); } }
const jsx = (type: unknown, props: Row, key: unknown) => ({ type, props: props ?? {}, key });
const actions: Row = {};
for (const name of ['createCafeItemAction', 'updateCafeItemAction', 'deleteCafeItemAction', 'holdCafeItemExpirationAction', 'createCafeComplianceNoteAction', 'deleteCafeComplianceNoteAction']) actions[name] = async (...args: unknown[]) => { const form = args.at(-1) as FormData; state.calls.push({ name, values: Object.fromEntries(form.entries()) }); return state.action(name, ...args); };
actions.getCafeMutationStatusAction = async (key: string, actor: string) => { state.statusCalls.push({ key, actor }); return state.status(key, actor); };
actions.getCafeItemEditorAction = async (id: string, actor: string) => { state.editorCalls.push({ id, actor }); return state.editor(id, actor); };
actions.getCafeNoteEditorAction = async (id: string, actor: string) => { state.editorCalls.push({ id, actor }); return state.editor(id, actor); };
const cache = new Map<string, Row>();
function load(file: string, expose = ''): Row {
  const key = file + expose; if (cache.has(key)) return cache.get(key)!;
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8') + (expose ? `\nexport const QAExposed = ${expose};\n` : '');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = { exports: {} as Row };
  new Function('require', 'module', 'exports', 'FormData', 'crypto', code)((name: string) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'next/navigation') return { useRouter: () => ({ refresh: () => state.refreshes++ }), unstable_rethrow: require('next/navigation').unstable_rethrow };
    if (name === '@/app/work-schedule/cafe/actions') return actions;
    if (name === '@/components/app-modal') return { AppModal: 'AppModal' };
    if (name === '@/components/confirm-submit-button') return { ConfirmSubmitButton: 'ConfirmSubmitButton' };
    if (name.startsWith('@/')) return load(name.slice(2) + (name.startsWith('@/components/') && name !== '@/components/use-cafe-mutation' ? '.tsx' : '.ts'));
    return require(name);
  }, result, result.exports, SyntheticFormData, { randomUUID });
  cache.set(key, result.exports); return result.exports;
}
class Hooks {
  cells: Row[] = []; effects: Row[] = []; cursor = 0; tree: Row = {}; props: Row;
  constructor(public fn: (props: Row) => Row, props: Row = {}) { this.props = props; }
  render(props: Row = {}) { this.props = { ...this.props, ...props }; activate(this); this.cursor = 0; this.tree = this.fn(this.props); return this.tree; }
  flush() { activate(this); for (const c of this.effects.splice(0)) { c.cleanup?.(); c.cleanup = c.fn(); } }
  update(props: Row = {}) { this.render(props); this.flush(); }
  unmount() { for (const c of this.cells) c.cleanup?.(); }
}
const scopes: Hooks[] = [];
const mount = (fn: (props: Row) => Row, props: Row = {}) => { const h = new Hooks(fn, props); scopes.push(h); h.update(); return h; };
function nodes(node: unknown): Row[] { if (Array.isArray(node)) return node.flatMap(nodes); if (!node || typeof node !== 'object') return []; const row = node as Row; return [row, ...Object.values(row.props ?? {}).flatMap(nodes)]; }
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const settle = async (h: Hooks) => { await Promise.all(state.jobs.splice(0)); await tick(); h.update(); h.update(); };
const iso = '2026-10-04T03:00:00.000Z', newer = '2026-10-04T03:00:00.001Z';
const item = (patch: Row = {}) => ({ id: 'item', name: '물품', category: 'food', purchasedAt: '2026-10-01', priceWon: 0, purchaseReason: '내 입력', expirationDate: '2026-10-03', expirationHoldReason: null, isHeld: false, usage: { basisLabel: '유통기한', label: '경과', status: 'expired' }, createdAt: iso, updatedAt: iso, ...patch });
const receipt = (form: FormData | Row, operation = 'item.create', patch: Row = {}) => { const values = form instanceof SyntheticFormData ? Object.fromEntries(form.entries()) : form; return { ok: true, message: '확정', replayed: false, requestId: values.cafeRequestId, operation, targetType: operation.startsWith('item.') ? 'CafeItem' : 'CafeComplianceNote', targetId: 'item', outcome: operation.endsWith('.delete') ? 'deleted' : 'present', committedAt: iso, committedUpdatedAt: operation.endsWith('.delete') ? null : iso, result: operation.endsWith('.delete') ? null : { today: '2026-10-04', item: item() }, ...patch }; };
const mutationHook = load('components/use-cafe-mutation.ts');
const Hook = ({ actorId = 'actor', targetId, token, operation = 'item.create' }: Row) => mutationHook.useCafeMutation(actions.createCafeItemAction, { actorId, targetId, expectedUpdatedAt: token, operation });
const form = (values: Row = {}) => ({ values: { name: 'PRIVATE_INPUT', purchasedAt: '2026-10-01', category: 'food', expirationDate: '2026-10-03', priceWon: '0', purchaseReason: 'PRIVATE_REASON', ...values }, resets: 0, reset() { this.resets++; } });
const event = (target: ReturnType<typeof form>) => ({ preventDefault() {}, currentTarget: target });

describe('cafe web actual source scope', () => {
beforeEach(() => { for (const h of scopes.splice(0)) h.unmount(); Object.assign(state, { calls: [], statusCalls: [], editorCalls: [], jobs: [], refreshes: 0 }); state.action = async () => ({}); state.status = async () => ({ ok: false, status: 404, code: 'NOT_FOUND', error: '없음' }); state.editor = async () => ({ ok: true, data: { today: '2026-10-04', item: item({ updatedAt: newer }) } }); });

describe('actual cafe web immutable mutation hook', () => {
  test('double submit dispatches one action and successful proof refreshes without duplicate effect', async () => {
    state.action = async (_name: string, _previous: Row, body: FormData) => ({ receipt: receipt(body) });
    const h = mount(Hook), target = form(); h.tree.onSubmit(event(target)); h.tree.onSubmit(event(target)); await settle(h);
    assert.equal(state.calls.length, 1); assert.equal(state.refreshes, 1); assert.ok(h.tree.state.success); assert.equal(h.tree.pending, false);
  });
  test('unknown action outcome preserves same-key original form payload; status-first404 allows explicit same attempt retry', async () => {
    state.action = async () => { throw Error('provider-loss'); }; const h = mount(Hook), target = form(); h.tree.onSubmit(event(target)); await settle(h); const first = state.calls[0].values;
    target.values.name = 'CHANGED_AFTER_LOSS'; state.action = async (_name: string, _previous: Row, body: FormData) => ({ receipt: receipt(body) }); h.tree.onSubmit(event(target)); await settle(h);
    assert.equal(state.statusCalls.length, 1); assert.equal(state.statusCalls[0].actor, 'actor'); assert.equal(state.statusCalls[0].key, first.cafeRequestId); assert.deepEqual(state.calls[1].values, first);
  });
  test('existing receipt projects newer body independent of original commit token, then never repeats action', async () => {
    state.action = async () => ({ error: 'unknown', status: 500 }); const h = mount(Hook), target = form(); h.tree.onSubmit(event(target)); await settle(h);
    state.status = async () => ({ ok: true, data: receipt(state.calls[0].values, 'item.create', { result: { today: '2026-10-04', item: item({ updatedAt: newer }) } }) }); h.tree.onSubmit(event(target)); await settle(h); assert.equal(state.calls.length, 1); assert.equal(state.refreshes, 1);
  });
  test('malformed2xx receipt and later503 retain original attempt without assuming save or replacing key', async () => {
    state.action = async (_name: string, _previous: Row, body: FormData) => ({ receipt: receipt(body, 'item.create', { committedUpdatedAt: null }) }); const h = mount(Hook), target = form(); h.tree.onSubmit(event(target)); await settle(h); assert.equal(h.tree.unknown, true);
    state.status = async () => ({ ok: false, status: 503, code: 'UNAVAILABLE', error: '확인 실패' }); h.tree.onSubmit(event(target)); await settle(h); assert.equal(state.calls.length, 1); assert.equal(h.tree.unknown, true); assert.equal(h.tree.pending, false);
  });
  test('known conflict does not automatically refresh/retry and preserves form; explicit adoption selects new token/key', async () => {
    state.action = async () => ({ error: 'changed', status: 409, code: 'ITEM_CONFLICT' }); const h = mount(Hook, { targetId: 'item', token: iso, operation: 'item.update' }), target = form(); h.tree.onSubmit(event(target)); await settle(h);
    h.tree.onSubmit(event(target)); await settle(h); assert.equal(state.calls.length, 1); assert.equal(h.tree.conflict, true); assert.equal(target.resets, 0);
    h.tree.adoptBaseline(newer); h.update(); state.action = async () => ({ error: 'validation', status: 400, code: 'VALIDATION_ERROR' }); h.tree.onSubmit(event(target)); await settle(h); assert.equal(state.calls[1].values.expectedUpdatedAt, newer); assert.notEqual(state.calls[0].values.cafeRequestId, state.calls[1].values.cafeRequestId);
  });
  test('account change erases form and fences late action, unmount also prevents refresh or publication', async () => {
    let resolve!: (v: Row) => void; state.action = () => new Promise<Row>(yes => { resolve = yes; }); const h = mount(Hook), target = form(); h.tree.onSubmit(event(target)); const values = state.calls[0].values;
    h.update({ actorId: 'different-actor' }); resolve({ receipt: receipt(values) }); await settle(h); assert.equal(target.resets, 1); assert.equal(state.refreshes, 0); assert.equal(h.tree.erased, true);
    const second = mount(Hook); second.tree.onSubmit(event(form())); second.unmount(); resolve({ receipt: receipt(state.calls.at(-1).values) }); await settle(second); assert.equal(state.refreshes, 0);
  });
  test('receipt auth403 wipes original private payload and form instead of resubmitting', async () => {
    state.action = async () => ({ error: 'lost', status: 500 }); const h = mount(Hook), target = form(); h.tree.onSubmit(event(target)); await settle(h);
    state.status = async () => ({ ok: false, status: 403, code: 'FORBIDDEN', error: '권한 변경' }); h.tree.onSubmit(event(target)); await settle(h); assert.equal(target.resets, 1); assert.equal(h.tree.erased, true); assert.equal(state.calls.length, 1);
  });
});

describe('actual web cafe date and form TSX', () => {
  test('four-digit date keeps full Gregorian hidden values 0001/0099/0100/1900/2000/9999', () => {
    const DateInput = load('components/cafe-item-date-input.tsx').CafeItemDateInput;
    for (const value of ['0001-01-01', '0099-12-31', '0100-01-01', '1900-02-28', '2000-02-29', '9999-12-31']) {
      const h = mount(DateInput, { defaultValue: value, label: '구매일', name: 'purchasedAt' }), inputs = nodes(h.tree).filter(v => v.type === 'input');
      assert.equal(inputs.find(v => v.props.type === 'hidden')!.props.value, value); assert.equal(inputs.find(v => v.props['aria-label'] === '구매일 년')!.props.maxLength, 4); assert.equal(inputs.find(v => v.props['aria-label'] === '구매일 년')!.props.value, value.slice(0, 4));
    }
  });
  test('date field edits cannot create invalid leap or silently remap 1900 into another century', () => {
    const DateInput = load('components/cafe-item-date-input.tsx').CafeItemDateInput, h = mount(DateInput, { defaultValue: '2000-02-29', label: '구매일', name: 'purchasedAt' });
    nodes(h.tree).find(v => v.props?.['aria-label'] === '구매일 년')!.props.onChange({ target: { value: '1900' } }); h.update(); const value = nodes(h.tree).find(v => v.type === 'input' && v.props.type === 'hidden')!.props.value; assert.ok(value === '' || value === '1900-02-28'); assert.ok(!value.startsWith('20'));
  });
  test('registration state uses real mutation hook and disables private fields after unknown result', async () => {
    const Registration = load('components/cafe-item-registration-form.tsx').CafeItemRegistrationForm, Fields = load('components/cafe-item-registration-form.tsx', 'CafeItemRegistrationFormFields').QAExposed;
    const outer = mount(Registration, { actorId: 'actor', today: '2026-10-04' }); state.action = async () => ({ error: 'lost', status: 500 });
    outer.tree.props.mutation.onSubmit(event(form())); await settle(outer);
    const fields = mount(Fields, outer.tree.props); assert.equal(nodes(fields.tree).find(v => v.type === 'fieldset')!.props.disabled, true); assert.ok(nodes(fields.tree).some(v => v.type === 'button' && v.props.children === '같은 요청 결과 확인'));
  });
});

function SharedMutationGroup() {
  const gate = react.useRef(false);
  return Object.fromEntries([['update', 'updateCafeItemAction', 'item.update'], ['hold', 'holdCafeItemExpirationAction', 'item.hold'], ['remove', 'deleteCafeItemAction', 'item.delete']].map(([name, action, operation]) => [name, mutationHook.useCafeMutation(actions[action].bind(null, 'item'), { actorId: 'actor', operation, targetId: 'item', expectedUpdatedAt: iso }, gate)]));
}
describe('actual web shared action and captured callback fences', () => {
  test('unknown update owns shared gate: hold/delete and baseline adoption remain blocked until exact receipt resolves', async () => {
    state.action = async () => ({ error: 'lost', status: 0 }); const h = mount(SharedMutationGroup), target = form(); h.tree.update.onSubmit(event(target)); await settle(h);
    assert.equal(h.tree.update.unknown, true); h.tree.hold.onSubmit(event(target)); h.tree.remove.onSubmit(event(target)); assert.equal(state.calls.length, 1); assert.equal(h.tree.hold.adoptBaseline(newer), false);
    state.status = async () => ({ ok: true, data: receipt(state.calls[0].values, 'item.update') }); h.tree.update.onSubmit(event(target)); await settle(h); assert.equal(state.calls.length, 1); assert.equal(state.refreshes, 1);
  });
  test('stale preflight submit and adoption callbacks cannot reset a newer unknown attempt', async () => {
    state.action = async () => ({ error: 'changed', status: 409, code: 'ITEM_CONFLICT' }); const h = mount(Hook, { targetId: 'item', token: iso, operation: 'item.update' }), target = form(); const oldSubmit = h.tree.onSubmit;
    h.tree.onSubmit(event(target)); await settle(h); const staleAdopt = h.tree.adoptBaseline;
    assert.equal(h.tree.adoptBaseline(newer), true); h.update(); oldSubmit(event(target)); await settle(h); assert.equal(state.calls.length, 1);
    state.action = async () => ({ error: 'unknown', status: 408 }); h.tree.onSubmit(event(target)); await settle(h); assert.equal(h.tree.unknown, true); assert.equal(staleAdopt(iso), false); assert.equal(h.tree.token, newer);
    assert.doesNotThrow(() => assert.equal(h.tree.adoptBaseline('not-time'), false));
  });
  test('definitive target404 wipes form and blocks captured edit; own receipt404 preserves unknown for same-key retry', async () => {
    state.action = async () => ({ error: 'missing-target', status: 404, code: 'NOT_FOUND' }); const h = mount(Hook, { targetId: 'item', token: iso, operation: 'item.update' }), target = form(); const old = h.tree.onSubmit;
    old(event(target)); await settle(h); assert.equal(h.tree.erased, true); assert.equal(target.resets, 1); old(event(target)); await settle(h); assert.equal(state.calls.length, 1);
  });
  test('captured note fresh callback cannot issue GET or unlock another pending delete after baseline adoption', async () => {
    const Delete = load('components/cafe-compliance-board.tsx', 'CafeNoteDeleteForm').QAExposed;
    const note = { id: 'note', content: 'PRIVATE_NOTE', createdAt: iso, updatedAt: iso, createdBy: null };
    state.action = async () => ({ error: 'changed', status: 409, code: 'NOTE_CONFLICT' }); const h = mount(Delete, { actorId: 'actor', note });
    nodes(h.tree).find(v => v.type === 'form')!.props.onSubmit(event(form())); await settle(h);
    const oldFresh = nodes(h.tree).find(v => v.type === 'button' && v.props.children === '최신 준수사항 확인')!.props.onClick;
    state.editor = async () => ({ ok: true, data: { ...note, updatedAt: newer } }); await oldFresh(); h.update(); nodes(h.tree).find(v => v.type === 'button' && v.props.children === '최신 기준 사용')!.props.onClick(); h.update();
    let release!: (v: Row) => void; state.action = () => new Promise<Row>(yes => { release = yes; }); nodes(h.tree).find(v => v.type === 'form')!.props.onSubmit(event(form()));
    await oldFresh(); assert.equal(state.editorCalls.length, 1); const count = state.calls.length; nodes(h.tree).find(v => v.type === 'form')!.props.onSubmit(event(form())); assert.equal(state.calls.length, count);
    release({ error: 'known invalid', status: 400 }); await settle(h);
  });
});

});
