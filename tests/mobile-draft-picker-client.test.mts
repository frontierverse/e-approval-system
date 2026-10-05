import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftRecoveryHarness, deferred, nodes, tick } from './helpers/mobile-draft-recovery-client.mjs';

async function pickerFixture(os = 'android') {
  const h = createDraftRecoveryHarness({ os });
  const privacy = h.load('lib/draft-recovery-privacy.ts');
  let accountCurrent = true;
  await privacy.bindDraftRecoverySession({ actorId: 'actor-a', token: 'synthetic-a', mode: 'verified-startup', isCurrent: () => accountCurrent });
  const options = {
    templates: [
      { id: 'template-a', name: 'Synthetic template A', fields: [{ name: 'note', label: 'Note', type: 'textarea', required: false }, { name: 'kind', label: 'Kind', type: 'select', required: false, options: [{ label: 'Normal option', value: 'normal' }, { label: 'Other option', value: 'other' }] }], initialValues: { note: '', kind: 'normal' } },
      { id: 'template-b', name: 'Synthetic template B', fields: [{ name: 'memo', label: 'Memo', type: 'textarea', required: false }], initialValues: { memo: '' } },
    ],
    approvers: [{ id: 'director-a', name: 'Director A', positionName: '시설장' }, { id: 'director-b', name: 'Director B', positionName: '시설장' }],
    attachmentPolicy: { maxFileCount: 5, maxFileSizeMb: 20, allowedExtensions: ['.pdf'] },
  };
  const requests: { path: string; method: string }[] = [];
  let response: () => Promise<Response> = async () => Response.json(structuredClone(options));
  h.state.onFetch = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/api\/mobile/, '');
    requests.push({ path, method: init.method ?? 'GET' });
    assert.equal(path, '/drafts/options');
    return response();
  };
  const providerModule = h.load('providers/DraftRecoveryProvider.tsx', 'AccountDraftRecovery');
  // Use the same real module instance for the editor's context import.
  h.mocks['@/providers/DraftRecoveryProvider'] = providerModule;
  const provider = h.mount(providerModule.QAExposed, {
    token: 'synthetic-a', actorId: 'actor-a', isAccount: () => accountCurrent,
    expireSession: async (token: string) => { h.state.expired.push(token); }, children: 'child',
  });
  await tick(); provider.update();
  const scope = { kind: 'new', localId: 'local-picker-draft' };
  const editor = h.mount(h.load('components/draft-editor.tsx', 'ScopedDraftEditor').QAExposed, { scope });
  const settle = async () => { await tick(); provider.update(); editor.update(); await tick(); editor.update(); };
  await settle();
  const value = () => nodes(provider.tree).find(v => v.type?.context)!.props.value;
  const field = (label: string) => h.find(editor, 'TextInput', label);
  const control = (label: string) => {
    const row = nodes(editor.tree).find(v => [v.props?.label, v.props?.title, v.props?.accessibilityLabel].includes(label) && typeof v.props?.onPress === 'function');
    assert.ok(row, 'control ' + label); return row.props;
  };
  const radios = () => nodes(editor.tree).filter(v => v.props?.accessibilityRole === 'radio' && !v.props?.accessibilityLabel?.startsWith('결재자 '));
  const approver = (name: string) => control('결재자 ' + name + ' · 시설장');
  const option = (text: string) => {
    const row = radios().find(v => nodes(v).some(child => child.type === 'Text' && child.props.children === text));
    assert.ok(row, 'option ' + text); return row.props;
  };
  const visibleModals = () => nodes(editor.tree).filter(v => v.type === 'Modal' && v.props.visible);
  return { h, provider, editor, options, requests, settle, value, field, control, radios, option, approver, visibleModals, setResponse: (next: typeof response) => { response = next; }, invalidateAccount: () => { accountCurrent = false; } };
}

