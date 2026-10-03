import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, core, harness, entry, recent, page, dateResponse, has, settle, text } from './helpers/mobile-work-logs-screen.mjs';

// The screen, API errors and DTO predicates are actual production sources.
// Shared content/field/row components are lexical boundaries, not native UI.
test('initial private data and counts stay unknown until a validated page arrives', async () => {
  const h = harness();
  assert.equal(h.requests[0].path, '/work-logs');
  assert(has(h.tree, 'ActivityIndicator')); assert(!has(h.tree, 'WorkLogContent'));
  assert(!text(h.tree).includes('직접 기록')); assert(!text(h.tree).includes('최근 업무 기록이 없습니다'));
  h.resolve(page()); await settle();
  assert.equal(h.find('WorkLogContent').props.entry.content, 'ACCOUNT_A_PRIVATE_BODY');
  assert.equal(h.findLabel('직접 작성 기록 수정').props.disabled, false); h.destroy();
});
test('malformed, blank and duplicate route dates never fall back; future explicit dates reach strict server validation', async () => {
  for (const raw of ['', '2026-02-30', '2026-1-01', [], ['2026-10-03', '2026-10-02']]) {
    const date = core.workLogDate(raw); const h = harness({ date }); await settle();
    assert.equal(h.requests.length, 0); assert(!has(h.tree, 'WorkLogContent'));
    assert(h.find('AccountFeedback').props.error.includes('자동 변경하지 않습니다'));
    assert.equal(h.find('WorkLogField').props.value, date); assert.equal(h.navigation.length, 0); h.destroy();
  }
  const h = harness({ date: '2026-10-04' });
  assert.equal(h.requests[0].path, '/work-logs?date=2026-10-04');
  h.reject(new api.ApiError('오늘 이후 날짜는 조회할 수 없습니다.', 400)); await settle();
  assert(!has(h.tree, 'WorkLogContent')); assert.equal(h.find('WorkLogField').props.value, '2026-10-04');
  assert.equal(h.navigation.length, 0); h.destroy();
});
test('actual page predicate rejects malformed identities, missing arrays, unsafe counts and future or mismatched successful dates', async () => {
  assert(core.isWorkLogPage(page())); assert(core.isWorkLogDateResponse(dateResponse(), '2026-10-03'));
  assert(core.isWorkLogPage(page('2026-10-03', { selectedEntry: null, recentLogs: [], contributionDates: [] })));
  const invalid = [null, [], page('2026-10-04'), page('2026-10-03', { selectedEntry: entry('2026-10-02') }),
    page('2026-10-03', { selectedEntry: entry('2026-10-03', { completedTasks: undefined }) }),
    page('2026-10-03', { selectedEntry: entry('2026-10-03', { manualUpdatedAt: '2026-10-03' }) }),
    page('2026-10-03', { recentLogs: [recent('2026-10-03', { completedTaskCount: -1 })] }),
    page('2026-10-03', { recentLogs: [recent('2026-10-03', { hasManual: false })] }),
    page('2026-10-03', { contributionDates: ['2026-10-04'] }),
    page('2026-10-03', { contributionDates: ['2026-10-03', '2026-10-03'] })];
  for (const payload of invalid) assert.equal(core.isWorkLogPage(payload), false);
  assert.equal(core.isWorkLogPage(page(), '2026-10-02'), false);
  assert.equal(core.isWorkLogPage(page('2026-10-02')), false);
  const h = harness({ date: '2026-10-02' }); h.resolve(page()); await settle();
  assert(!has(h.tree, 'WorkLogContent')); assert(h.find('AccountFeedback').props.error.includes('응답')); h.destroy();
});
test('recent rows use bounded distinct-day metadata and optional schedule failure preserves the selected entry', async () => {
  const metadata = recent('2026-10-02', { keyword: 'METADATA_ONLY', completedTaskCount: 20, meetingDocumentCount: 3, meetingAttachmentCount: 4 });
  const payload = page('2026-10-03', { recentLogs: [metadata], linkedScheduleState: { status: 'error' } });
  assert(core.isWorkLogPage(payload)); assert(!Object.hasOwn(metadata, 'content')); assert(!Object.hasOwn(metadata, 'completedTasks'));
  assert.equal(core.isWorkLogPage(page('2026-10-03', { recentLogs: [metadata, metadata] })), false);
  assert.equal(core.isWorkLogPage(page('2026-10-03', { recentLogs: Array.from({ length: 13 }, (_, i) => recent('2026-09-' + String(i + 1).padStart(2, '0'))) })), false);
  const h = harness(); h.resolve(payload); await settle();
  assert.equal(h.find('WorkLogContent').props.entry.manualLogId, 'qa-manual-a');
  assert(text(h.tree).replace(/\s/g, '').includes('완료20건·회의록3건·첨부4개'));
  assert(text(h.tree).includes('참고 일정을 불러오지 못했습니다')); h.destroy();
});
test('fresh focus masks cached private content; mandatory 503 remains an error rather than empty success', async () => {
  const h = harness(); h.resolve(page()); await settle(); assert(has(h.tree, 'WorkLogContent'));
  h.blur(); h.focus(); await settle();
  assert(!has(h.tree, 'WorkLogContent')); assert(!JSON.stringify(h.tree).includes('ACCOUNT_A_PRIVATE_BODY')); assert(has(h.tree, 'ActivityIndicator'));
  h.reject(new api.ApiError('필수 자동 기록 조회 실패', 503)); await settle();
  assert(!has(h.tree, 'WorkLogContent')); assert(!text(h.tree).includes('최근 업무 기록이 없습니다'));
  assert.equal(h.find('AccountFeedback').props.error, '필수 자동 기록 조회 실패');
  assert.equal(h.findLabel('새로고침').props.disabled, false);
  h.findLabel('새로고침').props.onPress(); h.resolve(page('2026-10-03', { selectedEntry: null, recentLogs: [], contributionDates: [] })); await settle();
  assert.equal(h.find('WorkLogContent').props.entry, null); assert(text(h.tree).includes('최근 업무 기록이 없습니다')); h.destroy();
});
test('same-focus refresh 500 retains authorized rows while 403 and 404 remove private contents', async () => {
  for (const denied of [403, 404]) {
    const h = harness(); h.resolve(page()); await settle();
    h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('일시 조회 오류', 500)); await settle();
    assert.equal(h.find('WorkLogContent').props.entry.content, 'ACCOUNT_A_PRIVATE_BODY');
    h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('권한 또는 대상 변경', denied)); await settle();
    assert(!has(h.tree, 'WorkLogContent')); assert(!JSON.stringify(h.tree).includes('ACCOUNT_A_PRIVATE_BODY')); h.destroy();
  }
});
test('date changes ignore a late previous response and its finally cannot unlock the current request', async () => {
  const h = harness({ date: '2026-10-02' }); const old = h.pending();
  h.setProps({ date: '2026-10-01' }); await settle();
  assert.equal(h.pending('/work-logs?date=2026-10-01').path, '/work-logs?date=2026-10-01');
  old.settled = true; old.resolve(page('2026-10-02', { selectedEntry: entry('2026-10-02', { content: 'STALE_DATE_PRIVATE' }) })); await settle();
  assert(!has(h.tree, 'WorkLogContent')); assert.equal(h.findLabel('새로고침').props.disabled, true);
  h.resolve(page('2026-10-01', { selectedEntry: entry('2026-10-01', { content: 'CURRENT_DATE_PRIVATE' }) })); await settle();
  assert.equal(h.find('WorkLogContent').props.entry.content, 'CURRENT_DATE_PRIVATE'); assert(!JSON.stringify(h.tree).includes('STALE_DATE_PRIVATE')); h.destroy();
});
test('duplicate refresh issues one GET; blur and refocus release the old lock and retry the latest scope', async () => {
  const h = harness(); h.resolve(page()); await settle();
  const refresh = h.flat().props.refreshControl.props.onRefresh; refresh(); refresh(); await settle();
  assert.equal(h.requests.length, 2); const previous = h.pending();
  h.blur(); h.focus(); await settle(); assert.equal(h.requests.length, 3); assert(!has(h.tree, 'WorkLogContent'));
  previous.settled = true; previous.resolve(page('2026-10-03', { selectedEntry: entry('2026-10-03', { content: 'OLD_REFRESH_PRIVATE' }) })); await settle();
  assert(!has(h.tree, 'WorkLogContent')); assert.equal(h.findLabel('새로고침').props.disabled, true);
  h.reject(new api.ApiError('최신 재조회 실패', 503)); await settle(); assert.equal(h.findLabel('새로고침').props.disabled, false);
  h.findLabel('새로고침').props.onPress(); assert.equal(h.requests.length, 4); h.destroy();
});
test('date conditions reject invalid and future input, preserve corrections and apply only an explicit valid date', async () => {
  const h = harness(); h.resolve(page()); await settle(); h.findLabel('2026-10-03 조회 조건').props.onPress(); await settle();
  for (const date of ['2026-02-30', '2026-10-04']) {
    h.find('WorkLogField').props.onChange('workDate', date); await settle(); h.findLabel('날짜 조회').props.onPress(); await settle();
    assert.equal(h.navigation.length, 0); assert.equal(h.find('WorkLogField').props.value, date); assert(h.find('AccountFeedback').props.error.includes('오늘까지'));
  }
  h.find('WorkLogField').props.onChange('workDate', '2026-10-02'); await settle(); h.findLabel('날짜 조회').props.onPress();
  assert.deepEqual(h.navigation, [{ method: 'setParams', value: { date: '2026-10-02' } }]); h.destroy();
});
test('wrapper keys include account and date; old account guards and late responses cannot reach the new account', async () => {
  const wrapper = harness({ date: '2026-10-02' }, 'a', 'WorkLogsScreen'); const oldGuard = wrapper.tree.props.isCurrentAccount;
  assert.equal(wrapper.tree.key, 'synthetic-scope-a:2026-10-02'); assert(oldGuard());
  wrapper.changeToken('synthetic-scope-b'); assert.equal(oldGuard(), false); assert.equal(wrapper.tree.key, 'synthetic-scope-b:2026-10-02');
  const previousDate = wrapper.tree.props.isCurrentAccount; wrapper.setProps({ date: '2026-10-01' }); assert.equal(previousDate(), false); wrapper.destroy();
  const a = harness({}, 'a'), late = a.pending(); a.invalidateScope(); a.destroy();
  const b = harness({}, 'b'); b.resolve(page('2026-10-03', { userName: '가상 B', selectedEntry: entry('2026-10-03', { content: 'ACCOUNT_B_ONLY', manualLogId: 'qa-manual-b' }) })); await settle();
  late.settled = true; late.resolve(page()); await settle();
  assert.equal(b.find('WorkLogContent').props.entry.content, 'ACCOUNT_B_ONLY'); assert(!JSON.stringify(b.tree).includes('ACCOUNT_A_PRIVATE_BODY')); b.destroy();
});
test('captured row, edit, detail and linked-content navigation respects locks, fresh verification, focus and account scope', async () => {
  const h = harness(); h.resolve(page()); await settle();
  const callbacks = [h.findLabel('직접 작성 기록 수정').props.onPress, h.findLabel('선택일 상세 보기').props.onPress,
    h.findLabel('가상 직접 기록').props.onPress, h.findLabel(`${core.formatWorkLogDate('2026-10-03')} · 가상 날짜 요약`).props.onPress,
    () => h.find('WorkLogContent').props.onNavigate({ pathname: '/tasks/[id]', params: { id: 'qa-task-a' } })];
  const linked = h.find('WorkLogContent').props.onNavigate; callbacks[4] = () => linked({ pathname: '/tasks/[id]', params: { id: 'qa-task-a' } });
  callbacks[0](); assert.equal(h.navigation.length, 1); h.navigation.length = 0;
  h.flat().props.refreshControl.props.onRefresh(); callbacks.forEach(fn => fn()); assert.equal(h.navigation.length, 0);
  h.reject(new api.ApiError('가상 일시 오류', 500)); await settle(); callbacks[1](); assert.equal(h.navigation.length, 1); h.navigation.length = 0;
  h.blur(); callbacks.forEach(fn => fn()); assert.equal(h.navigation.length, 0);
  h.focus(); await settle(); h.reject(new api.ApiError('필수 재검증 실패', 503)); await settle(); callbacks.forEach(fn => fn()); assert.equal(h.navigation.length, 0);
  h.findLabel('새로고침').props.onPress(); h.resolve(page()); await settle();
  for (const denied of [403, 404]) {
    h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('확정된 권한 또는 대상 변경', denied)); await settle();
    callbacks.forEach(fn => fn()); assert.equal(h.navigation.length, 0);
    h.findLabel('새로고침').props.onPress(); h.resolve(page()); await settle();
  }
  h.invalidateScope(); callbacks.forEach(fn => fn()); assert.equal(h.navigation.length, 0); h.destroy();
});
