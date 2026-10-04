import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { keyboardScrollOffset } from '../mobile/src/lib/keyboard-layout';

type Props = Record<string, unknown>;
type Tree = { type: unknown; props: Props & { ref: { current: unknown } } };
type Effect = () => void | (() => void);
type Cell = { value?: unknown; deps?: unknown[]; cleanup?: () => void; effect?: Effect };
type Success = (left: number, top: number, width: number, height: number) => void;
const source = readFileSync(new URL('../mobile/src/components/keyboard-scroll-view.tsx', import.meta.url), 'utf8');
const sourceSha = createHash('sha256').update(source).digest('hex');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

// Execute the production hook and both adapters; only React/native/context/RAF ports are synthetic.
function harness(kind: 'scroll' | 'list' = 'scroll', os = 'android', props: Props = {}) {
  const cells: Cell[] = [], effects: Cell[] = [], frames = new Map<number, FrameRequestCallback>();
  const measurements: { success: Success; fail: () => void; ancestor: unknown }[] = [];
  const calls: { x: number; y: number; animated: boolean }[] = [];
  let cursor = 0, nextFrame = 0;
  const viewport = { focused: true, revision: 0 };
  const inner = {};
  const makeInput = () => ({ measureLayout(ancestor: unknown, success: Success, fail: () => void) { measurements.push({ ancestor, success, fail }); } });
  const state = { input: makeInput() as ReturnType<typeof makeInput> | null };
  const scroll = { getInnerViewRef: () => inner, scrollTo: (value: typeof calls[number]) => calls.push(value) };
  const list = { getScrollResponder: () => scroll };
  const cell = () => cells[cursor++] ??= {};
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const effect = (fn: Effect, deps: unknown[]) => { const c = cell(); if (!same(c.deps, deps)) { c.deps = deps; c.effect = fn; effects.push(c); } };
  const react = {
    useRef(value: unknown) { const c = cell(); return c.value ??= { current: value }; },
    useCallback<T>(value: T, deps: unknown[]) { const c = cell(); if (!same(c.deps, deps)) { c.deps = deps; c.value = value; } return c.value as T; },
    useLayoutEffect: effect,
    useImperativeHandle(ref: { current: unknown } | ((value: unknown) => void) | null | undefined, create: () => unknown, deps: unknown[]) {
      effect(() => { const assign = (value: unknown) => { if (typeof ref === 'function') ref(value); else if (ref) ref.current = value; }; assign(create()); return () => assign(null); }, [...deps, ref]);
    },
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx: (type: unknown, value: Tree['props']) => ({ type, props: value }) },
    'react-native': { ScrollView: 'ScrollView', FlatList: 'FlatList', Platform: { OS: os }, TextInput: { State: { currentlyFocusedInput: () => state.input } } },
    '@/components/keyboard-screen': { useKeyboardViewport: () => viewport },
    '@/lib/keyboard-layout': { keyboardScrollOffset },
  };
  const evaluated = { exports: {} as { KeyboardScrollView: (props: Props) => Tree; KeyboardFlatList: (props: Props) => Tree } };
  new Function('require', 'module', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', output)(
    (name: keyof typeof modules) => { assert.ok(name in modules, 'Unexpected boundary ' + name); return modules[name]; }, evaluated, evaluated.exports,
    (fn: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, fn); return id; }, (id: number) => frames.delete(id),
  );
  let tree: Tree;
  const render = () => {
    cursor = 0;
    tree = (kind === 'scroll' ? evaluated.exports.KeyboardScrollView : evaluated.exports.KeyboardFlatList)(props);
    tree.props.ref.current = kind === 'scroll' ? scroll : list;
    for (const c of effects.splice(0)) { c.cleanup?.(); c.cleanup = c.effect?.() || undefined; }
    return tree;
  };
  render();
  const fire = (name: string, event: unknown) => { const fn = tree.props[name]; assert.equal(typeof fn, 'function'); (fn as (event: unknown) => void)(event); };
  const layout = (height = 200) => fire('onLayout', { nativeEvent: { layout: { height } } });
  const scrollEvent = (y: number, x = 0, height = 200) => fire('onScroll', { nativeEvent: { contentOffset: { x, y }, layoutMeasurement: { height } } });
  const raf = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(0); } };
  const unmount = () => { for (const c of cells) c.cleanup?.(); };
  return { viewport, state, props, calls, frames, measurements, makeInput, scroll, list, inner, render, fire, layout, scrollEvent, raf, unmount, tree: () => tree };
}

