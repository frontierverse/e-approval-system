import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, core, harness, manual, vacation, hospital, page, has, settle, text } from './helpers/mobile-work-schedules-screen.mjs';

// Actual production TSX, core and ApiError. Shared controls are lexical JSX
// boundaries; these tests do not claim a native layout, OS picker or DB result.
test('schedule counts and private rows remain unknown until a valid page arrives', async () => {
  const h = harness(); assert.equal(h.requests[0].path, '/schedules');
  assert(has(h.tree, 'ActivityIndicator')); assert(!has(h.tree, 'WorkScheduleSummary')); assert(!has(h.tree, 'WorkScheduleRowLink'));
  assert(!text(h.tree).includes('등록된 일정이 없습니다')); assert.equal(h.findLabel('날짜 선택').props.disabled, true);
  h.resolve(page()); await settle();
  assert.deepEqual(h.find('WorkScheduleSummary').props.counts, { total: 3, manual: 1, vacation: 1, hospital: 1 });
  assert.equal(h.all('WorkScheduleRowLink').length, 3); assert.equal(h.findLabel('등록').props.disabled, false); h.destroy();
});
test('invalid or duplicate date/month routes never fall back and explicit future or month-only selections are canonical', async () => {
  for (const props of [{ date: '' }, { date: '2026-02-30' }, { date: '2026-1-01' }, { month: '' }, { month: '2026-13' }, { date: '2026-10-03', month: '2026-11' }, { date: core.scheduleDate(['2026-10-03','2026-10-02']) }, { month: core.scheduleDate(['2026-10']) }]) {
    const h = harness(props); await settle(); assert.equal(h.requests.length, 0);
    assert(!has(h.tree, 'WorkScheduleRowLink')); assert(h.find('AccountFeedback').props.error.includes('자동 변경하지 않습니다')); assert.equal(h.navigation.length, 0); h.destroy();
  }
  for (const [props, selectedDate, path] of [[{ date: '2027-01-31' }, '2027-01-31', '/schedules?date=2027-01-31'], [{ month: '2026-11' }, '2026-11-01', '/schedules?month=2026-11'], [{ month: '2026-10' }, '2026-10-03', '/schedules?month=2026-10'], [{ month: '2024-02', date: '2024-02-29' }, '2024-02-29', '/schedules?month=2024-02&date=2024-02-29']]) {
    const h = harness(props); assert.equal(h.requests[0].path, path); h.resolve(page(selectedDate)); await settle(); assert.equal(h.all('WorkScheduleRowLink').length, 3); h.destroy();
  }
});
test('page predicate rejects malformed, leaking, duplicated or incorrectly counted records and mismatched successful dates', async () => {
  assert(core.isSchedulePage(page())); assert(core.isSchedulePage(page('2027-01-01'), { month: '2027-01' }));
  const malformed = [null, [], page(undefined, { canManage: false }), page(undefined, { privateMedical: 'NOT_ALLOWED' }),
    page(undefined, { items: undefined }), page(undefined, { monthCounts: { total: 3, manual: 1, vacation: 1, hospital: -1 } }),
    page(undefined, { selectedCounts: { total: 0, manual: 0, vacation: 0, hospital: 0 } }),
    page(undefined, { items: [manual('same'), manual('same')] }), page(undefined, { items: [manual('qa-a','2026-11-01')] }),
    page(undefined, { items: [manual('qa-a',undefined,{ updatedAt: '2026-10-03' })] }),
    page(undefined, { items: [manual('qa-a',undefined,{startMinute:541})] }),
    page(undefined, { items: [vacation('qa-vacation',undefined,{startMinute:0})] }),
    page(undefined, { items: [hospital('qa-hospital',undefined,{readOnly:false})] }),
    page(undefined, { items: [hospital('qa-hospital',undefined,{endMinute:1441})] })];
  for (const payload of malformed) assert.equal(core.isSchedulePage(payload), false);
  const h = harness({ date: '2026-10-02' }); h.resolve(page()); await settle();
  assert(!has(h.tree, 'WorkScheduleSummary')); assert(h.find('AccountFeedback').props.error.includes('응답')); h.destroy();
});
test('month counts include all days while selected rows preserve readonly discriminators, source times and long content', async () => {
  const long = '긴 업무 내용\n'.repeat(1000), selected = [vacation(), manual('qa-long',undefined,{content:long}), hospital()];
  const payload = page(undefined,{ items: [...selected, manual('qa-other-day','2026-10-04')] });
  assert(core.isSchedulePage(payload)); const h = harness(); h.resolve(payload); await settle();
  const rows = h.all('WorkScheduleRowLink'); assert.equal(rows.length, 3); assert(!rows.some(row=>row.props.title.includes('qa-other-day')));
  assert(rows.every(row=>row.props.numberOfLines===2)); const row = rows.find(row=>row.props.title===long); assert(row); assert.equal(row.props.title,long); assert(row.props.accessibilityLabel.length<210);
  assert(text(h.tree).includes('종일')); assert(text(h.tree).includes('00:00–24:00')); assert(text(h.tree).includes(core.scheduleSourceLabel(vacation()))); assert(text(h.tree).includes(core.scheduleSourceLabel(hospital()))); assert(rows.filter(row=>row.props.accessibilityLabel.includes('읽기 전용 상세')).length===2);
  h.findLabel('2026-10-03 날짜 선택').props.onPress(); await settle(); const summaries = h.all('WorkScheduleSummary');
  assert.deepEqual(summaries[0].props.counts,{total:4,manual:2,vacation:1,hospital:1}); assert.deepEqual(summaries[1].props.counts,{total:3,manual:1,vacation:1,hospital:1});
  rows[0].props.onPress(); assert.equal(h.navigation[0].value.pathname,'/work-schedules/[id]'); assert.equal(h.navigation[0].value.params.id,'qa-vacation-a'); h.destroy();
});
test('mandatory source failure is not empty, authorized same-focus rows survive 503, and 403/404 clear private data', async () => {
  const h=harness(); h.reject(new api.ApiError('원천 조회 실패',503)); await settle(); assert(!has(h.tree,'WorkScheduleSummary')); assert(!text(h.tree).includes('등록된 일정이 없습니다'));
  h.findLabel('새로고침').props.onPress(); h.resolve(page(undefined,{items:[]})); await settle(); assert.deepEqual(h.find('WorkScheduleSummary').props.counts,{total:0,manual:0,vacation:0,hospital:0}); assert(text(h.tree).includes('등록된 일정이 없습니다'));
  h.findLabel('새로고침').props.onPress(); h.resolve(page()); await settle();
  h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('잠시 실패',503)); await settle(); assert.equal(h.all('WorkScheduleRowLink').length,3);
  for(const status of [403,404]) { h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('권한 또는 대상 변경',status)); await settle(); assert(!has(h.tree,'WorkScheduleSummary')); assert(!has(h.tree,'WorkScheduleRowLink')); assert(!has(h.tree,'ScheduleCalendar')); h.findLabel('새로고침').props.onPress(); h.resolve(page()); await settle(); }
  h.destroy();
});
test('date and month transitions ignore late responses and a stale finally cannot unlock the latest request', async () => {
  const h=harness({date:'2026-10-02',month:'2026-10'}), old=h.pending();
  h.setProps({date:'2026-11-01',month:'2026-11'}); await settle(); assert.equal(h.pending('/schedules?month=2026-11&date=2026-11-01').path,'/schedules?month=2026-11&date=2026-11-01');
  old.settled=true; old.resolve(page('2026-10-02')); await settle(); assert(!has(h.tree,'WorkScheduleRowLink')); assert.equal(h.findLabel('새로고침').props?.disabled,true);
  h.resolve(page('2026-11-01')); await settle(); assert.equal(h.find('WorkScheduleSummary').props.label,'2026-11-01 일정'); h.destroy();
});
test('duplicate refresh makes one GET; blur/refocus hides cached names and starts a fresh generation', async () => {
  const h=harness(); h.resolve(page()); await settle(); const refresh=h.flat().props.refreshControl.props.onRefresh;
  refresh(); refresh(); assert.equal(h.requests.length,2); const old=h.pending();
  h.blur(); h.focus(); await settle(); assert.equal(h.requests.length,3); assert(!has(h.tree,'WorkScheduleRowLink')); assert(!has(h.tree,'WorkScheduleSummary')); assert(has(h.tree,'ActivityIndicator'));
  old.settled=true; old.resolve(page(undefined,{items:[hospital('qa-old',undefined,{youthName:'STALE_NAME',content:'STALE_NAME'})]})); await settle(); assert(!JSON.stringify(h.tree).includes('STALE_NAME')); assert.equal(h.findLabel('새로고침').props.disabled,true);
  h.reject(new api.ApiError('재검증 실패',503)); await settle(); assert.equal(h.findLabel('새로고침').props.disabled,false); assert(!has(h.tree,'WorkScheduleRowLink')); assert(!text(h.tree).includes('등록된 일정이 없습니다')); h.destroy();
});
test('date corrections preserve input and explicit future navigation; date/month buttons select canonical targets', async () => {
  const h=harness(); h.resolve(page()); await settle(); h.findLabel('2026-10-03 날짜 선택').props.onPress(); await settle();
  h.find('ScheduleField').props.onChange('date','2026-02-30'); await settle(); h.findLabel('날짜 조회').props.onPress(); await settle(); assert.equal(h.navigation.length,0); assert.equal(h.find('ScheduleField').props.value,'2026-02-30');
  h.find('ScheduleField').props.onChange('date','2027-01-01'); await settle(); h.findLabel('날짜 조회').props.onPress(); assert.deepEqual(h.navigation.at(-1),{method:'setParams',value:{date:'2027-01-01',month:'2027-01'}});
  h.findLabel('다음 날짜').props.onPress(); assert.deepEqual(h.navigation.at(-1).value,{date:'2026-10-04',month:'2026-10'});
  h.findLabel('다음 월').props.onPress(); assert.deepEqual(h.navigation.at(-1).value,{date:'2026-11-01',month:'2026-11'});
  h.setProps({date:'2026-11-01',month:'2026-11'}); h.resolve(page('2026-11-01')); await settle(); h.findLabel('이전 월').props.onPress(); assert.deepEqual(h.navigation.at(-1).value,{date:'2026-10-03',month:'2026-10'}); h.destroy();
});
test('wrapper keys include token, month and date; old guards and late account responses cannot reach another session', async () => {
  const wrapper=harness({date:'2026-10-03',month:'2026-10'},'a','WorkSchedulesScreen'), guard=wrapper.tree.props.isCurrentAccount; assert(guard()); assert.equal(wrapper.tree.key,'synthetic-scope-a:2026-10:2026-10-03');
  wrapper.changeToken('synthetic-scope-b'); assert(!guard()); const dateGuard=wrapper.tree.props.isCurrentAccount; wrapper.setProps({date:'2026-11-01',month:'2026-11'}); assert(!dateGuard()); wrapper.destroy();
  const a=harness(), late=a.pending(); a.invalidateScope(); a.destroy(); const b=harness({},'b'); b.resolve(page(undefined,{items:[manual('qa-b')]})); await settle(); late.settled=true; late.resolve(page(undefined,{items:[hospital('qa-a',undefined,{content:'OLD_RESTRICTED_NAME'})]})); await settle(); assert(!JSON.stringify(b.tree).includes('OLD_RESTRICTED_NAME')); assert.equal(b.find('WorkScheduleRowLink').props.title,'SHARED_MANUAL_qa-b'); b.destroy();
});
test('captured row/register/history and derived day/month/today/calendar callbacks require current verification and account', async () => {
  const h=harness(); h.resolve(page()); await settle(); h.findLabel('2026-10-03 날짜 선택').props.onPress(); await settle();
  const direct=[h.find('WorkScheduleRowLink').props.onPress,h.findLabel('등록').props.onPress,h.findLabel('일정 변경 내역').props.onPress];
  const derived=[h.findLabel('이전 날짜').props.onPress,h.findLabel('다음 날짜').props.onPress,h.findLabel('이전 월').props.onPress,h.findLabel('다음 월').props.onPress,h.findLabel('오늘').props.onPress,()=>calendarSelect('2026-10-04')]; const calendarSelect=h.findNamed('ScheduleCalendar').props.onSelect;
  const run=()=>[...direct,...derived].forEach(fn=>fn());
  h.flat().props.refreshControl.props.onRefresh(); run(); assert.equal(h.navigation.length,0); h.reject(new api.ApiError('잠시 실패',503)); await settle(); direct[0](); assert.equal(h.navigation.length,1); h.navigation.length=0;
  h.blur(); run(); assert.equal(h.navigation.length,0); h.focus(); await settle(); h.reject(new api.ApiError('필수 재검증 실패',503)); await settle(); run(); assert.equal(h.navigation.length,0);
  // User-entered correction remains usable while no old record is verified.
  h.find('ScheduleField').props.onChange('date','2026-10-05'); await settle(); h.findLabel('날짜 조회').props.onPress(); assert.equal(h.navigation.length,1); h.navigation.length=0;
  for(const status of [403,404]) { h.findLabel('새로고침').props.onPress(); h.resolve(page()); await settle(); h.flat().props.refreshControl.props.onRefresh(); h.reject(new api.ApiError('확정 권한 변경',status)); await settle(); run(); assert.equal(h.navigation.length,0); }
  h.invalidateScope(); run(); assert.equal(h.navigation.length,0); h.destroy();
});
test('actual calendar uses measured 308px threshold, 42 safe day cells and month-only counts with 44px targets', async () => {
  const h=harness({month:'2026-10',today:'2026-10-03',selectedDate:'2026-10-03',items:[manual(),hospital(),manual('qa-outside','2026-09-30')],disabled:false,onSelect:()=>{}},'a','TestCalendar');
  assert.equal(h.all('ScheduleDay').length,0); h.find('View').props.onLayout({nativeEvent:{layout:{width:307}}}); await settle(); assert.equal(h.all('ScheduleDay').length,0);
  h.find('View').props.onLayout({nativeEvent:{layout:{width:308}}}); await settle(); assert.equal(h.all('ScheduleDay').length,42); const day=h.all('ScheduleDay').find(node=>node.props.date==='2026-10-03'); assert.equal(day.props.count,2); assert(day.props.selected);
  const outside=h.all('ScheduleDay').find(node=>node.props.date==='2026-09-30'); assert.equal(outside.props.count,null); assert(!outside.props.inMonth);
  let picked; const d=harness({...day.props,onSelect:date=>{picked=date;}},'a','TestDay'); const press=d.find('Pressable'); assert.equal(press.props.accessibilityRole,'button'); assert.equal(press.props.accessibilityState.selected,true); assert(press.props.accessibilityLabel.includes('오늘 일정 2건')); assert.equal(press.props.style({pressed:false})[0].minWidth,44); assert.equal(press.props.style({pressed:false})[0].minHeight,48); press.props.onPress(); assert.equal(picked,'2026-10-03'); d.destroy(); h.destroy();
  for(const month of ['0001-01','9999-12']) { const grid=core.scheduleCalendar(month); assert.equal(grid.length,42); assert(grid.some(day=>day.date===null)); assert(grid.every(day=>day.date===null||core.isScheduleDate(day.date))); }
});