test('real recovery provider callbacks stay stable through Android editor typing and picker rerenders', async () => {
  const f = await pickerFixture();
  try {
    const before = f.value(), count = f.requests.length;
    f.field('제목 필수').onChangeText('Private title'); await f.settle();
    f.control('Synthetic template A').onPress(); await f.settle();
    for (const name of ['isCurrentAccount', 'isForeground', 'foregroundGeneration', 'request', 'listMetadata', 'loadForExplicitRestore', 'checkpoint', 'restrictScope', 'purgeScope', 'discard']) assert.equal(f.value()[name], before[name], name);
    assert.equal(f.requests.length, count, 'typing/opening does not revalidate focus');
    assert.equal(f.field('제목 필수').value, 'Private title');
    assert.equal(f.visibleModals().length, 0, 'Android picker creates no separate native Modal window');
    assert.equal(f.radios().length, 2);
    assert.equal(f.control('임시저장').disabled, true); assert.equal(f.control('파일 추가').disabled, true);
    assert.equal(f.approver('Director B').disabled, true);
  } finally { f.h.dispose(); }
});

test('Android in-tree template, select and approver picks stay usable without a new foreground read', async () => {
  const f = await pickerFixture();
  try {
    const count = f.requests.length, epoch = f.value().foregroundGeneration();
    f.control('Normal option').onPress(); await f.settle();
    assert.equal(f.visibleModals().length, 0); f.option('Other option').onPress(); await f.settle();
    assert.ok(f.control('Other option')); assert.equal(f.radios().length, 0);
    f.approver('Director B').onPress(); await f.settle();
    assert.equal(f.approver('Director B').accessibilityState.checked, true); assert.equal(f.radios().length, 0);
    f.control('Synthetic template A').onPress(); await f.settle();
    f.option('Synthetic template B').onPress(); await f.settle();
    f.control('변경').onPress(); await f.settle();
    assert.ok(f.control('Synthetic template B')); assert.equal(f.field('Memo').value, '');
    assert.equal(f.h.state.alerts.length, 0, 'Android dirty-template confirmation stays in the same tree');
    assert.equal(f.h.state.confirmations.length, 0, 'Android dirty-template selection never invokes native confirmation ask');
    assert.equal(f.requests.length, count); assert.equal(f.value().foregroundGeneration(), epoch);
    assert.equal(f.h.state.routes.length + f.h.state.uploads.length, 0);
  } finally { f.h.dispose(); }
});

test('Android picker close and hardware Back dismiss only the list, retain typed text and unregister the handler', async () => {
  const f = await pickerFixture();
  try {
    f.field('제목 필수').onChangeText('Keep title'); f.field('Note').onChangeText('Keep body'); await f.settle();
    f.control('Synthetic template A').onPress(); await f.settle();
    f.control('닫기').onPress(); await f.settle();
    assert.equal(f.radios().length, 0); assert.equal(f.field('Note').value, 'Keep body');
    f.control('Normal option').onPress(); await f.settle();
    const handlers = [...f.h.state.listeners.get('hardwareBackPress') ?? []];
    assert.equal(handlers.length, 1); assert.equal(handlers[0](), true); await f.settle();
    assert.equal(f.radios().length, 0); assert.equal(f.h.state.listeners.get('hardwareBackPress')?.size ?? 0, 0);
    assert.equal(f.field('제목 필수').value, 'Keep title'); assert.equal(f.field('Note').value, 'Keep body');
    assert.equal(f.h.state.routes.length, 0);
  } finally { f.h.dispose(); }
});

test('real Android external blur still closes picker, masks inputs and rejects old choices before fresh resume', async () => {
  const f = await pickerFixture(), held = deferred();
  try {
    f.field('제목 필수').onChangeText('Keep title'); f.field('Note').onChangeText('Keep body'); await f.settle();
    const oldChoice = f.approver('Director B').onPress, before = f.requests.length;
    f.h.event('blur'); f.provider.update(); f.editor.render();
    assert.equal(nodes(f.editor.tree).filter(v => v.type === 'TextInput').length, 0);
    oldChoice(); f.editor.flush(); await f.settle(); assert.equal(f.radios().length, 0);
    f.setResponse(() => held.promise); f.h.event('focus'); f.provider.update(); f.editor.update(); await tick();
    assert.equal(f.requests.length, before + 1); oldChoice();
    assert.equal(nodes(f.editor.tree).filter(v => v.type === 'TextInput').length, 0);
    held.resolve(Response.json(f.options)); await f.settle();
    assert.equal(f.field('제목 필수').value, 'Keep title'); assert.equal(f.field('Note').value, 'Keep body');
    assert.equal(f.approver('Director B').accessibilityState.checked, false); assert.equal(f.h.state.routes.length + f.h.state.expired.length, 0);
  } finally { held.resolve(Response.json(f.options)); f.h.dispose(); }
});

