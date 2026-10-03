import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Current production TSX/core/API are executed with lexical hook/native/API
// boundaries only. No global mocks, fixture resets, network or native UI claims.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
const sourcePaths = { screen: 'mobile/src/components/work-schedules-screen.tsx', core: 'mobile/src/lib/schedules.ts', api: 'mobile/src/lib/api.ts' };
const sources = Object.fromEntries(Object.entries(sourcePaths).map(([key, path]) => [key, readFileSync(resolve(repo, path), 'utf8')]));
function evaluate(source, imports, fileName = "source.tsx") {
  const code = ts.transpileModule(source, { fileName, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const evaluated = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert(Object.hasOwn(imports, name), 'unexpected import ' + name); return imports[name]; }, evaluated, evaluated.exports);
  return evaluated.exports;
}
const api = evaluate(sources.api, {}, sourcePaths.api);
const core = evaluate(sources.core, {}, sourcePaths.core);
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function walk(node, callback) {
  if (Array.isArray(node)) { node.forEach(child => walk(child, callback)); return; }
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
function harness(initial = {}, account = 'a', exportName = 'TestContent', kind = 'screen') {
  let cursor = 0, tree, scheduled = false, alive = true, focused = true;
  let currentScope = true;
  const isCurrentAccount = () => currentScope;
  let props = { isCurrentAccount, ...initial };
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
  react.useLayoutEffect = react.useEffect;
  const useFocusEffect = fn => { const cell = hook('focus', {}); if (cell.value !== fn) effects.push(() => { cell.cleanup?.(); cell.value = fn; cell.cleanup = focused ? fn() : undefined; }); };
  const request = (path, options) => new Promise((resolve, reject) => requests.push({ path, options, account, resolve, reject, settled: false }));
  const components = Object.fromEntries(['ScrollView', 'ActivityIndicator', 'RefreshControl', 'Text', 'TextInput', 'Pressable', 'View', 'AccountFeedback', 'TextAction'].map(name => [name, name]));
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { Stack: { Screen: 'Stack.Screen' }, router: { setParams(value) { navigation.push({ method: 'setParams', value }); }, push(value) { navigation.push({ method: 'push', value }); }, replace(value) { navigation.push({ method: 'replace', value }); } }, useFocusEffect, useLocalSearchParams: () => props },
    'react-native': { ...components, StyleSheet: { create: value => value } },
    '@/components/account-feedback': components, '@/components/ui': components, '@/components/work-schedule-content': { ScheduleField: 'ScheduleField', WorkScheduleRowLink: 'WorkScheduleRowLink', WorkScheduleSummary: 'WorkScheduleSummary' },
    '@/lib/api': api, '@/lib/schedules': core, '@/lib/session': { useSession: () => ({ ...session, request }) }, '@/lib/theme': { useTheme: () => ({}) },
  };
  const exposed = kind === 'screen' ? '\nexport const TestContent = WorkSchedulesScreenContent; export const TestCalendar = ScheduleCalendar; export const TestDay = ScheduleDay;\n' : '';
  const evaluated = evaluate(sources[kind] + exposed, imports);
  function render() { cursor = 0; tree = evaluated[exportName](props); for (const fn of effects.splice(0)) fn(); return tree; }
  function all(type) { const found = []; walk(tree, node => { if (node.type === type || node.type?.name === type) found.push(node); }); return found; }
  function find(type) { let found; walk(tree, node => { if (node.type === type && !found) found = node; }); assert(found, type); return found; }
  function findNamed(name) { let found; walk(tree, node => { if (node.type?.name === name && !found) found = node; }); assert(found, name); return found; }
  function findLabel(label) { let found; walk(tree, node => { if (node.props?.label === label) found = node; }); assert(found, label); return found; }
  const flat = () => find('ScrollView');
  function pending(path) { const entry = requests.find(value => !value.settled && (!path || value.path === path)); assert(entry, 'pending ' + path); return entry; }
  const resolveRequest = (value, path) => { const entry = pending(path); entry.settled = true; entry.resolve(value); };
  const reject = (error, path) => { const entry = pending(path); entry.settled = true; entry.reject(error); };
  function blur() { focused = false; for (const cell of cells) if (cell.kind === 'focus') { cell.cleanup?.(); cell.cleanup = undefined; } }
  function focus() { focused = true; for (const cell of cells) if (cell.kind === 'focus') cell.cleanup = cell.value(); }
  function destroy() { alive = false; for (const cell of cells) cell.cleanup?.(); }
  render();
  return { evaluated, all, get tree() { return tree; }, flat, find, findNamed, findLabel, requests, navigation, pending, resolve: resolveRequest, reject, blur, focus, destroy, setProps(next) { props = { ...props, ...next }; render(); }, changeToken(token) { session.token = token; render(); }, invalidateScope() { currentScope = false; } };
}

const today = '2026-10-03', stamp = '2026-10-03T00:00:00.000Z';
function manual(id = 'qa-manual-a', scheduleDate = today, patch = {}) { return { id, sourceType: 'manual', readOnly: false, allDay: false, scheduleDate, startMinute: 540, endMinute: 600, content: 'SHARED_MANUAL_' + id, updatedAt: stamp, ...patch }; }
function vacation(id = 'qa-vacation-a', scheduleDate = today, patch = {}) { return { id, sourceType: 'approvedVacation', readOnly: true, allDay: true, scheduleDate, content: '가상 휴가 직원 연차', staffName: '가상 휴가 직원', vacationLabel: '연차', departmentName: '가상 부서', positionName: '생활지도원', ...patch }; }
function hospital(id = 'qa-hospital-a', scheduleDate = today, patch = {}) { return { id, sourceType: 'hospitalAppointment', readOnly: true, allDay: false, scheduleDate, startMinute: 0, endMinute: 1440, content: '가상 청소년 병원 진료', youthName: '가상 청소년', hospitalName: '가상 병원', escortName: '가상 인솔자', ...patch }; }
function page(selectedDate = today, patch = {}) { const items = patch.items ?? [vacation('qa-vacation-a', selectedDate), manual('qa-manual-a', selectedDate), hospital('qa-hospital-a', selectedDate)]; return { today, month: selectedDate.slice(0, 7), selectedDate, canManage: true, items, monthCounts: core.scheduleCounts(items), selectedCounts: core.scheduleCounts(core.selectedScheduleItems(items, selectedDate)), ...patch }; }
function has(node, type) { let found = false; walk(node, value => { if (value.type === type || value.type?.name === type) found = true; }); return found; }
export { api, core, harness, manual, vacation, hospital, page, has, settle, walk, text, sourcePaths, sources };
