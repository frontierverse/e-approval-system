import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftRecoveryHarness, createProtectedPort, deferred, nodes, tick } from './helpers/mobile-draft-recovery-client.mjs';

// Real provider, confirmation hook, editor, native protected-store adapter and
// storage constructor run unchanged. Map restarts prove storage effects only,
// not Android/iOS durability or native keyboard/window behavior.
async function exitFixture({ port = createProtectedPort(), record = null as Record<string, unknown> | null, recovery = false } = {}) {
  const h = createDraftRecoveryHarness({ os: 'android', protectedPort: port });
  delete h.mocks['@/components/use-confirm-action'];
  h.mocks['@/components/account-feedback'] = { AccountFeedback: 'AccountFeedback' };
  h.mocks['@/components/ui'].EmptyState = 'EmptyState';
  const privacy = h.load('lib/draft-recovery-privacy.ts');
  let accountCurrent = true;
  await privacy.bindDraftRecoverySession({ actorId: 'actor-a', token: 'synthetic-a', mode: 'verified-startup', isCurrent: () => accountCurrent });
  const core = h.load('lib/draft-recovery-core.ts');
  const scope = { kind: 'new', localId: 'local-exit-draft' };
  const options = {
    templates: [{ id: 'template-a', name: 'Synthetic template', fields: [{ name: 'note', label: 'Note', type: 'textarea', required: false }], initialValues: { note: '' } }],
    approvers: [{ id: 'director-a', name: 'Synthetic director', positionName: '시설장' }],
    attachmentPolicy: { maxFileCount: 5, maxFileSizeMb: 20, allowedExtensions: ['.pdf'] },
  };
  const requests: { path: string; method: string }[] = [];
  h.state.onFetch = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/api\/mobile/, '');
    requests.push({ path, method: init.method ?? 'GET' });
    assert.equal(path, '/drafts/options', 'exit never dispatches a server save or attachment mutation');
    return Response.json(structuredClone(options));
  };
  const providerModule = h.load('providers/DraftRecoveryProvider.tsx', 'AccountDraftRecovery');
  h.mocks['@/providers/DraftRecoveryProvider'] = providerModule;
  const provider = h.mount(providerModule.QAExposed, { token: 'synthetic-a', actorId: 'actor-a', isAccount: () => accountCurrent, expireSession: async (token: string) => { h.state.expired.push(token); }, children: 'child' });
  await tick(); provider.update();
  const value = () => nodes(provider.tree).find(v => v.type?.context)!.props.value;
  if (record) await value().checkpoint(record);
  const screen = recovery ? h.mount(h.load('components/draft-recovery-screen.tsx').DraftRecoveryScreen, {}) : h.mount(h.load('components/draft-editor.tsx', 'ScopedDraftEditor').QAExposed, { scope });
  const settle = async () => { for (let i = 0; i < 5; i++) { await tick(); provider.update(); screen.update(); } };
  const control = (label: string) => {
    const rows = nodes(screen.tree).filter(v => [v.props?.label, v.props?.title, v.props?.accessibilityLabel].includes(label) && typeof v.props?.onPress === 'function');
    const row = rows.find(v => v.type === 'PrimaryButton' && v.props.title === label) ?? rows[0];
    assert.ok(row, 'control ' + label); return row.props;
  };
  const field = (label: string) => h.find(screen, 'TextInput', label);
  const textRecord = (revision = 2, title = 'Stored title') => ({ version: 1, actorId: 'actor-a', scope, revision, savedAt: '2026-10-04T03:00:00.000Z', mode: 'full-text', templateFingerprint: core.templateFingerprint(options.templates[0]), baselineUpdatedAt: null, text: { title, templateId: 'template-a', fieldValues: { note: 'Stored private body' }, approverIds: ['director-a'] }, omittedAttachmentCount: 0, pending: null });
  const leave = () => { assert.equal(screen.prevent.enabled, true); screen.prevent.callback({ data: { action: { type: 'GO_BACK', source: 'synthetic-editor' } } }); };
  const autosave = async () => { const timer = [...h.state.timers.values()].find(v => v.delay === 800); assert.ok(timer, 'autosave scheduled'); timer.fn(); await settle(); };
  const feedback = () => nodes(screen.tree).filter(v => v.type === 'AccountFeedback').map(v => v.props).at(-1);
  const exitError = () => nodes(screen.tree).filter(v => v.type === 'Text' && v.props.accessibilityRole === 'alert').map(v => v.props.children).join(' ');
  await settle();
  return { h, port, provider, screen, value, core, scope, options, requests, settle, control, field, textRecord, leave, autosave, feedback, exitError, replaceAccount: () => { accountCurrent = false; } };
}