test('batched Android blur/focus never reuses held options or a captured picker choice', async () => {
  const f = await pickerFixture(), first = deferred(), second = deferred();
  try {
    const oldChoice = f.approver('Director B').onPress;
    f.setResponse(() => first.promise); f.editor.blur(); f.editor.focus(); await tick();
    f.h.event('blur'); f.h.event('focus'); f.provider.update();
    f.setResponse(() => second.promise); f.editor.update(); await tick();
    first.resolve(Response.json(f.options)); await tick(); f.editor.update();
    oldChoice(); assert.equal(nodes(f.editor.tree).filter(v => v.type === 'TextInput').length, 0);
    second.resolve(Response.json(f.options)); await f.settle();
    assert.equal(f.approver('Director B').accessibilityState.checked, false); assert.equal(f.radios().length, 0);
    assert.equal(f.h.state.expired.length, 0);
  } finally { first.resolve(Response.json(f.options)); second.resolve(Response.json(f.options)); f.h.dispose(); }
});

test('captured Android picker choices cannot affect a replacement account or a removed editor', async () => {
  for (const mode of ['account', 'unmount']) {
    const f = await pickerFixture();
    try {
      const choose = f.approver('Director B').onPress;
      if (mode === 'account') f.invalidateAccount(); else f.editor.unmount();
      choose(); await tick(); assert.equal(f.h.state.routes.length + f.h.state.uploads.length, 0);
      assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0);
    } finally { f.h.dispose(); }
  }
});

test('iOS retains its Modal for template/select choices while approvers stay inline', async () => {
  const f = await pickerFixture('ios');
  try {
    f.control('Normal option').onPress(); await f.settle(); assert.equal(f.visibleModals().length, 1);
    f.option('Other option').onPress(); await f.settle();
    assert.equal(f.visibleModals().length, 0); assert.ok(f.control('Other option'));
    f.approver('Director B').onPress(); await f.settle();
    assert.equal(f.visibleModals().length, 0); assert.equal(f.approver('Director B').accessibilityState.checked, true);
    assert.equal(f.approver('Director A').accessibilityState.checked, false);
  } finally { f.h.dispose(); }
});

test('Android dirty-template cancel keeps input and confirm changes only after explicit in-tree approval', async () => {
  const f = await pickerFixture();
  try {
    f.field('제목 필수').onChangeText('Keep title'); f.field('Note').onChangeText('Private old body'); await f.settle();
    f.control('Synthetic template A').onPress(); await f.settle();
    f.option('Synthetic template B').onPress(); await f.settle();
    assert.ok(f.control('변경')); assert.equal(f.field('Note').value, 'Private old body');
    assert.equal(f.h.state.confirmations.length, 0, 'No native useConfirmAction.ask boundary is invoked');
    assert.equal(f.h.state.alerts.length, 0); assert.equal(f.visibleModals().length, 0);
    f.control('취소').onPress(); await f.settle();
    assert.equal(f.radios().length, 2); assert.equal(f.field('Note').value, 'Private old body');
    f.option('Synthetic template B').onPress(); await f.settle(); f.control('변경').onPress(); await f.settle();
    assert.equal(f.field('제목 필수').value, 'Keep title'); assert.equal(f.field('Memo').value, '');
    assert.equal(nodes(f.editor.tree).filter(v => v.type === 'TextInput' && v.props.accessibilityLabel === 'Note').length, 0);
    assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0);
    assert.equal(f.h.state.confirmations.length, 0);
  } finally { f.h.dispose(); }
});

