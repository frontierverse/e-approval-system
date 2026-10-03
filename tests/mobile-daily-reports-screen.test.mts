import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, harness, employee, director, history, settle, walk } from './helpers/mobile-daily-reports-screen.mjs';

test('unknown status remains unknown; archive page 2 uses separately supplied todayStatus', async () => {
  const h = harness({ path: '/daily-reports?page=2' });
  assert.equal(h.flat().props.data.length, 0);
  const values = []; walk(h.flat().props.ListHeaderComponent, node => { if (node.type?.name === 'ReportMetric') values.push(node.props.value); });
  assert.deepEqual(values, ['—', '—']); assert.equal(h.flat().props.ListEmptyComponent.type.name, 'ReportListLoading');
  h.resolve(employee({ page: 2, todayStatus: 'reviewed', history: [history('qa-report-old', '2026-09-01')] })); await settle();
  assert.equal(h.findNamed('EmployeeToday').props.status, 'reviewed'); assert.equal(h.flat().props.data[0].entry.workDate, '2026-09-01'); h.destroy();
});
test('director filtered metadata rows preserve global selected-date counts', async () => {
  const h = harness(); const payload = director({ filter: 'missing', q: '일부 직원', rows: [{ staff: { id: 'qa-missing-1', name: '가상 미제출 직원', departmentName: '부서' }, report: null }], total: 1, totalPages: 1 });
  h.resolve(payload); await settle();
  const values = []; walk(h.flat().props.ListHeaderComponent, node => { if (node.type?.name === 'ReportMetric') values.push(node.props.value); });
  assert.deepEqual(values, ['28 / 45', '18 / 17']); assert.equal(h.flat().props.data.length, 1);
  const row = h.flat().props.renderItem({ item: h.flat().props.data[0] }); const rendered = h.evaluated.TestRow(row.props); assert.equal(rendered.type, 'View'); assert(!JSON.stringify(h.tree).includes('mainContent')); h.destroy();
});
test('changing filter and page ignores the previous late GET', async () => {
  const old = '/daily-reports?filter=all&page=1', current = '/daily-reports?filter=unread&page=2';
  const h = harness({ path: old }); const first = h.pending(old); h.setProps({ path: current }); await settle();
  h.resolve(director({ filter: 'unread', page: 2, rows: [{ ...director().rows[0], staff: { id: 'qa-current-2', name: '현재 직원', departmentName: '부서' } }] }), current); await settle();
  first.settled = true; first.resolve(director()); await settle(); assert.equal(h.flat().props.data[0].entry.staff.id, 'qa-current-2'); h.destroy();
});
test('fresh focus hides cached rows and a 500 stays error rather than empty success', async () => {
  const h = harness(); h.resolve(employee()); await settle(); assert.equal(h.flat().props.data.length, 1);
  h.blur(); h.focus(); await settle(); assert.equal(h.flat().props.data.length, 0); assert.equal(h.flat().props.ListEmptyComponent.type.name, 'ReportListLoading');
  h.reject(new api.ApiError('가상 조회 실패', 500)); await settle(); assert.equal(h.flat().props.data.length, 0); assert.equal(h.flat().props.ListEmptyComponent, null); assert.equal(h.findLabel('다시 불러오기').props.disabled, false); h.destroy();
});
test('same-focus refresh 500 retains authorized rows; 403 clears them', async () => {
  const h = harness(); h.resolve(employee()); await settle(); h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('가상 일시 오류', 500)); await settle(); assert.equal(h.flat().props.data.length, 1);
  h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('권한 변경', 403)); await settle(); assert.equal(h.flat().props.data.length, 0); assert.equal(h.flat().props.ListEmptyComponent, null); h.destroy();
});
test('malformed successful responses reject statuses, counts, dates and rows through actual predicate', async () => {
  const h = harness(); const validEmployee = employee(), validDirector = director(); assert(h.evaluated.TestPredicate(validEmployee)); assert(h.evaluated.TestPredicate(validDirector));
  const invalid = [null, [], { ...validEmployee, todayStatus: 'unavailable' }, ...['__proto__', 'constructor', 'toString'].map(todayStatus => ({ ...validEmployee, todayStatus })), { ...validEmployee, pageSize: 20 }, { ...validEmployee, page: 0 }, { ...validEmployee, total: NaN }, { ...validEmployee, history: [history('bad/id')] }, { ...validEmployee, today: '2026-02-30' }, { ...validDirector, canWrite: true }, { ...validDirector, counts: { ...validDirector.counts, missing: 0 } }, { ...validDirector, rows: [{ ...validDirector.rows[0], report: { ...validDirector.rows[0].report, submittedAt: null } }] }];
  for (const payload of invalid) assert.equal(h.evaluated.TestPredicate(payload), false);
  h.resolve({ ...validEmployee, todayStatus: 'unavailable' }); await settle(); assert.equal(h.flat().props.data.length, 0); assert.equal(h.flat().props.ListEmptyComponent, null); assert(h.find('AccountFeedback').props.error.includes('응답')); h.destroy();
});
test('explicit malformed, future and duplicate query values are sent unchanged for strict server validation', async () => {
  const h = harness(); const path = h.evaluated.TestPath({ date: ['2026-02-30', '2026-10-04'], filter: ['unread', 'missing'], page: ['1', '2'], q: [] });
  const q = new URLSearchParams(path.split('?')[1]); assert.deepEqual(q.getAll('date'), ['2026-02-30', '2026-10-04']); assert.deepEqual(q.getAll('page'), ['1', '2']); assert.deepEqual(q.getAll('filter'), ['unread', 'missing']); assert.equal(q.get('q'), '');
  assert.equal(h.evaluated.TestPath({ date: '2026-10-04' }), '/daily-reports?date=2026-10-04&page=1');
  h.destroy(); const invalid = harness({ path }); assert.equal(invalid.requests[0].path, path); invalid.reject(new api.ApiError('조회 조건 오류', 400)); await settle(); assert.equal(invalid.flat().props.data.length, 0); invalid.findLabel('조회 조건 초기화').props.onPress(); assert.deepEqual(invalid.navigation, [{ method: 'replace', value: '/daily-reports' }]); invalid.destroy();
});
test('director date conditions reject malformed and future input without navigation', async () => {
  const h = harness(); h.resolve(director()); await settle();
  const header = h.find('Stack.Screen').props.options.headerRight(); let toggle; walk(header, node => { if (node.props.accessibilityLabel === '업무보고 조회 조건') toggle = node; }); assert(toggle); toggle.props.onPress(); await settle();
  h.findNamed('ReportInput').props.onChange('2026-02-30'); await settle(); h.findLabel('조건 적용').props.onPress(); await settle(); assert.equal(h.navigation.length, 0); assert(h.find('AccountFeedback').props.error.includes('유효한 보고 날짜'));
  h.findNamed('ReportInput').props.onChange('2026-10-04'); await settle(); h.findLabel('조건 적용').props.onPress(); await settle(); assert.equal(h.navigation.length, 0);
  h.findNamed('ReportInput').props.onChange('2026-10-02'); await settle(); h.findLabel('조건 적용').props.onPress(); assert.deepEqual(h.navigation, [{ method: 'setParams', value: { date: '2026-10-02', q: '', page: '1' } }]); h.destroy();
});
test('same account role change after focus renders only the new mode', async () => {
  const h = harness(); h.resolve(employee()); await settle(); assert(h.findNamed('EmployeeToday')); h.blur(); h.focus(); await settle(); assert.equal(h.flat().props.data.length, 0); h.resolve(director()); await settle(); assert.equal(h.flat().props.accessibilityLabel, '직원 업무보고 현황'); assert.equal(h.flat().props.data[0].kind, 'director'); h.destroy();
});
test('successful future, mismatched selected date and duplicate-date fallback responses are rejected', async () => {
  const h = harness({ path: '/daily-reports?date=2026-10-02&page=1' });
  const future = director({ selectedDate: '2026-10-04', rows: [{ ...director().rows[0], report: { ...director().rows[0].report, workDate: '2026-10-04' } }] });
  assert.equal(h.evaluated.TestPredicate(future), false);
  assert.equal(h.evaluated.TestPredicate(director(), '/daily-reports?date=2026-10-02&page=1'), false);
  assert.equal(h.evaluated.TestPredicate(director(), '/daily-reports?date=2026-10-03&date=2026-10-02&page=1'), false);
  h.resolve(director()); await settle(); assert.equal(h.flat().props.data.length, 0); assert.equal(h.flat().props.ListEmptyComponent, null); assert(h.find('AccountFeedback').props.error.includes('응답')); h.destroy();
});
test('account keyed remount suppresses late prior account results', async () => {
  const wrapper = harness({}, 'a', 'DailyReportsScreen'); assert.equal(wrapper.tree.key, 'synthetic-scope-a'); wrapper.changeToken('synthetic-scope-b'); assert.equal(wrapper.tree.key, 'synthetic-scope-b'); wrapper.destroy();
  const a = harness({}, 'a'), late = a.pending(); a.destroy(); const b = harness({}, 'b'); b.resolve(employee({ userName: '가상 B', history: [history('qa-b-only')] })); await settle(); late.settled = true; late.resolve(employee({ history: [history('qa-a-private')] })); await settle(); assert.equal(b.flat().props.data[0].entry.id, 'qa-b-only'); assert(!JSON.stringify(b.tree).includes('qa-a-private')); b.destroy();
});

