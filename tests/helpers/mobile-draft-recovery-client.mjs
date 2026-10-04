import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
export const tick = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export function nodes(value) { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object') return []; return [value, ...Object.values(value.props ?? {}).flatMap(nodes)]; }

// Fake protected OS effects are independent from acknowledgements. A restart
// copies only disk, while actual storage/core modules and all refs are recreated.
export function createProtectedPort(disk = new Map()) {
  const state = { disk, calls: [], available: true, handler: null };
  const run = async (operation, key, value, options) => {
    const call = { operation, key, value, options, applied: false, apply() {
      assert.equal(this.applied, false, 'an OS effect may be applied only once');
      this.applied = true;
      if (operation === 'set') disk.set(key, value);
      if (operation === 'remove') disk.delete(key);
      return operation === 'get' ? disk.get(key) ?? null : undefined;
    } };
    state.calls.push(call);
    return state.handler ? state.handler(call) : call.apply();
  };
  const port = {
    available: async () => state.available,
    get: key => run('get', key), set: (key, value) => run('set', key, value), remove: key => run('remove', key),
  };
  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'synthetic-this-device-only',
    isAvailableAsync: port.available,
    getItemAsync: (key, options) => run('get', key, undefined, options),
    setItemAsync: (key, value, options) => run('set', key, value, options),
    deleteItemAsync: (key, options) => run('remove', key, undefined, options),
  };
  return { state, port, secureStore, restart: () => createProtectedPort(new Map(disk)) };
}

