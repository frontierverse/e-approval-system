import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, harness, homeResponse, response, settle, task, text, walk } from './helpers/mobile-tasks-screen.mjs';

// Real production TSX with lexical hooks/session/navigation boundaries.
// No global mocks, fixture requests, snapshots, or native OS verification.
test('Actual TasksContent ignores obsolete status/page GET and old result never flashes on new path', async () => {
  const h = harness(); try {
    const old = h.requests[0]; h.setProps({ status: 'completed', page: 2 }); assert.equal(h.requests.length, 2); assert.equal(h.flat().props.data.length, 0);
    const completed = task('qa-a-task-046', 2, '2026-10-03T00:00:00.000Z'); h.resolve(response({ status: 'completed', page: 2, rows: [completed] }), '/tasks?status=completed&page=2'); await settle();
    old.settled = true; old.resolve(response({ pending: 999 })); await settle(); assert.equal(h.flat().props.data[0].id, completed.id); assert.equal(h.flat().props.data[0].version, 2);
  } finally { h.destroy(); }
});
test('Actual list duplicate completion is one POST and definitive failure retries original version/payload', async () => {
  const h = harness(); try {
    h.resolve(response()); await settle(); const complete = h.row().complete; complete(); complete(); await settle();
    assert.equal(h.requests.filter(r => r.options?.method === 'POST').length, 1); assert.equal(h.row().disabled, true); assert.equal(h.row().pending, true);
    h.reject(new api.ApiError('가상 저장 실패', 500), '/tasks/qa-a-task-001/completion'); await settle(); assert.equal(h.flat().props.data[0].version, 0); assert.equal(h.row().disabled, false);
    h.action('다시 시도').onPress(); await settle(); const posts = h.requests.filter(r => r.options?.method === 'POST'); assert.equal(posts.length, 2); assert.deepEqual(posts[0].options, posts[1].options);
    assert.deepEqual(posts[1].options.body, { completed: true, version: 0 });
    h.resolve({ ok: true, message: '가상 완료 성공', task: task('qa-a-task-001', 1, '2026-10-03T00:00:00.000Z') }, '/tasks/qa-a-task-001/completion'); await settle();
    assert.equal(h.flat().props.data.length, 0); assert(text(h.flat().props.ListHeaderComponent).includes('—'));
    h.resolve(response({ rows: [], pending: 44, overdue: 11 }), '/tasks?status=pending&page=1'); await settle(); assert(text(h.flat().props.ListHeaderComponent).includes('44건'));
  } finally { h.destroy(); }
});
test('Actual list409 blocks automatic overwrites and requires successful latest GET before a new version mutation', async () => {
  const h = harness(); try {
    h.resolve(response()); await settle(); h.row().complete(); await settle(); h.reject(new api.ApiError('다른 창에서 변경됨', 409), '/tasks/qa-a-task-001/completion'); await settle();
    assert.equal(h.requests.length, 2); assert.equal(h.row().disabled, true); h.row().complete(); await settle(); assert.equal(h.requests.length, 2);
    h.action('최신 목록 불러오기').onPress(); await settle(); h.reject(new api.ApiError('최신조회 실패', 500), '/tasks?status=pending&page=1'); await settle(); assert.equal(h.row().disabled, true);
    h.action('최신 목록 불러오기').onPress(); await settle(); h.resolve(response({ rows: [task('qa-a-task-001', 7)] }), '/tasks?status=pending&page=1'); await settle();
    assert.equal(h.row().disabled, false); h.row().complete(); await settle(); assert.deepEqual(h.requests.at(-1).options.body, { completed: true, version: 7 });
  } finally { h.destroy(); }
});
test('Actual list404 removes inaccessible task content immediately and provides only latest GET recovery', async () => {
  const h = harness(); try {
    h.resolve(response()); await settle(); h.row().complete(); await settle(); h.reject(new api.ApiError('재배정된 업무', 404), '/tasks/qa-a-task-001/completion'); await settle();
    assert.equal(h.flat().props.data.length, 0); assert(!text(h.tree).includes('가상 할 일 qa-a-task-001')); assert.equal(h.requests.length, 2);
    h.action('최신 목록 불러오기').onPress(); await settle(); assert.equal(h.requests.at(-1).path, '/tasks?status=pending&page=1'); assert.equal(h.requests.filter(r => r.options?.method === 'POST').length, 1);
  } finally { h.destroy(); }
});
test('Actual pending mutation blur/refocus resumes blocked latest-path GET and releases controls', async () => {
  const h = harness(); try {
    h.resolve(response()); await settle(); h.row().complete(); await settle(); h.blur(); h.setProps({ status: 'all', page: 2 }); h.focus(); await settle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.flat().props.data.length, 0, 'Refocusing during a mutation must hide cached private rows');
    assert.equal(h.flat().props.ListEmptyComponent.type.name, 'TasksLoading', 'A blocked refocus GET during mutation must show loading instead of a false empty state');
    h.resolve({ ok: true, message: '늦은 완료', task: task('qa-a-task-001', 1, '2026-10-03T00:00:00.000Z') }, '/tasks/qa-a-task-001/completion'); await settle();
    assert.equal(h.requests.length, 3); assert.equal(h.requests.at(-1).path, '/tasks?status=all&page=2'); h.resolve(response({ status: 'all', page: 2, rows: [task('qa-a-task-025', 2)], pending: 44 }), '/tasks?status=all&page=2'); await settle();
    assert.equal(h.row().disabled, false); assert.equal(h.row().pending, false); assert.equal(h.flat().props.data[0].id, 'qa-a-task-025');
  } finally { h.destroy(); }
});
test('Actual blurred completion releases busy while hidden and later focus fetches latest list', async () => {
  const h = harness(); try {
    h.resolve(response()); await settle(); h.row().complete(); await settle(); h.blur(); h.resolve({ ok: true, message: '늦은 완료', task: task('qa-a-task-001', 1, '2026-10-03T00:00:00.000Z') }, '/tasks/qa-a-task-001/completion'); await settle();
    assert.equal(h.requests.length, 2); assert.equal(h.row().disabled, false); h.focus(); await settle(); assert.equal(h.requests.length, 3);
    assert.equal(h.flat().props.data.length, 0, 'Returning focus must hide cached private rows until the new own-task GET completes');
    h.resolve(response({ rows: [], pending: 44 }), '/tasks?status=pending&page=1'); await settle(); assert.equal(h.flat().props.data.length, 0);
  } finally { h.destroy(); }
});
test('Actual confirmed mutation followed by failed GET keeps success and retries GET without another POST', async () => {
  const h = harness('tasks', undefined, { status: 'all' }); try {
    h.resolve(response({ status: 'all' })); await settle(); h.row().complete(); await settle(); h.resolve({ ok: true, message: '확인된 저장 성공', task: task('qa-a-task-001', 1, '2026-10-03T00:00:00.000Z') }, '/tasks/qa-a-task-001/completion'); await settle();
    h.reject(new api.ApiError('후속조회 실패', 500), '/tasks?status=all&page=1'); await settle(); assert.equal(h.flat().props.data[0].version, 1); assert(text(h.flat().props.ListHeaderComponent).includes('—'));
    let notice; walk(h.flat().props.ListHeaderComponent, node => { if (node.type === 'AccountFeedback') notice = node.props; }); assert.equal(notice.message, '확인된 저장 성공');
    h.action('다시 시도').onPress(); await settle(); assert.equal(h.requests.filter(r => r.options?.method === 'POST').length, 1); assert.equal(h.requests.at(-1).path, '/tasks?status=all&page=1');
  } finally { h.destroy(); }
});
test('Actual account wrappers have token keys and previous-account late list/mutation responses cannot affect a new host', async () => {
  const wrapper = harness('tasks', 'TasksScreen'); const homeWrapper = harness('home', 'default');
  try { const first = wrapper.tree.key, homeFirst = homeWrapper.tree.key; wrapper.changeToken('synthetic-scope-b'); homeWrapper.changeToken('synthetic-scope-b'); assert.notEqual(wrapper.tree.key, first); assert.notEqual(homeWrapper.tree.key, homeFirst); } finally { wrapper.destroy(); homeWrapper.destroy(); }
  const a = harness(); a.resolve(response()); await settle(); a.row().complete(); await settle(); a.destroy(); const b = harness('tasks', undefined, {}, 'b');
  try { b.resolve(response({ rows: [task('qa-b-task-001')], pending: 3, overdue: 1 })); await settle(); a.resolve({ ok: true, message: 'A 이전 저장', task: task('qa-a-task-001', 1, '2026-10-03T00:00:00.000Z') }, '/tasks/qa-a-task-001/completion'); await settle(); assert.equal(a.requests.length, 2); assert.equal(b.flat().props.data[0].id, 'qa-b-task-001'); assert(!text(b.tree).includes('A 이전 저장')); assert.equal(b.requests.length, 1); } finally { b.destroy(); }
});
test('Actual TaskHomeEntry labels missing counts as unknown, formats subset counts and navigates to tasks', async () => {
  const h = harness('home', 'TestHomeEntry', { counts: undefined }); try {
    assert.equal(h.tree.props.accessibilityLabel, '내 할 일, 할 일 목록 보기'); assert(!text(h.tree).includes('0건'));
    h.setProps({ counts: { pending: 1000000, overdue: 12 } }); assert(text(h.tree).includes('미완료 1,000,000 · 초과 12')); assert.equal(h.tree.props.accessibilityLabel, '내 할 일, 미완료 1,000,000건 · 기한 초과 12건'); assert(Object.assign({}, ...h.tree.props.style({ pressed: false })).minHeight >= 44);
    h.tree.props.onPress(); assert.deepEqual(h.navigation, ['/tasks']);
  } finally { h.destroy(); }
});
test('Actual useHomeData preserves counts on refresh failure and ignores obsolete unfocused replies', async () => {
  const h = harness('home'); try {
    h.resolve(homeResponse()); await settle(); assert.equal(h.tree.data.taskCounts.pending, 45); h.tree.reload(); await settle(); h.reject(new api.ApiError('홈 조회 실패', 500)); await settle(); assert.equal(h.tree.data.taskCounts.pending, 45); assert.equal(h.tree.error, '홈 조회 실패');
    h.tree.reload(); await settle(); const old = h.requests.at(-1); h.blur(); h.focus(); await settle(); const latest = h.requests.at(-1); latest.settled = true; latest.resolve(homeResponse(44, 11)); await settle(); old.settled = true; old.resolve(homeResponse(999, 999)); await settle(); assert.equal(h.tree.data.taskCounts.pending, 44); assert.equal(h.tree.error, null); assert.equal(h.tree.loading, false);
  } finally { h.destroy(); }
});
test('Actual home remount starts unknown and ignores old-account response after new account loads', async () => {
  const a = harness('home'); const old = a.requests[0]; a.destroy(); const b = harness('home', undefined, {}, 'b');
  try { assert.equal(b.tree.data, null); assert.equal(b.tree.loading, true); b.resolve(homeResponse(3, 1)); await settle(); old.settled = true; old.resolve(homeResponse(45, 12)); await settle(); assert.equal(b.tree.data.taskCounts.pending, 3); assert.equal(b.requests.length, 1); } finally { b.destroy(); }
});
