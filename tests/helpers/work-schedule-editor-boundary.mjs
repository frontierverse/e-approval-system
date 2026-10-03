import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as calendar from '@/lib/work-schedule-calendar';
import * as youth from '@/lib/youth-management-core';
// Execute the actual web board; hook, modal, navigation and action boundaries are lexical.
// No production sessions, HTTP, Prisma or mocked global modules are used.
const source = readFileSync(new URL('../../src/components/work-schedule-calendar-board.tsx', import.meta.url), 'utf8') + '\nexport const TestContent = WorkScheduleCalendarBoardContent;';
const code = ts.transpileModule(source, { fileName: 'board.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const jsx = (type, props, key) => typeof type === 'function' && type.name === 'WorkScheduleRefreshButton' ? type(props) : ({ type, props: props ?? {}, key });
const settle = async () => { for (let i = 0; i < 40; i++)
    await Promise.resolve(); };
function walk(value, fn) { if (Array.isArray(value)) {
    value.forEach(item => walk(item, fn));
    return;
} if (!value || typeof value !== 'object')
    return; if ('type' in value)
    fn(value); for (const next of Object.values(value.props ?? {})) {
    if (Array.isArray(next))
        next.forEach(item => walk(item, fn));
    else
        walk(next, fn);
} }
function text(value) { if (typeof value === 'string' || typeof value === 'number')
    return String(value); if (Array.isArray(value))
    return value.map(text).join(' '); return text(value?.props?.children ?? ''); }
const stamp = '2026-10-03T00:00:00.000Z';
const row = (patch = {}) => ({ id: 'qa-manual-old', scheduleDate: '2026-10-03', startMinute: 540, endMinute: 600, startHour: 9, endHour: 10, weekday: 6, content: '공용 원본', updatedAt: stamp, ...patch });
function harness(initialRows = [row()]) {
    let tree, cursor = 0, scheduled = false, alive = true, focuses = 0;
    const cells = [], effects = [], calls = [], confirms = [], answers = [], refreshes = [];
    const schedule = () => { if (!scheduled && alive) {
        scheduled = true;
        queueMicrotask(() => { scheduled = false; if (alive)
            render(); });
    } };
    const hook = (kind, initial) => { const i = cursor++; cells[i] ??= { kind, ...initial }; assert.equal(cells[i].kind, kind); return cells[i]; };
    const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    const react = {
        useState(initial) { const cell = hook('state', { value: initial }); return [cell.value, (next) => { cell.value = typeof next === 'function' ? next(cell.value) : next; schedule(); }]; },
        useRef(initial) { return hook('ref', { value: { current: initial } }).value; },
        useMemo(fn, deps) { const cell = hook('memo', {}); if (!same(cell.deps, deps)) {
            cell.deps = deps;
            cell.value = fn();
        } return cell.value; },
        useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
        useEffect(fn, deps) { const cell = hook('effect', {}); if (!same(cell.deps, deps))
            effects.push(() => { cell.cleanup?.(); cell.deps = deps; cell.cleanup = fn(); }); },
        useTransition() { const cell = hook('transition', { pending: false }); return [cell.pending, (fn) => { cell.pending = true; schedule(); Promise.resolve(fn()).finally(() => { cell.pending = false; schedule(); }); }]; },
    };
    react.useLayoutEffect = react.useEffect;
    const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'next/link': { default: 'Link', __esModule: true }, 'next/navigation': { useRouter: () => ({ replace() { }, refresh() { refreshes.push(true); } }) }, '@/components/app-modal': { AppModal: 'AppModal' }, '@/components/date-picker-input': { DatePickerInput: 'DatePickerInput' }, '@/components/user-identity': { UserIdentity: 'UserIdentity' }, '@/lib/work-schedule-calendar': calendar, '@/lib/youth-management-core': youth };
    const evaluated = { exports: {} };
    const windowBoundary = { confirm(message) { confirms.push(message); return answers.shift() ?? true; } };
    new Function('require', 'module', 'exports', 'window', code)((name) => { assert(Object.hasOwn(imports, name), name); return imports[name]; }, evaluated, evaluated.exports, windowBoundary);
    const action = (kind, args) => new Promise((resolve, reject) => calls.push({ kind, args, resolve, reject }));
    let props = { schedules: initialRows, selectedMonth: '2026-10', changeLogActors: [], changeLogs: [], changeLogFilters: { actorId: 'all', scheduleDate: '', page: 1, pageSize: 5, total: 0, totalPages: 1 }, saveSchedule: (...args) => action('save', args), deleteSchedule: (...args) => action('delete', args) };
    function render() { cursor = 0; tree = evaluated.exports.TestContent(props); walk(tree, node => { if (node.props.ref && node.props.role === 'alert')
        node.props.ref.current = { focus() { focuses++; } }; }); effects.splice(0).forEach(fn => fn()); }
    function find(predicate) { let found; walk(tree, node => { if (!found && predicate(node))
        found = node; }); assert(found, 'node not found'); return found; }
    const button = (title) => find(node => node.type === 'button' && text(node) === title);
    const field = (label) => find(node => node.props['aria-label'] === label);
    const modal = () => find(node => node.type === 'AppModal');
    function hasModal() { let found = false; walk(tree, node => { if (node.type === 'AppModal')
        found = true; }); return found; }
    function open(id = 'qa-manual-old') { find(node => node.type === 'button' && node.props['aria-label']?.includes(id === 'qa-manual-old' ? '공용 원본' : id)).props.onClick({ stopPropagation() { } }); }
    function openNew() { find(node => node.type === 'div' && node.props.role === 'button' && node.props['aria-label'] === `${calendar.formatWorkScheduleDateLabel('2026-10-03')} 업무 일정 등록`).props.onClick(); }
    render();
    return { button, field, modal, hasModal, open, openNew, calls, confirms, answers, get refreshes() { return refreshes.length; }, get focuses() { return focuses; }, get tree() { return tree; }, updateRows(rows) { props = { ...props, schedules: rows }; render(); }, destroy() { alive = false; cells.forEach(cell => cell.cleanup?.()); } };
}

export {harness,row,stamp,settle,text,walk};