async function coldRecords(port: ReturnType<typeof createProtectedPort>) {
  const h = createDraftRecoveryHarness({ os: 'android', protectedPort: port.restart() });
  try {
    const privacy = h.load('lib/draft-recovery-privacy.ts');
    await privacy.bindDraftRecoverySession({ actorId: 'actor-a', token: 'synthetic-a', mode: 'verified-startup', isCurrent: () => true });
    const storage = privacy.getDraftRecoveryStorage('actor-a', 'synthetic-a');
    assert.ok(storage);
    const metadata = await storage.list(() => true);
    return Promise.all(metadata.map(v => storage.read(v.scope, () => true)));
  } finally { h.dispose(); }
}

function assertBlockedBody(tree: unknown) {
  assert.ok(nodes(tree).some(v => v.props?.pointerEvents === 'none' && v.props?.accessibilityElementsHidden === true && v.props?.importantForAccessibility === 'no-hide-descendants'), 'mounted form/list is inaccessible behind same-window confirmation');
}

test('actual inline confirmation cancel and hardware Back retain form, scroll subtree and foreground without native Alert/Modal', async () => {
  const f = await exitFixture();
  try {
    f.field('제목 필수').onChangeText('Unsaved title'); f.field('Note').onChangeText('Unsaved private body'); await f.settle();
    const epoch = f.value().foregroundGeneration();
    f.leave(); await f.settle(); assertBlockedBody(f.screen.tree);
    assert.equal(f.field('Note').value, 'Unsaved private body');
    assert.equal(nodes(f.screen.tree).filter(v => v.type === 'Modal' && v.props.visible).length, 0);
    f.control('취소').onPress(); await f.settle(); assert.equal(f.field('Note').value, 'Unsaved private body');
    f.leave(); await f.settle();
    assert.equal([...f.h.state.listeners.get('hardwareBackPress')][0](), true); await f.settle();
    assert.equal(f.value().foregroundGeneration(), epoch); assert.equal(f.h.state.alerts.length, 0);
    assert.equal(f.h.state.routes.length, 0); assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0);
    assert.equal(f.h.state.listeners.get('hardwareBackPress')?.size ?? 0, 0);
  } finally { f.h.dispose(); }
});

test('keep and duplicate confirmation publish exactly one owned checkpoint before one navigation dispatch', async () => {
  const f = await exitFixture();
  try {
    f.field('제목 필수').onChangeText('  Exact raw title  '); f.field('Note').onChangeText('  Exact raw body  '); await f.settle();
    f.leave(); await f.settle(); const accept = f.control('보관하고 나가기').onPress;
    accept(); accept(); await f.settle();
    assert.equal(f.h.state.routes.filter(v => v.method === 'dispatch').length, 1);
    const records = await coldRecords(f.port); assert.equal(records.length, 1);
    assert.equal(records[0].text.title, '  Exact raw title  '); assert.equal(records[0].text.fieldValues.note, '  Exact raw body  ');
    assert.equal(records[0].pending, null); assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0);
  } finally { f.h.dispose(); }
});

test('explicit discard removes older autosaved revision and late captured autosave cannot recreate it after navigation', async () => {
  const f = await exitFixture();
  try {
    f.field('제목 필수').onChangeText('Earlier autosaved'); await f.settle(); await f.autosave();
    assert.equal((await coldRecords(f.port)).length, 1);
    f.field('Note').onChangeText('New unsaved input'); await f.settle();
    const oldTimer = [...f.h.state.timers.values()].find(v => v.delay === 800)!.fn;
    f.leave(); await f.settle(); const discard = f.control('저장하지 않고 나가기').onPress;
    discard(); discard(); await f.settle(); oldTimer(); await f.settle();
    assert.equal(f.h.state.routes.filter(v => v.method === 'dispatch').length, 1);
    assert.deepEqual(await coldRecords(f.port), []); assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0);
  } finally { f.h.dispose(); }
});