for (const kind of ['scroll', 'list'] as const) {
  test(`${kind}: actual wrapper reveals only the hidden input and preserves public ref/caller events`, () => {
    const ref = { current: null as unknown }, events: [string, unknown][] = [];
    const data = [{ id: 'row' }], item = () => null;
    const h = harness(kind, 'ios', { ref, data, renderItem: item, keyboardShouldPersistTaps: 'handled', scrollEventThrottle: 50,
      onLayout: (e: unknown) => events.push(['layout', e]), onScroll: (e: unknown) => events.push(['scroll', e]), onFocus: (e: unknown) => events.push(['focus', e]), onBlur: (e: unknown) => events.push(['blur', e]) });
    assert.equal(ref.current, kind === 'scroll' ? h.scroll : h.list);
    assert.equal(h.tree().props.scrollEventThrottle, 50);
    assert.equal(h.tree().props.data, data); assert.equal(h.tree().props.renderItem, item);
    h.layout(); h.scrollEvent(100, 5); const focusEvent = { nativeEvent: { target: 'input' } }; h.fire('onFocus', focusEvent); h.raf();
    assert.equal(h.measurements.length, 1); assert.equal(h.measurements[0].ancestor, h.inner);
    h.measurements[0].success(0, 320, 100, 40);
    assert.deepEqual(h.calls, [{ x: 5, y: 168, animated: true }]);
    assert.deepEqual(events.map(([name]) => name), ['layout', 'scroll', 'focus']); assert.equal(events[2][1], focusEvent);
    h.fire('onBlur', focusEvent); assert.equal(events[3][0], 'blur'); h.unmount(); assert.equal(ref.current, null);
  });
}

test('visible input stays in place; a clipped upper input moves only to its visible margin', () => {
  const h = harness(); h.layout(); h.scrollEvent(100); h.raf(); h.measurements[0].success(0, 110, 100, 40); assert.equal(h.calls.length, 0);
  h.fire('onFocus', {}); h.raf(); h.measurements[1].success(0, 20, 100, 40); assert.equal(h.calls[0].y, 12);
});

test('only one RAF is pending and revision changes invalidate held native measurements', () => {
  const h = harness(); h.layout(); h.fire('onFocus', {}); h.fire('onFocus', {}); assert.equal(h.frames.size, 1);
  h.raf(); const old = h.measurements[0]; h.viewport.revision++; h.render(); old.success(0, 350, 100, 40); assert.equal(h.calls.length, 0);
  h.raf(); h.measurements[1].success(0, 350, 100, 40); assert.equal(h.calls.length, 1);
});

test('switching focused input discards the old async measurement', () => {
  const h = harness(); h.layout(); h.raf(); h.state.input = h.makeInput(); h.measurements[0].success(0, 350, 100, 40); assert.equal(h.calls.length, 0);
});

for (const action of ['blur', 'hide', 'unmount', 'drag'] as const) {
  test(`${action} cancels RAF and invalidates already-held measurement callbacks`, () => {
    const forwarded: unknown[] = [];
    const h = harness('scroll', 'android', { onScrollBeginDrag: (e: unknown) => forwarded.push(e) }); h.layout(); h.raf();
    const event = { nativeEvent: { target: 'scroll' } };
    if (action === 'blur') h.fire('onBlur', event);
    if (action === 'hide') { h.viewport.focused = false; h.render(); }
    if (action === 'unmount') h.unmount();
    if (action === 'drag') h.fire('onScrollBeginDrag', event);
    h.measurements[0].success(0, 350, 100, 40); assert.equal(h.calls.length, 0); assert.equal(h.frames.size, 0);
    if (action === 'drag') assert.equal(forwarded[0], event);
  });
}

test('non-ancestor measurement failure is a no-op', () => {
  const h = harness(); h.layout(); h.raf(); h.measurements[0].fail(); assert.equal(h.calls.length, 0);
});

test('web or a hidden keyboard does not schedule native focus measurement', () => {
  const web = harness('scroll', 'web'); web.layout(); web.fire('onFocus', {}); assert.equal(web.frames.size, 0); assert.equal(web.measurements.length, 0);
  const hidden = harness(); hidden.viewport.focused = false; hidden.render(); hidden.layout(); hidden.fire('onFocus', {}); assert.equal(hidden.frames.size, 0);
});

test('content-size changes preserve the caller and remeasure growing multiline content', () => {
  const seen: unknown[] = [];
  const h = harness('scroll', 'ios', { onContentSizeChange: (width: number, height: number) => seen.push([width, height]) });
  h.layout(); h.raf(); const old = h.measurements[0];
  const change = h.tree().props.onContentSizeChange as (width: number, height: number) => void;
  change(300, 1000); assert.deepEqual(seen, [[300, 1000]]); assert.equal(h.frames.size, 1);
  old.success(0, 150, 100, 40); assert.equal(h.calls.length, 0);
  h.raf(); h.measurements[1].success(0, 150, 100, 120); assert.equal(h.calls[0].y, 78);
});

test('the regression harness pins the executed production wrapper source', context => {
  context.diagnostic(`keyboard-scroll-view.tsx sha256 ${sourceSha}`); assert.match(sourceSha, /^[a-f0-9]{64}$/);
});
