import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
export const tick = async () => { for (let i = 0; i < 45; i++) await Promise.resolve(); };
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export function nodes(value) { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== 'object') return []; return [value, ...Object.values(value.props ?? {}).flatMap(nodes)]; }
export function textOf(value) { if (typeof value === 'string' || typeof value === 'number') return String(value); if (Array.isArray(value)) return value.map(textOf).join(''); return value && typeof value === 'object' ? textOf(value.props?.children) : ''; }

// Production modules execute unchanged. Only external React/native/OS ports and
// lexical clock/timer bindings are synthetic; no process global is replaced.
export function createAppUpdatesHarness({ os = 'android', development = false, disk = new Map() } = {}) {
  let active;
  const activate = scope => { active = scope; };
  const state = {
    platform: os, development, appState: 'active', clock: Date.parse('2026-10-04T12:00:00.000Z'),
    contexts: new Map(), listeners: new Map(), timers: new Map(), nextTimer: 0,
    checkCalls: [], downloadCalls: [], reloadCalls: [], storageCalls: [], disk, routes: [], navigation: [], pathname: '/profile',
    sessionToken: 'synthetic-token', canGoBack: false, dimensions: { width: 390, height: 844, fontScale: 1, scale: 1 },
    native: {
      currentlyRunning: { updateId: '11111111-1111-4111-8111-111111111111', channel: 'production', runtimeVersion: 'native-runtime', createdAt: new Date('2026-10-01T00:00:00.000Z'), isEmbeddedLaunch: false, isEmergencyLaunch: false, emergencyLaunchReason: null },
      isStartupProcedureRunning: false, isUpdateAvailable: false, isUpdatePending: false,
      isChecking: false, isDownloading: false, isRestarting: false, restartCount: 0,
    },
    updatesEnabled: true, storeAvailable: true,
    onCheck: async () => ({ isAvailable: false, isRollBackToEmbedded: false }),
    onDownload: async () => ({ isNew: true, isRollBackToEmbedded: false, manifest: { id: '22222222-2222-4222-8222-222222222222', createdAt: '2026-10-04T01:00:00.000Z' } }),
    onStorage: null,
  };
  const cell = kind => { const index = active.cursor++; const row = active.cells[index] ??= { kind }; assert.equal(row.kind, kind); return row; };
  const effect = (kind, fn, deps) => { const row = cell(kind); if (!same(row.deps, deps)) { row.deps = deps; row.fn = fn; active.effects.push(row); } };
  const react = {
    useRef(value) { return cell('ref').ref ??= { current: value }; },
    useState(initial) { const row = cell('state'); if (!Object.hasOwn(row, 'value')) row.value = typeof initial === 'function' ? initial() : initial; row.set ??= next => { row.value = typeof next === 'function' ? next(row.value) : next; }; return [row.value, row.set]; },
    useCallback(fn, deps) { const row = cell('callback'); if (!same(row.deps, deps)) { row.deps = deps; row.fn = fn; } return row.fn; },
    useMemo(fn, deps) { const row = cell('memo'); if (!same(row.deps, deps)) { row.deps = deps; row.value = fn(); } return row.value; },
    useEffect: (fn, deps) => effect('effect', fn, deps), useLayoutEffect: (fn, deps) => effect('layout', fn, deps),
    createContext(initial) { const context = { initial }; context.Provider = { context }; return context; },
    useContext(context) { return state.contexts.has(context) ? state.contexts.get(context) : context.initial; },
    useSyncExternalStore(subscribe, getSnapshot) { const value = getSnapshot(); react.useEffect(() => subscribe(() => undefined), [subscribe]); return value; },
  };
  const listen = (name, fn) => { const bucket = state.listeners.get(name) ?? new Set(); bucket.add(fn); state.listeners.set(name, bucket); return { remove: () => bucket.delete(fn) }; };
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'ActivityIndicator', 'ScrollView'].map(name => [name, name]));
  const updates = {
    get isEnabled() { return state.updatesEnabled; }, get updateId() { return state.native.currentlyRunning.updateId; },
    get channel() { return state.native.currentlyRunning.channel; }, get runtimeVersion() { return state.native.currentlyRunning.runtimeVersion; },
    get createdAt() { return state.native.currentlyRunning.createdAt; }, get isEmbeddedLaunch() { return state.native.currentlyRunning.isEmbeddedLaunch; },
    get isEmergencyLaunch() { return state.native.currentlyRunning.isEmergencyLaunch; }, get emergencyLaunchReason() { return state.native.currentlyRunning.emergencyLaunchReason; },
    useUpdates: () => state.native,
    checkForUpdateAsync: async (...args) => { state.checkCalls.push(args); return state.onCheck(...args); },
    fetchUpdateAsync: async (...args) => { state.downloadCalls.push(args); return state.onDownload(...args); },
    reloadAsync: async (...args) => { state.reloadCalls.push(args); throw Error('Automatic or manual reload is outside this feature scope'); },
  };
  const storage = async (operation, key, value, options) => {
    const call = { operation, key, value, options, apply() { if (operation === 'set') disk.set(key, value); if (operation === 'remove') disk.delete(key); return operation === 'get' ? disk.get(key) ?? null : undefined; } };
    state.storageCalls.push(call); return state.onStorage ? state.onStorage(call) : call.apply();
  };
  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'synthetic-this-device-only', isAvailableAsync: async () => state.storeAvailable,
    getItemAsync: (key, options) => storage('get', key, undefined, options),
    setItemAsync: (key, value, options) => storage('set', key, value, options),
    deleteItemAsync: (key, options) => storage('remove', key, undefined, options),
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ...native, Platform: { get OS() { return state.platform; } }, StyleSheet: { create: value => value }, useColorScheme: () => 'light', useWindowDimensions: () => state.dimensions, AccessibilityInfo: { sendAccessibilityEvent: () => {} }, AppState: { get currentState() { return state.appState; }, addEventListener: listen } },
    'expo-updates': updates, 'expo-secure-store': secureStore,
    'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.0.5' } } },
    'expo-router': { Stack: { Screen: 'Stack.Screen' }, usePathname: () => state.pathname, router: { push: value => state.routes.push(value), canGoBack: () => state.canGoBack, back: () => state.navigation.push({ kind: 'back' }), replace: path => state.navigation.push({ kind: 'replace', path }) }, useFocusEffect: fn => react.useEffect(fn, [fn]) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 16 }) },
    '@expo/vector-icons': { Feather: 'Feather' },
    '@/lib/session': { useSession: () => ({ token: state.sessionToken }) },
    'expo-application': { nativeApplicationVersion: '1.0.5', nativeBuildVersion: '8' },
    '@/lib/theme': { useTheme: () => ({}) },
    '@/components/ui': { PrimaryButton: 'PrimaryButton', TextAction: 'TextAction', ScreenHeading: 'ScreenHeading' },
  };
  const root = new URL('../../mobile/src/', import.meta.url), modules = new Map();
  function resolve(file) {
    if (/\.[cm]?[jt]sx?$/.test(file)) return file;
    const suffixes = os === 'web' ? ['.web.ts', '.web.tsx', '.ts', '.tsx'] : ['.native.ts', '.native.tsx', '.ts', '.tsx'];
    for (const suffix of suffixes) if (existsSync(new URL(file + suffix, root))) return file + suffix;
    throw Error('Unknown production module ' + file);
  }
  class ScopedDate extends Date { constructor(...args) { super(...(args.length ? args : [state.clock])); } static now() { return state.clock; } static [Symbol.hasInstance](value) { return value instanceof Date; } }
  function load(file, expose = '') {
    file = resolve(file); const key = file + expose; if (modules.has(key)) return modules.get(key);
    const source = readFileSync(new URL(file, root), 'utf8') + (expose ? '\nexport const QAExposed = ' + expose + ';\n' : '');
    const output = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const evaluated = { exports: {} }; modules.set(key, evaluated.exports);
    new Function('require', 'module', 'exports', 'Date', 'setTimeout', 'clearTimeout', '__DEV__', output)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load(name.slice(2));
      if (name.startsWith('.')) return load(new URL(name, 'file:///' + file).pathname.slice(1));
      return nativeRequire(name);
    }, evaluated, evaluated.exports, ScopedDate, (fn, delay) => { const id = ++state.nextTimer; state.timers.set(id, { fn, delay }); return id; }, id => state.timers.delete(id), development);
    modules.set(key, evaluated.exports); return evaluated.exports;
  }
  class Hooks {
    constructor(fn, props) { this.fn = fn; this.props = props; this.cells = []; this.effects = []; this.cursor = 0; this.alive = true; }
    render(props = {}) { this.props = { ...this.props, ...props }; activate(this); this.cursor = 0; this.tree = this.fn(this.props); for (const row of nodes(this.tree)) if (row.type?.context) state.contexts.set(row.type.context, row.props.value); return this.tree; }
    flush() { activate(this); for (const row of this.effects.splice(0)) { row.cleanup?.(); row.cleanup = row.fn(); } }
    update(props = {}) { this.render(props); this.flush(); return this.tree; }
    unmount() { this.alive = false; for (const row of this.cells) { row.cleanup?.(); row.cleanup = undefined; } }
    strictSetup() { activate(this); for (const row of this.cells) if (['layout', 'effect'].includes(row.kind)) row.cleanup = row.fn(); }
  }
  const scopes = [];
  const mount = (fn, props = {}) => { const instance = new Hooks(fn, props); scopes.push(instance); instance.update(); return instance; };
  // Expand real presentation components with independent hook scopes so screen
  // assertions inspect actual native controls, rather than mock button labels.
  const renderTree = value => {
    if (Array.isArray(value)) return value.map(renderTree);
    if (!value || typeof value !== 'object') return value;
    if (typeof value.type === 'function') return renderTree(mount(value.type, value.props).tree);
    return { ...value, props: { ...value.props, children: renderTree(value.props?.children) } };
  };
  const event = (name, value) => { if (name === 'change') state.appState = value; for (const fn of [...state.listeners.get(name) ?? []]) fn(value); };
  return { state, mocks, updates, secureStore, load, mount, renderTree, event, async flush(instance) { await tick(); instance.update(); await tick(); instance.update(); await tick(); }, async fireTimers() { for (const [id, value] of [...state.timers]) { state.timers.delete(id); await value.fn(); } }, dispose() { for (const instance of scopes) instance.unmount(); state.listeners.clear(); state.timers.clear(); } };
}
