import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
export const tick = async () => { for (let i = 0; i < 45; i++) await Promise.resolve(); };
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export function nodes(value) { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object') return []; return [value, ...Object.values(value.props ?? {}).flatMap(v => nodes(v))]; }
export function createLunchCafeHarness() {
  let active;
  const activate = scope => { active = scope; };
  const state = { account: true, foreground: true, foregroundEpoch: 0, ready: true, session: { token: 'synthetic-a', user: { id: 'actor' } }, requests: [], routes: [], expired: [], confirmations: [], confirm: true, listeners: new Map(), fetches: [], timers: new Map(), nextTimer: 0, success: [], loss: 0 };
  const provider = { get foreground() { return state.foreground; }, get foregroundRevision() { return state.foregroundEpoch; }, isCurrentAccount: () => state.account, isForeground: () => state.account && state.foreground, foregroundGeneration: () => state.foregroundEpoch, get: (path, options) => provider.request(path, { ...options, method: 'GET' }), request: async (path, options = {}) => { state.requests.push({ path, ...options }); return state.onRequest(path, options); } };
  const cell = kind => { const index = active.cursor++; const c = active.cells[index] ??= { kind }; assert.equal(c.kind, kind); return c; };
  const effect = (kind, fn, deps) => { const c = cell(kind); if (!same(c.deps, deps)) { c.deps = deps; c.fn = fn; active.effects.push(c); } };
  const react = {
    useRef(v) { return cell('ref').ref ??= { current: v }; },
    useState(v) { const c = cell('state'); if (!Object.hasOwn(c, 'value')) c.value = typeof v === 'function' ? v() : v; c.set ??= next => { c.value = typeof next === 'function' ? next(c.value) : next; }; return [c.value, c.set]; },
    useCallback(fn, deps) { const c = cell('callback'); if (!same(c.deps, deps)) { c.deps = deps; c.fn = fn; } return c.fn; },
    useMemo(fn, deps) { const c = cell('memo'); if (!same(c.deps, deps)) { c.deps = deps; c.value = fn(); } return c.value; },
    useEffect: (fn, deps) => effect('effect', fn, deps), useLayoutEffect: (fn, deps) => effect('layout', fn, deps),
    createContext: () => ({ Provider: 'LunchCafeContextProvider' }), useContext: () => provider,
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const native = Object.fromEntries(['ScrollView', 'Text', 'View', 'Pressable', 'TextInput', 'ActivityIndicator', 'KeyboardAvoidingView'].map(v => [v, v]));
  const router = { setParams: value => state.routes.push({ method: 'setParams', value }), push: value => state.routes.push({ method: 'push', value }), replace: value => state.routes.push({ method: 'replace', value }) };
  const component = Object.fromEntries(['AccountFeedback', 'TextAction', 'PrimaryButton', 'CafeChoices', 'LunchCafeField', 'LunchCafeHeading', 'LunchCafePager', 'LunchCafeReadState', 'LunchCafeRow'].map(v => [v, v]));
  const modules = new Map();
  const requestOverride = (path, token, options) => provider.request(path, { ...options, token });
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ...native, Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener(name, fn) { const set = state.listeners.get(name) ?? new Set(); set.add(fn); state.listeners.set(name, set); return { remove: () => set.delete(fn) }; } } },
    'expo-router': { router, useLocalSearchParams: () => state.params ?? {}, useFocusEffect(fn) { const c = cell('focus'); if (c.fn !== fn) { c.fn = fn; active.effects.push(c); } }, useNavigation: () => ({ dispatch: action => state.routes.push({ method: 'dispatch', value: action }) }) },
    'expo-router/react-navigation': { useNavigation: () => ({ dispatch: action => state.routes.push({ method: 'dispatch', value: action }) }), usePreventRemove: (enabled, fn) => { active.prevent = { enabled, fn }; } },
    '@react-navigation/native': { usePreventRemove: (enabled, fn) => { active.prevent = { enabled, fn }; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 16 }) },
    '@/lib/theme': { useTheme: () => ({}) },
    '@/lib/session': { useSession: () => ({ ...state.session, expireSession: async token => state.expired.push(token) }) },
    '@/providers/LunchCafeProvider': { useLunchCafe: () => state.context ?? provider },
    './account-feedback': component, './ui': component, './LunchCafeContent': component,
    './use-confirm-action': { useConfirmAction: () => ({ dialog: null, ask: async options => { state.confirmations.push(options); return typeof state.confirm === 'function' ? state.confirm(options) : state.confirm; } }) },
  };
  function load(file, expose = '') {
    const cacheKey = file + expose; if (modules.has(cacheKey)) return modules.get(cacheKey);
    const source = readFileSync(new URL(`../../mobile/src/${file}`, import.meta.url), 'utf8');
    const extra = expose ? `\nexport const QAExposed = ${expose};\n` : '';
    const output = ts.transpileModule(source + extra, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const result = { exports: {} };
    new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', 'process', '__DEV__', output)(name => {
      if (name in mocks) return mocks[name];
      if (name === '@/lib/lunch-cafe-request' && file.includes('Provider')) return { lunchCafeRequest: requestOverride, lunchCafeAbort: load('lib/lunch-cafe-request.ts').lunchCafeAbort };
      const path = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? new URL(name, `file:///${file}`).pathname.slice(1) : null;
      if (path) return load(path + (path.includes('providers/') || path.includes('mutation') || /^components\/(?:LunchCafeScreens|CafeItemDetailScreen|CafeWriteScreens)$/.test(path) ? '.tsx' : '.ts'));
      return require(name);
    }, result, result.exports, (...args) => { state.fetches.push(args); return state.onFetch(...args); }, (fn, delay) => { const key = ++state.nextTimer; state.timers.set(key, { fn, delay }); return key; }, key => state.timers.delete(key), { env: { EXPO_PUBLIC_API_URL: 'https://fixture.invalid' } }, false);
    modules.set(cacheKey, result.exports); return result.exports;
  }
  const api = load('lib/api.ts'), core = load('lib/lunch-cafe.ts');
  class Hooks {
    constructor(fn, props = {}) { this.fn = fn; this.props = props; this.cells = []; this.effects = []; this.cursor = 0; this.focused = true; }
    render(props = {}) { this.props = { ...this.props, ...props }; activate(this); this.cursor = 0; this.tree = this.fn(this.props); return this.tree; }
    flush() { activate(this); for (const c of this.effects.splice(0)) { c.cleanup?.(); c.cleanup = c.kind !== 'focus' || this.focused ? c.fn() : undefined; } }
    update(props = {}) { this.render(props); this.flush(); return this.tree; }
    blur() { this.focused = false; for (const c of this.cells) if (c.kind === 'focus') { c.cleanup?.(); c.cleanup = undefined; } }
    focus() { this.focused = true; activate(this); for (const c of this.cells) if (c.kind === 'focus') c.cleanup = c.fn(); }
    unmount() { for (const c of this.cells) c.cleanup?.(); }
    strictSetup() { activate(this); for (const c of this.cells) if (['effect', 'layout', 'focus'].includes(c.kind)) c.cleanup = c.fn(); }
  }
  const scopes = [];
  function mount(fn, props = {}) { const h = new Hooks(fn, props); scopes.push(h); h.update(); return h; }
  function foreground(value) { if (state.foreground !== value) state.foregroundEpoch++; state.foreground = value; }
  function reset() { for (const h of scopes.splice(0)) h.unmount(); state.listeners.clear(); Object.assign(state, { account: true, foreground: true, foregroundEpoch: 0, session: { token: 'synthetic-a', user: { id: 'actor' } }, requests: [], routes: [], expired: [], confirmations: [], confirm: true, fetches: [], success: [], loss: 0 }); state.timers.clear(); delete state.context; state.onRequest = async () => ({}); state.onFetch = async () => Response.json({ ok: true }); }
  function find(h, type, label) { const row = nodes(h.tree).find(row => row.type === type && (!label || row.props.label === label || row.props.title === label)); assert.ok(row, `${type} ${label ?? ''}`); return row.props; }
  return { state, provider, load, core, api, mount, reset, foreground, find, fireTimeouts() { for (const { fn } of [...state.timers.values()]) fn(); } };
}