test('a captured pristine choice detects newer dirty input and a stale inline confirmation cannot restore a picker after blur', async () => {
  const f = await pickerFixture();
  try {
    f.control('Synthetic template A').onPress(); await f.settle();
    const oldChoice = f.option('Synthetic template B').onPress;
    f.field('Note').onChangeText('Newer dirty body'); await f.settle();
    oldChoice(); await f.settle();
    assert.ok(f.control('변경')); assert.equal(f.field('Note').value, 'Newer dirty body');
    const cancel = f.control('취소').onPress, accept = f.control('변경').onPress;
    f.h.event('blur'); f.provider.update(); f.editor.update();
    cancel(); accept(); await f.settle();
    assert.equal(f.radios().length, 0); assert.equal(nodes(f.editor.tree).filter(v => v.type === 'TextInput').length, 0);
    f.h.event('focus'); await f.settle();
    assert.ok(f.control('Synthetic template A')); assert.equal(f.field('Note').value, 'Newer dirty body');
    assert.equal(f.radios().length, 0); assert.equal(f.h.state.confirmations.length, 0);
    assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0);
  } finally { f.h.dispose(); }
});

test('actual Choice supplies its ref focus callback and Android close, choose, Back and prompt actions return focus once', async () => {
  const h = createDraftRecoveryHarness();
  try {
    let restored = 0, returnFocus: (() => void) | undefined;
    const choice = h.mount(h.load('components/draft-editor.tsx', 'Choice').QAExposed, { label: 'Actual Choice', onPress: (focus: () => void) => { returnFocus = focus; } });
    const pressable = h.find(choice, 'Pressable');
    pressable.ref.current = { focus: () => { restored++; } };
    pressable.onPress(); assert.equal(typeof returnFocus, 'function'); returnFocus!(); assert.equal(restored, 1);
  } finally { h.dispose(); }
  for (const action of ['close', 'choose', 'back', 'cancel', 'confirm', 'toggle']) {
    const f = await pickerFixture();
    try {
      let restored = 0;
      const prompt = action === 'cancel' || action === 'confirm';
      if (prompt) { f.field('Note').onChangeText('Retained dirty body'); await f.settle(); }
      const label = prompt ? 'Synthetic template A' : 'Normal option';
      f.control(label).onPress(() => { restored++; }); await f.settle(); assert.equal(restored, 0);
      if (action === 'close') f.control('닫기').onPress();
      if (action === 'choose') f.option('Other option').onPress();
      if (action === 'back') assert.equal([...f.h.state.listeners.get('hardwareBackPress')][0](), true);
      if (action === 'toggle') f.control(label).onPress();
      if (prompt) { f.option('Synthetic template B').onPress(); await f.settle(); assert.equal(restored, 0); f.control(action === 'cancel' ? '취소' : '변경').onPress(); }
      await f.settle(); assert.equal(restored, 1, action);
      assert.equal(f.radios().length, action === 'cancel' ? 2 : 0, action);
      assert.equal(f.h.state.routes.length, 0);
    } finally { f.h.dispose(); }
  }
});

test('captured Android focus restoration never runs after external blur, account replacement or editor removal', async () => {
  for (const phase of ['blur', 'account', 'unmount']) {
    const f = await pickerFixture();
    try {
      let restored = 0;
      f.field('Note').onChangeText('Dirty protected body'); await f.settle();
      f.control('Synthetic template A').onPress(() => { restored++; }); await f.settle();
      f.option('Synthetic template B').onPress(); await f.settle();
      const actions = [f.control('닫기').onPress, f.control('취소').onPress, f.control('변경').onPress, [...f.h.state.listeners.get('hardwareBackPress')][0]];
      if (phase === 'blur') { f.h.event('blur'); f.provider.update(); f.editor.render(); }
      if (phase === 'account') f.invalidateAccount();
      if (phase === 'unmount') f.editor.unmount();
      for (const action of actions) action();
      await tick(); assert.equal(restored, 0, phase);
      assert.equal(f.requests.filter(v => v.method !== 'GET').length, 0); assert.equal(f.h.state.routes.length, 0);
    } finally { f.h.dispose(); }
  }
});
