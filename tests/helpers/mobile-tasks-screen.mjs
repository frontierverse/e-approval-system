import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Execute current production components unchanged except exposing private functions.
// Hook/navigation/API boundaries are mocked; no fixture or production network requests.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
const paths = { tasks: repo + '/mobile/src/components/tasks-screen.tsx', home: repo + '/mobile/src/app/(tabs)/index.tsx' };
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path, 'utf8')]));
function evaluate(source, imports) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const evaluated = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert(name in imports, 'unexpected import ' + name); return imports[name]; }, evaluated, evaluated.exports);
  return evaluated.exports;
}
const api = evaluate(readFileSync(repo + '/mobile/src/lib/api.ts', 'utf8'), {});
const core = evaluate(readFileSync(repo + '/mobile/src/lib/tasks.ts', 'utf8'), { './drafts': { requestKey() { throw new Error('this suite must not create tasks'); } } });
const element = (type, props, key) => ({ type, props: props || {}, key });
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const settle = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
const task = (id = 'qa-a-task-001', version = 0, completedAt = null) => ({ id, version, title: '가상 할 일 ' + id, description: null, meetingTitle: '가상 회의', dueDate: '2026-10-01', assigneeId: id.startsWith('qa-b') ? 'qa-account-b' : 'qa-account-a', assigneeName: '가상 직원', departmentName: '가상 부서', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z', completedAt, deletedAt: null });
const response = ({ status = 'pending', page = 1, rows = [task()], pending = 45, overdue = 12 } = {}) => ({ status, today: '2026-10-03', tasks: rows, counts: { pending, overdue, completed: 6, deleted: 3 }, page, pageSize: 20, total: pending, totalPages: 3 });
const homeResponse = (pending = 45, overdue = 12) => ({ canApproveDocuments: false, counts: { activeSent: 0, recalled: 0 }, sentDocuments: [], taskCounts: { pending, overdue } });
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
function harness(kind = 'tasks', exportName, initial = {}, account = 'a') {
  let cursor = 0, tree, scheduled = false, alive = true, props = { status: 'pending', page: 1, ...initial }, focused = true;
  const cells = [], effects = [], requests = [], navigation = [];
  const session = { token: 'synthetic-scope-' + account, user: { name: '가상 ' + account, canApproveDocuments: false } };
  const schedule = () => { if (!scheduled && alive) { scheduled = true; queueMicrotask(() => { scheduled = false; if (alive) render(); }); } };
  const hook = (type, initial) => { const i = cursor++; if (!cells[i]) cells[i] = { type, ...initial }; assert.equal(cells[i].type, type); return cells[i]; };
  const react = {
    useState(initial) { const cell = hook('state', { value: typeof initial === 'function' ? initial() : initial }); cell.set ??= next => { cell.value = typeof next === 'function' ? next(cell.value) : next; schedule(); }; return [cell.value, cell.set]; },
    useRef(initial) { return hook('ref', { value: { current: initial } }).value; },
    useCallback(fn, deps) { const cell = hook('callback', {}); if (!same(cell.deps, deps)) { cell.deps = deps; cell.value = fn; } return cell.value; },
    useEffect(fn, deps) { const cell = hook('effect', {}); if (!same(cell.deps, deps)) effects.push(() => { cell.cleanup?.(); cell.deps = deps; cell.cleanup = fn(); }); },
  };
  const focusHook = fn => { const cell = hook('focus', {}); if (cell.value !== fn) effects.push(() => { cell.cleanup?.(); cell.value = fn; cell.cleanup = focused ? fn() : undefined; }); };
  const request = (path, options) => new Promise((resolve, reject) => requests.push({ path, options, account, resolve, reject, settled: false }));
  const components = Object.fromEntries(['FlatList', 'Pressable', 'RefreshControl', 'ScrollView', 'Text', 'View', 'ActivityIndicator', 'AccountFeedback', 'EmptyState', 'TextAction', 'ErrorState', 'ScreenHeading', 'InboxList'].map(name => [name, name]));
  const imports = {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'expo-router': { Stack: { Screen: 'Stack.Screen' }, router: { setParams(params) { props = { ...props, ...params, page: Number(params.page ?? props.page) }; render(); }, push(path) { navigation.push(path); } }, useFocusEffect: focusHook, useLocalSearchParams: () => props },
    'react-native': { ...components, StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/components/account-feedback': { AccountFeedback: 'AccountFeedback', focusAccountNotice() {} }, '@/components/ui': components, '@/components/inbox-list': components,
    '@/lib/api': api, '@/lib/tasks': core, '@/lib/session': { useSession: () => ({ ...session, request }) }, '@/lib/theme': { useTheme: () => ({}) },
  };
  const exposed = kind === 'tasks' ? '\nexport const TestContent = TasksContent;\n' : '\nexport const TestHomeEntry = TaskHomeEntry; export const TestHomeData = useHomeData; export const TestHomeContent = HomeContent;\n';
  const evaluated = evaluate(sources[kind] + exposed, imports);
  const name = exportName ?? (kind === 'tasks' ? 'TestContent' : 'TestHomeData');
  function render() { cursor = 0; tree = evaluated[name](props); for (const fn of effects.splice(0)) fn(); return tree; }
  const find = type => { let found; walk(tree, node => { if (node.type === type && !found) found = node; }); assert(found, type); return found; };
  const flat = () => find('FlatList');
  const action = label => { let found; walk(flat().props.ListHeaderComponent, node => { if (node.type === 'TextAction' && node.props.label === label) found = node.props; }); assert(found, 'action ' + label); return found; };
  const row = index => { const item = flat().props.data[index ?? 0]; assert(item, 'task row'); return flat().props.renderItem({ item }).props; };
  function pending(path) { const entry = requests.find(item => !item.settled && (!path || item.path === path)); assert(entry, 'pending request ' + path); return entry; }
  const resolve = (value, path) => { const entry = pending(path); entry.settled = true; entry.resolve(value); };
  const reject = (error, path) => { const entry = pending(path); entry.settled = true; entry.reject(error); };
  function blur() { focused = false; for (const cell of cells) if (cell.type === 'focus') { cell.cleanup?.(); cell.cleanup = undefined; } }
  function focus() { focused = true; for (const cell of cells) if (cell.type === 'focus') cell.cleanup = cell.value(); }
  function destroy() { alive = false; for (const cell of cells) cell.cleanup?.(); }
  render(); return { get tree() { return tree; }, flat, row, action, requests, navigation, resolve, reject, blur, focus, destroy, setProps(next) { props = { ...props, ...next }; render(); }, changeToken(token) { session.token = token; render(); } };
}

export { api, harness, homeResponse, response, settle, task, text, walk };