test('failed keep stays on screen with exact input and still offers explicit discard instead of silently leaving', async () => {
  const f = await exitFixture();
  try {
    f.field('제목 필수').onChangeText('Keep during failure'); f.field('Note').onChangeText('Private failure body'); await f.settle();
    f.port.state.handler = call => { if (call.operation === 'set') throw Error('Synthetic protected store unavailable'); return call.apply(); };
    f.leave(); await f.settle(); f.control('보관하고 나가기').onPress(); await f.settle();
    assert.equal(f.h.state.routes.length, 0); assert.equal(f.field('Note').value, 'Private failure body');
    assert.match(f.exitError(), /보관하지 못해|보관/);
    f.port.state.handler = null; f.leave(); await f.settle(); f.control('저장하지 않고 나가기').onPress(); await f.settle();
    assert.equal(f.h.state.routes.filter(v => v.method === 'dispatch').length, 1);
    assert.deepEqual(await coldRecords(f.port), []);
  } finally { f.h.dispose(); }
});

test('failed discard does not dispatch and preserves current input plus the durable recovery record', async () => {
  const f = await exitFixture();
  try {
    f.field('제목 필수').onChangeText('Durable prior title'); await f.settle(); await f.autosave();
    f.field('Note').onChangeText('Current input retained'); await f.settle();
    f.port.state.handler = call => { if (call.operation === 'set') throw Error('Synthetic tombstone write failure'); return call.apply(); };
    f.leave(); await f.settle(); f.control('저장하지 않고 나가기').onPress(); await f.settle();
    assert.equal(f.h.state.routes.length, 0); assert.equal(f.field('Note').value, 'Current input retained');
    f.port.state.handler = null; assert.equal((await coldRecords(f.port))[0].text.title, 'Durable prior title');
    assert.ok(f.exitError());
  } finally { f.h.dispose(); }
});

test('discard refuses a separately published newer revision instead of clearing it under an old editor', async () => {
  const f = await exitFixture();
  try {
    f.field('제목 필수').onChangeText('Current editor'); await f.settle();
    await f.value().checkpoint(f.textRecord(20, 'Newer protected revision'));
    f.leave(); await f.settle(); f.control('저장하지 않고 나가기').onPress(); await f.settle();
    assert.equal(f.h.state.routes.length, 0); assert.match(f.exitError(), /더 최근/);
    assert.equal((await coldRecords(f.port))[0].revision, 20); assert.equal(f.field('제목 필수').value, 'Current editor');
  } finally { f.h.dispose(); }
});

test('captured leave actions cannot act after real Android blur/focus batch, account replacement or unmount', async () => {
  for (const phase of ['batch', 'account', 'unmount']) {
    const f = await exitFixture();
    try {
      f.field('제목 필수').onChangeText('Private kept title'); await f.settle(); f.leave(); await f.settle();
      const keep = f.control('보관하고 나가기').onPress, discard = f.control('저장하지 않고 나가기').onPress;
      const writes = f.port.state.calls.filter(v => v.operation !== 'get').length;
      if (phase === 'batch') { f.h.event('blur'); f.h.event('focus'); f.provider.update(); f.screen.render(); }
      if (phase === 'account') { f.replaceAccount(); f.screen.render(); }
      if (phase === 'unmount') f.screen.unmount();
      keep(); discard(); await tick();
      assert.equal(f.h.state.routes.length, 0, phase); assert.equal(f.port.state.calls.filter(v => v.operation !== 'get').length, writes, phase);
      assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0, phase);
      if (phase !== 'unmount') assert.equal(nodes(f.screen.tree).filter(v => v.type === 'TextInput').length, 0, phase);
    } finally { f.h.dispose(); }
  }
});

test('candidate discard cancel retains metadata; confirm only deletes that record and preserves current editable input', async () => {
  const seed = await exitFixture(); const record = seed.textRecord(5); seed.h.dispose();
  const f = await exitFixture({ record });
  try {
    f.field('제목 필수').onChangeText('Current form stays'); await f.settle();
    f.control('보관 내용 버리기').onPress(); await f.settle(); assertBlockedBody(f.screen.tree);
    f.control('취소').onPress(); await f.settle(); assert.equal((await f.value().listMetadata()).length, 1);
    f.control('보관 내용 버리기').onPress(); await f.settle(); const accept = f.control('버리기').onPress; accept(); accept(); await f.settle();
    assert.deepEqual(await coldRecords(f.port), []); assert.equal(f.field('제목 필수').value, 'Current form stays');
    assert.equal(f.h.state.routes.length, 0); assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0);
  } finally { f.h.dispose(); }
});