// Production TS/TSX modules run unchanged. Only external boundaries are lexical;
// global Date, FormData, timers, storage and React are never replaced.
export function createDraftRecoveryHarness({ protectedPort = createProtectedPort(), os = 'ios' } = {}) {
  let active;
  const activate = scope => { active = scope; };
  const state = {
    session: { token: 'synthetic-a', user: { id: 'actor-a', name: 'Synthetic A' }, loading: false },
    contexts: new Map(), requests: [], routes: [], expired: [], confirmations: [], confirm: true,
    listeners: new Map(), timers: new Map(), timerId: 0, picks: [], uploads: [], cleanup: [],
    platform: os, appState: 'active', params: {}, clock: new Date('2026-10-04T03:00:00.000Z').getTime(),
    onRequest: async () => { throw Error('Unexpected request'); },
    onFetch: async () => { throw Error('Unexpected fetch'); },
    onPick: async () => ({ canceled: true }),
    onUpload: async () => undefined,
  };
  const cell = kind => { const i = active.cursor++; const c = active.cells[i] ??= { kind }; assert.equal(c.kind, kind); return c; };
  const effect = (kind, fn, deps) => { const c = cell(kind); if (!same(c.deps, deps)) { c.deps = deps; c.fn = fn; active.effects.push(c); } };
  const react = {
    useRef(v) { return cell('ref').ref ??= { current: v }; },
    useState(v) { const c = cell('state'); if (!Object.hasOwn(c, 'value')) c.value = typeof v === 'function' ? v() : v; c.set ??= next => { c.value = typeof next === 'function' ? next(c.value) : next; }; return [c.value, c.set]; },
    useReducer(reducer, initial, init) { const [value, set] = react.useState(() => init ? init(initial) : initial); return [value, action => set(v => reducer(v, action))]; },
    useCallback(fn, deps) { const c = cell('callback'); if (!same(c.deps, deps)) { c.deps = deps; c.value = fn; } return c.value; },
    useMemo(fn, deps) { const c = cell('memo'); if (!same(c.deps, deps)) { c.deps = deps; c.value = fn(); } return c.value; },
    useEffect: (fn, deps) => effect('effect', fn, deps), useLayoutEffect: (fn, deps) => effect('layout', fn, deps),
    createContext(initial) { const context = { initial }; context.Provider = { context }; return context; },
    useContext(context) { return state.contexts.has(context) ? state.contexts.get(context) : context.initial; },
    useSyncExternalStore(subscribe, getSnapshot) { const snapshot = getSnapshot(); react.useEffect(() => subscribe(() => undefined), [subscribe]); return snapshot; },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const router = Object.fromEntries(['push', 'replace', 'setParams', 'back'].map(method => [method, value => state.routes.push({ method, value })]));
  const request = async (path, options = {}) => { const call = { path, ...options }; state.requests.push(call); return state.onRequest(path, options); };
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput', 'ScrollView', 'FlatList', 'Switch', 'Modal', 'ActivityIndicator', 'KeyboardAvoidingView'].map(v => [v, v]));
  const controls = Object.fromEntries(['ErrorState', 'PrimaryButton', 'TextAction', 'AccountFeedback'].map(v => [v, v]));
  const listeners = (name, fn) => { const bucket = state.listeners.get(name) ?? new Set(); bucket.add(fn); state.listeners.set(name, bucket); return { remove: () => bucket.delete(fn) }; };
  const noPlainStorage = new Proxy({}, { get() { throw Error('Recovery must not use plaintext fallback storage'); } });
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ...native, Platform: { get OS() { return state.platform; } }, StyleSheet: { create: v => v }, AppState: { get currentState() { return state.appState; }, addEventListener: listeners } },
    'expo-router': { router, useLocalSearchParams: () => state.params, useFocusEffect(fn) { const c = cell('focus'); if (c.fn !== fn) { c.fn = fn; active.effects.push(c); } } },
    'expo-router/react-navigation': { useNavigation: () => ({ dispatch: action => state.routes.push({ method: 'dispatch', value: action }) }), usePreventRemove(enabled, callback) { active.prevent = { enabled, callback }; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 16 }) },
    'expo-document-picker': { async getDocumentAsync(options) { state.picks.push(options); return state.onPick(options); } },
    'expo-secure-store': protectedPort.secureStore,
    'expo-file-system': noPlainStorage, '@react-native-async-storage/async-storage': noPlainStorage,
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'SHA256' }, async digestStringAsync(_algorithm, value) { return createHash('sha256').update(value).digest('hex'); } },
    '@/lib/theme': { useTheme: () => ({}) },
    '@/lib/session': { useSession: () => ({ ...state.session, request, expireSession: async token => { state.expired.push(token); } }) },
    '@/lib/upload-file': { async uploadFile(...args) { state.uploads.push(args); return state.onUpload(...args); } },
    '@/components/ui': controls,
    '@/components/use-confirm-action': { useConfirmAction: () => ({ dialog: null, ask: async options => { state.confirmations.push(options); return typeof state.confirm === 'function' ? state.confirm(options) : state.confirm; } }) },
  };
  const modules = new Map();
  const root = new URL('../../mobile/src/', import.meta.url);
  function resolve(file) {
    if (/\.(tsx?|mjs)$/.test(file)) return file;
    for (const suffix of ['.ts', '.tsx', '.native.ts']) if (existsSync(new URL(file + suffix, root))) return file + suffix;
    throw Error('Unknown production module ' + file);
  }
  class ScopedDate extends Date { constructor(...args) { super(...(args.length ? args : [state.clock])); } static now() { return state.clock; } }
  function load(file, expose = '') {
    file = resolve(file); const key = file + expose; if (modules.has(key)) return modules.get(key);
    const source = readFileSync(new URL(file, root), 'utf8');
    const extra = expose ? '\nexport const QAExposed = ' + expose + ';\n' : '';
    const output = ts.transpileModule(source + extra, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const evaluated = { exports: {} }; modules.set(key, evaluated.exports);
    new Function('require', 'module', 'exports', 'Date', 'fetch', 'setTimeout', 'clearTimeout', 'process', 'window', 'localStorage', '__DEV__', output)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load(name.slice(2));
      if (name.startsWith('.')) return load(new URL(name, 'file:///' + file).pathname.slice(1));
      return nativeRequire(name);
    }, evaluated, evaluated.exports, ScopedDate, (...args) => state.onFetch(...args), (fn, delay) => { const id = ++state.timerId; state.timers.set(id, { fn, delay }); return id; }, id => state.timers.delete(id), { env: { EXPO_PUBLIC_API_URL: 'https://fixture.invalid' } }, { addEventListener: listeners, removeEventListener: (name, fn) => state.listeners.get(name)?.delete(fn) }, noPlainStorage, false);
    modules.set(key, evaluated.exports); return evaluated.exports;
  }
  class Hooks {
    constructor(fn, props) { this.fn = fn; this.props = props; this.cells = []; this.effects = []; this.cursor = 0; this.focused = true; this.alive = true; }
    render(props = {}) { this.props = { ...this.props, ...props }; activate(this); this.cursor = 0; this.tree = this.fn(this.props); for (const row of nodes(this.tree)) if (row.type?.context) state.contexts.set(row.type.context, row.props.value); return this.tree; }
    flush() { activate(this); for (const c of this.effects.splice(0)) { c.cleanup?.(); c.cleanup = c.kind !== 'focus' || this.focused ? c.fn() : undefined; } }
    update(props = {}) { this.render(props); this.flush(); return this.tree; }
    blur() { this.focused = false; for (const c of this.cells) if (c.kind === 'focus') { c.cleanup?.(); c.cleanup = undefined; } }
    focus() { this.focused = true; activate(this); for (const c of this.cells) if (c.kind === 'focus') c.cleanup = c.fn(); }
    unmount() { this.alive = false; for (const c of this.cells) { c.cleanup?.(); c.cleanup = undefined; } }
    strictSetup() { activate(this); for (const c of this.cells) if (['effect', 'layout', 'focus'].includes(c.kind)) c.cleanup = c.fn(); }
  }
  const scopes = [];
  const mount = (fn, props = {}) => { const h = new Hooks(fn, props); scopes.push(h); h.update(); return h; };
  const find = (h, type, label) => { const row = nodes(h.tree).find(v => v.type === type && (!label || [v.props.title, v.props.label, v.props.accessibilityLabel].includes(label))); assert.ok(row, type + ' ' + (label ?? '')); return row.props; };
  function event(name, value) { if (name === 'change') state.appState = value; for (const fn of [...state.listeners.get(name) ?? []]) fn(value); }
  return { state, protectedPort, mocks, load, mount, find, event, request, dispose() { for (const h of scopes) h.unmount(); state.timers.clear(); state.listeners.clear(); }, fireTimers() { for (const { fn } of [...state.timers.values()]) fn(); } };
}
