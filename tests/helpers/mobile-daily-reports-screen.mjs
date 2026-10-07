import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Execute unchanged current production TSX with only lexical hook/native/navigation
// boundaries. No global mocks, fixture state changes, network or native UI claims.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
const sourcePaths = ['mobile/src/components/daily-reports-screen.tsx', 'mobile/src/lib/daily-reports.ts', 'mobile/src/lib/api.ts'];
const sources = Object.fromEntries(sourcePaths.map(path => [path, readFileSync(resolve(repo, path), 'utf8')]));
function evaluate(source, imports) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const evaluated = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert(Object.hasOwn(imports, name), 'unexpected import ' + name); return imports[name]; }, evaluated, evaluated.exports);
  return evaluated.exports;
}
const updateSafety = evaluate(readFileSync(repo + '/mobile/src/lib/app-update-safety.ts', 'utf8'), {});
const api = evaluate(sources['mobile/src/lib/api.ts'], { './app-update-safety': updateSafety });
const core = evaluate(sources['mobile/src/lib/daily-reports.ts'], {});
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function walk(node, callback) {
  if (!node || typeof node !== 'object') return;
  if ('type' in node) callback(node);
  for (const value of Object.values(node.props ?? {})) {
    if (Array.isArray(value)) value.forEach(child => walk(child, callback));
    else if (value && typeof value === 'object') walk(value, callback);
  }
}
function text(node) {
  const values = [];
  const visit = value => {
    if (typeof value === 'string' || typeof value === 'number') values.push(String(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value?.props) visit(value.props.children);
  };
  visit(node); return values.join(' ');
}
function harness(initial = {}, account = 'a', exportName = 'TestContent') {
  let cursor = 0, tree, scheduled = false, alive = true, focused = true;
  let props = { path: '/daily-reports?page=1', ...initial };
  const cells = [], effects = [], requests = [], navigation = [];
  const session = { token: 'synthetic-scope-' + account, user: { id: 'qa-account-' + account, name: '가상 ' + account } };
  const schedule = () => { if (!scheduled && alive) { scheduled = true; queueMicrotask(() => { scheduled = false; if (alive) render(); }); } };
  const hook = (kind, initial) => { const index = cursor++; cells[index] ??= { kind, ...initial }; assert.equal(cells[index].kind, kind); return cells[index]; };
  const react = {
    useState(initial) { const cell = hook('state', { value: typeof initial === 'function' ? initial() : initial }); cell.set ??= next => { cell.value = typeof next === 'function' ? next(cell.value) : next; schedule(); }; return [cell.value, cell.set]; },
    useRef(initial) { return hook('ref', { value: { current: initial } }).value; },
    useCallback(fn, deps) { const cell = hook('callback', {}); if (!same(cell.deps, deps)) { cell.deps = deps; cell.value = fn; } return cell.value; },
    useEffect(fn, deps) { const cell = hook('effect', {}); if (!same(cell.deps, deps)) effects.push(() => { cell.cleanup?.(); cell.deps = deps; cell.cleanup = fn(); }); },
  };
  const useFocusEffect = fn => { const cell = hook('focus', {}); if (cell.value !== fn) effects.push(() => { cell.cleanup?.(); cell.value = fn; cell.cleanup = focused ? fn() : undefined; }); };
  const request = (path, options) => new Promise((resolve, reject) => requests.push({ path, options, account, resolve, reject, settled: false }));
  const components = Object.fromEntries(['FlatList', 'Pressable', 'RefreshControl', 'Text', 'TextInput', 'View', 'AccountFeedback', 'EmptyState', 'TextAction'].map(name => [name, name]));
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { Stack: { Screen: 'Stack.Screen' }, router: { setParams(value) { navigation.push({ method: 'setParams', value }); }, push(value) { navigation.push({ method: 'push', value }); }, replace(value) { navigation.push({ method: 'replace', value }); } }, useFocusEffect, useLocalSearchParams: () => props },
    'react-native': { ...components, StyleSheet: { create: value => value } },
    '@/components/account-feedback': components, '@/components/ui': components,
    '@/lib/api': api, '@/lib/daily-reports': core, '@/lib/session': { useSession: () => ({ ...session, request }) }, '@/lib/theme': { useTheme: () => ({}) },
  };
  const exposed = '\nexport const TestContent = DailyReportsContent; export const TestPath = reportListPath; export const TestPredicate = isReportList; export const TestEmployeeToday = EmployeeToday; export const TestMetric = ReportMetric; export const TestRow = DailyReportRow;\n';
  const evaluated = evaluate(sources[sourcePaths[0]] + exposed, imports);
  function render() { cursor = 0; tree = evaluated[exportName](props); for (const fn of effects.splice(0)) fn(); return tree; }
  function find(type) { let found; walk(tree, node => { if (node.type === type && !found) found = node; }); assert(found, type); return found; }
  function findNamed(name) { let found; walk(tree, node => { if (node.type?.name === name && !found) found = node; }); assert(found, name); return found; }
  function findLabel(label) { let found; walk(tree, node => { if (node.props?.label === label) found = node; }); assert(found, label); return found; }
  const flat = () => find('FlatList');
  function pending(path) { const entry = requests.find(value => !value.settled && (!path || value.path === path)); assert(entry, 'pending ' + path); return entry; }
  const resolveRequest = (value, path) => { const entry = pending(path); entry.settled = true; entry.resolve(value); };
  const reject = (error, path) => { const entry = pending(path); entry.settled = true; entry.reject(error); };
  function blur() { focused = false; for (const cell of cells) if (cell.kind === 'focus') { cell.cleanup?.(); cell.cleanup = undefined; } }
  function focus() { focused = true; for (const cell of cells) if (cell.kind === 'focus') cell.cleanup = cell.value(); }
  function destroy() { alive = false; for (const cell of cells) cell.cleanup?.(); }
  render();
  return { evaluated, get tree() { return tree; }, flat, find, findNamed, findLabel, requests, navigation, pending, resolve: resolveRequest, reject, blur, focus, destroy, setProps(next) { props = { ...props, ...next }; render(); }, changeToken(token) { session.token = token; render(); } };
}
const today = '2026-10-03', stamp = '2026-10-03T00:00:00.000Z';
function history(id = 'qa-report-1', date = '2026-10-02') { return { id, workDate: date, submittedAt: stamp, reviewedAt: null }; }
function employee(overrides = {}) { return { mode: 'employee', today, userName: '가상 직원', canWrite: true, todayStatus: 'missing', history: [history()], page: 1, pageSize: 15, total: 17, totalPages: 2, ...overrides }; }
function director(overrides = {}) { return { mode: 'director', today, selectedDate: today, userName: '가상 시설장', canWrite: false, filter: 'all', q: '', counts: { staff: 45, submitted: 28, missing: 17, unreviewed: 18 }, rows: [{ staff: { id: 'qa-staff-1', name: '가상 직원', departmentName: '가상 부서' }, report: { id: 'qa-report-1', workDate: today, version: 3, submittedAt: stamp, reviewedAt: null, updatedAt: stamp } }], page: 1, pageSize: 20, total: 45, totalPages: 3, ...overrides }; }

export { api, harness, employee, director, history, settle, walk, text };