test('actual recovery list same-window discard is cancelable, deletes once and never deletes a server document', async () => {
  const seed = await exitFixture(); const record = seed.textRecord(5); seed.h.dispose();
  const f = await exitFixture({ record, recovery: true });
  try {
    f.control('보관 내용 1 버리기').onPress(); await f.settle(); assertBlockedBody(f.screen.tree);
    f.control('취소').onPress(); await f.settle(); assert.equal((await f.value().listMetadata()).length, 1);
    f.control('보관 내용 1 버리기').onPress(); await f.settle(); const accept = f.control('버리기').onPress; accept(); accept(); await f.settle();
    assert.deepEqual(await coldRecords(f.port), []);
    assert.ok(nodes(f.screen.tree).some(v => v.type === 'EmptyState'));
    assert.equal(f.h.state.alerts.length + f.h.state.routes.length, 0); assert.equal(f.requests.length, 0);
  } finally { f.h.dispose(); }
});

test('recovery list captured discard is fenced on foreground loss and exact revision mismatch', async () => {
  const seed = await exitFixture(); const record = seed.textRecord(5); seed.h.dispose();
  const f = await exitFixture({ record, recovery: true });
  try {
    f.control('보관 내용 1 버리기').onPress(); await f.settle(); const oldAccept = f.control('버리기').onPress;
    f.h.event('blur'); f.provider.update(); f.screen.update(); oldAccept(); await f.settle();
    assert.equal((await coldRecords(f.port)).length, 1);
    f.h.event('focus'); await f.settle(); f.control('보관 내용 1 버리기').onPress(); await f.settle();
    await f.value().checkpoint({ ...record, revision: 6, text: { ...record.text, title: 'Newer while confirming' } });
    f.control('버리기').onPress(); await f.settle();
    assert.equal((await coldRecords(f.port))[0].revision, 6); assert.match(f.feedback().error, /더 최근/);
  } finally { f.h.dispose(); }
});

test('pending attachment proof survives keep cold restart, while explicit discard removes only local proof and sends no server request', async () => {
  const proof = { version: 1, actorId: 'actor-a', scope: { kind: 'new', localId: 'local-exit-draft' }, revision: 5, savedAt: '2026-10-04T03:00:00.000Z', mode: 'proof-only', pending: { requestId: 'request_exit_unknown_01', intent: 'submit', revision: 5, expectedUpdatedAt: null, stage: 'unknown', hasNewUploads: true, replayable: false } };
  for (const choice of ['보관하고 나가기', '저장하지 않고 나가기']) {
    const f = await exitFixture({ record: proof });
    try {
      f.control('요청 확인 정보 열기').onPress(); await f.settle();
      f.leave(); await f.settle();
      assert.ok(nodes(f.screen.tree).some(v => v.type === 'Text' && String(v.props.children).includes('이미 서버에서 처리된 요청은 취소되지 않습니다')));
      f.control(choice).onPress(); await f.settle();
      assert.equal(f.h.state.routes.filter(v => v.method === 'dispatch').length, 1, choice + ': ' + f.exitError() + ' ' + JSON.stringify(f.feedback()));
      const records = await coldRecords(f.port);
      if (choice === '보관하고 나가기') { assert.equal(records.length, 1); assert.equal(records[0].mode, 'proof-only'); assert.equal(records[0].pending.requestId, proof.pending.requestId); assert.equal(records[0].pending.hasNewUploads, true); assert.equal(Object.hasOwn(records[0], 'text'), false); }
      else assert.deepEqual(records, []);
      assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0); assert.equal(f.requests.some(v => v.path.startsWith('/drafts/requests')), false);
    } finally { f.h.dispose(); }
  }
});

test('discard is blocked while keep is awaiting protected-store acknowledgement and original form is still retained', async () => {
  const f = await exitFixture(), held = deferred();
  try {
    f.field('제목 필수').onChangeText('Single busy leave'); await f.settle();
    let intercepted = false;
    f.port.state.handler = async call => { if (call.operation === 'set' && !intercepted) { intercepted = true; await held.promise; } return call.apply(); };
    f.leave(); await f.settle(); const keep = f.control('보관하고 나가기').onPress, discard = f.control('저장하지 않고 나가기').onPress;
    keep(); await f.settle(); discard(); f.screen.prevent.callback({ data: { action: { type: 'DUPLICATE' } } }); await tick();
    assert.equal(f.h.state.routes.length, 0); assert.equal(f.field('제목 필수').value, 'Single busy leave');
    held.resolve(); await f.settle(); assert.equal(f.h.state.routes.filter(v => v.method === 'dispatch').length, 1);
    assert.equal((await coldRecords(f.port)).length, 1);
  } finally { held.resolve(); f.port.state.handler = null; f.h.dispose(); }
});
