import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftRecoveryHarness, deferred, nodes, tick } from './helpers/mobile-draft-recovery-client.mjs';

test('actual draft request rejects pre-aborted work without fetch, timers or unhandled rejection', async () => {
  const h = createDraftRecoveryHarness();
  try {
    let fetches = 0; h.state.onFetch = async () => { fetches++; return Response.json({ ok: true }); };
    const signal = new AbortController(); signal.abort();
    await assert.rejects(h.load('lib/draft-request.ts').draftRequest('/drafts/options', 'synthetic-a', { signal: signal.signal }), { name: 'AbortError' });
    await tick(); assert.equal(fetches, 0); assert.equal(h.state.timers.size, 0);
  } finally { h.dispose(); }
});

test('actual draft request keeps static upload and receipt paths closed by method and rejects traversal before transport', async () => {
  const h = createDraftRecoveryHarness();
  try {
    const fetches: unknown[][] = []; h.state.onFetch = async (...args: unknown[]) => { fetches.push(args); return Response.json({ ok: true }); };
    const { draftRequest } = h.load('lib/draft-request.ts');
    for (const [path, method] of [
      ['/drafts/uploads', 'GET'], ['/drafts/requests', 'GET'], ['/drafts/options', 'POST'],
      ['/drafts/../../auth/me', 'GET'], ['/drafts/%2e%2e/auth', 'GET'],
      ['/drafts/requests/request_recovery_01?documentId=doc_one&documentId=doc_two', 'GET'],
      ['/drafts/requests/request_recovery_01?documentId=doc_one&token=hidden', 'GET'],
    ]) await assert.rejects(draftRequest(path, 'synthetic-a', { method }), { status: 400 });
    assert.equal(fetches.length, 0);
    await draftRequest('/drafts/requests/request_recovery_01?documentId=doc_one', 'synthetic-a');
    assert.equal(fetches.length, 1);
    const options = fetches[0][1] as { headers: Record<string, string>; redirect: string; cache: string };
    assert.equal(options.headers.Authorization, 'Bearer synthetic-a');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.ok(!(fetches[0][0] as string).includes('synthetic-a'));
  } finally { h.dispose(); }
});

test('draft response body deadline bounds a hung JSON acknowledgement while preserving an unknown result', async () => {
  const h = createDraftRecoveryHarness(), body = deferred();
  try {
    h.state.onFetch = async () => ({ ok: true, status: 201, json: () => body.promise });
    const request = h.load('lib/draft-request.ts').draftRequest('/drafts', 'synthetic-a', { method: 'POST', body: { requestId: 'request_recovery_01' } });
    await tick(); h.fireTimers();
    await assert.rejects(request, { status: 0 });
    assert.equal(h.state.timers.size, 0);
    body.resolve({ documentId: 'late' }); await tick();
    assert.equal(h.state.routes.length, 0);
  } finally { body.resolve({}); h.dispose(); }
});

test('all malformed successful JSON bodies are ambiguous errors, while definite field validation remains typed', async () => {
  const h = createDraftRecoveryHarness();
  try {
    const { draftRequest } = h.load('lib/draft-request.ts');
    for (const value of [null, [], 'ok', true, 7]) {
      h.state.onFetch = async () => Response.json(value, { status: 201 });
      await assert.rejects(draftRequest('/drafts', 'synthetic-a', { method: 'POST', body: {} }), { status: 201 });
    }
    h.state.onFetch = async () => new Response('{truncated', { status: 200 });
    await assert.rejects(draftRequest('/drafts/options', 'synthetic-a'), { status: 200 });
    h.state.onFetch = async () => Response.json({ error: 'Synthetic field error', code: 'INVALID_REQUEST', fields: { title: 'Required', unsafe: { private: true } } }, { status: 400 });
    await assert.rejects(draftRequest('/drafts', 'synthetic-a', { method: 'POST', body: {} }), (cause: { status: number; fields: unknown }) => {
      assert.equal(cause.status, 400); assert.deepEqual(cause.fields, { title: 'Required' }); return true;
    });
  } finally { h.dispose(); }
});

test('actual commit status validator separates original commitment from newer current metadata and rejects unsafe proof', () => {
  const h = createDraftRecoveryHarness();
  try {
    const core = h.load('lib/draft-recovery-core.ts');
    const original = { requestId: 'request_recovery_01', intent: 'draft', originalDocumentId: null, documentId: 'created-doc', committedAt: '2026-10-04T03:00:00.000Z', committedUpdatedAt: '2026-10-04T03:00:00.001Z' };
    const current = { status: 'recalled', updatedAt: '2026-10-04T04:00:00.000Z', editable: true };
    const result = { ok: true, ...original, outcome: 'present', current };
    assert.equal(core.isDraftRequestStatus(result), true);
    assert.equal(core.matchesDraftProof(original, { requestId: original.requestId, intent: original.intent }, { kind: 'new', localId: 'original-local' }), true);
    assert.equal(core.matchesDraftProof(original, { requestId: original.requestId, intent: 'submit' }, { kind: 'new', localId: 'original-local' }), false);
    assert.equal(core.matchesDraftProof(original, { requestId: original.requestId, intent: original.intent }, { kind: 'document', documentId: 'other' }), false);
    assert.equal(core.isDraftRequestStatus({ ...result, outcome: 'deleted', current: null }), true);
    assert.equal(core.isDraftRequestStatus({ ...result, outcome: 'deleted' }), false);
    assert.equal(core.isDraftRequestStatus({ ...result, current: { ...current, status: 'submitted' } }), false);
    for (const field of ['title', 'content', 'filename', 'token', 'metadata']) assert.equal(core.isDraftRequestStatus({ ...result, [field]: 'private' }), false);
    assert.equal(core.isDraftRequestStatus({ ...result, committedUpdatedAt: '2026-10-04' }), false);
  } finally { h.dispose(); }
});

async function providerFixture(os = 'android') {
  const h = createDraftRecoveryHarness({ os }), privacy = h.load('lib/draft-recovery-privacy.ts');
  let current = true;
  await privacy.bindDraftRecoverySession({ actorId: 'actor-a', token: 'synthetic-a', mode: 'verified-startup', isCurrent: () => current });
  const provider = h.mount(h.load('providers/DraftRecoveryProvider.tsx', 'AccountDraftRecovery').QAExposed, { token: 'synthetic-a', actorId: 'actor-a', isAccount: () => current, expireSession: async (token: string) => { h.state.expired.push(token); }, children: 'child' });
  await tick(); provider.update();
  const value = () => nodes(provider.tree).find(v => v.type?.context)!.props.value;
  return { h, provider, privacy, value, replaceAccount: () => { current = false; } };
}

test('actual recovery provider rejects a read across batched Android blur/focus even when foreground returns true', async () => {
  const f = await providerFixture(), held = deferred();
  try {
    f.h.state.onFetch = () => held.promise;
    const before = f.value().foregroundGeneration();
    const loading = f.value().request('/drafts/options').catch((cause: unknown) => cause);
    await tick(); f.h.event('blur'); f.h.event('focus'); f.provider.update();
    assert.equal(f.value().foreground, true); assert.equal(f.value().foregroundGeneration(), before + 2);
    held.resolve(Response.json({ templates: [] }));
    assert.equal((await loading).name, 'AbortError'); assert.equal(f.h.state.expired.length, 0);
    f.h.state.onFetch = async () => Response.json({ fresh: true });
    assert.deepEqual(await f.value().request('/drafts/options'), { fresh: true });
  } finally { held.resolve(Response.json({})); f.h.dispose(); }
});

test('provider old-account 401 and captured request cannot expire or act on the replacement account', async () => {
  const f = await providerFixture(), held = deferred();
  try {
    const oldRequest = f.value().request; f.h.state.onFetch = () => held.promise;
    const loading = oldRequest('/drafts/options').catch((cause: unknown) => cause); await tick(); f.replaceAccount();
    held.resolve(Response.json({ error: 'Old expiry' }, { status: 401 }));
    assert.equal((await loading).name, 'AbortError'); assert.equal(f.h.state.expired.length, 0);
    await assert.rejects(oldRequest('/drafts/options'), { name: 'AbortError' });
    await assert.rejects(f.value().listMetadata(), { name: 'AbortError' });
  } finally { held.resolve(Response.json({})); f.h.dispose(); }
});

test('provider background blocks disclosure but preserves an account-owned checkpoint; unmount fences outstanding requests', async () => {
  const f = await providerFixture('ios'), held = deferred();
  try {
    f.h.event('change', 'background'); f.provider.update();
    assert.equal(f.value().foreground, false);
    await assert.rejects(f.value().loadForExplicitRestore({ kind: 'new', localId: 'local-draft' }), { name: 'AbortError' });
    const core = f.h.load('lib/draft-recovery-core.ts');
    const record = { version: 1, actorId: 'actor-a', scope: { kind: 'new', localId: 'local-draft' }, revision: 1, savedAt: '2026-10-04T03:00:00.000Z', mode: 'full-text', templateFingerprint: 'a'.repeat(64), baselineUpdatedAt: null, text: { title: 'Private raw text', templateId: 'template-a', fieldValues: {}, approverIds: [] }, omittedAttachmentCount: 0, pending: null };
    assert.equal(core.isRecoveryRecord(record), true); assert.equal((await f.value().checkpoint(record)).revision, 1);
    f.h.event('change', 'active'); f.provider.update();
    assert.equal((await f.value().listMetadata())[0].revision, 1);
    f.h.state.onFetch = () => held.promise;
    const loading = f.value().request('/drafts/options').catch((cause: unknown) => cause); await tick(); f.provider.unmount();
    held.resolve(Response.json({ fresh: false })); assert.equal((await loading).name, 'AbortError');
  } finally { held.resolve(Response.json({})); f.h.dispose(); }
});

function editorFixture({ document = false, record = null as Record<string, unknown> | null } = {}) {
  const h = createDraftRecoveryHarness();
  h.mocks['@/components/account-feedback'] = { AccountFeedback: 'AccountFeedback' };
  const core = h.load('lib/draft-recovery-core.ts'), { ApiError } = h.load('lib/api.ts');
  const scope = document ? { kind: 'document', documentId: 'draft-a' } : { kind: 'new', localId: 'local-draft' };
  const options = { templates: [{ id: 'template-a', name: 'Synthetic template', fields: [{ name: 'note', label: 'Note', type: 'textarea', required: false }], initialValues: { note: '' } }], approvers: [{ id: 'director', name: 'Synthetic director', positionName: '시설장' }], attachmentPolicy: { maxFileCount: 10, maxFileSizeMb: 20, allowedExtensions: ['.pdf'] } };
  let draft = { id: 'draft-a', title: 'Server title', templateId: 'template-a', status: 'draft', fieldValues: { note: 'Server private note' }, approverIds: ['director'], updatedAt: '2026-10-04T03:00:00.000Z', attachments: [] };
  const state = { current: true, foreground: true, epoch: 0, record, checkpoints: [] as Record<string, unknown>[], discards: [] as unknown[], purges: [] as unknown[], detailError: null as unknown, getRecordCalls: 0, readbackFailure: false, checkpointDelay: null as Promise<unknown> | null };
  const recovery = {
    actorId: 'actor-a', foreground: true, foregroundRevision: 0, bindingRevision: 1, storageReady: true, recoveryUnavailable: false, durable: true,
    isCurrentAccount: () => state.current, isForeground: () => state.current && state.foreground, foregroundGeneration: () => state.epoch,
    request: h.request,
    listMetadata: async () => state.record ? [{ scope: state.record.scope, revision: state.record.revision, savedAt: state.record.savedAt, mode: state.record.mode, pending: !!state.record.pending }] : [],
    loadForExplicitRestore: async () => { state.getRecordCalls++; return state.readbackFailure ? null : state.record; },
    checkpoint: async (value: Record<string, unknown>) => { if (state.checkpointDelay) await state.checkpointDelay; const bounded = core.boundRecoveryRecord(value); state.checkpoints.push(structuredClone(bounded)); state.record = structuredClone(bounded); return bounded; },
    discard: async (...args: unknown[]) => { state.discards.push(args); state.record = null; return true; },
    purgeScope: async (value: unknown) => { state.purges.push(value); state.record = null; },
    restrictScope: async (value: unknown) => {
      state.purges.push(value);
      const old = state.record, p = old?.pending as Record<string, unknown> | undefined;
      state.record = p && old ? { version: 1, actorId: 'actor-a', scope: value, revision: old.revision, savedAt: old.savedAt, mode: 'proof-only', pending: { requestId: p.requestId, intent: p.intent, revision: p.revision, expectedUpdatedAt: p.expectedUpdatedAt, stage: p.stage, hasNewUploads: p.hasNewUploads, replayable: false } } : null;
      return state.record ? { scope: value, revision: state.record.revision, savedAt: state.record.savedAt, mode: state.record.mode, pending: true } : null;
    },
  };
  h.mocks['@/providers/DraftRecoveryProvider'] = { useDraftRecovery: () => recovery };
  h.state.onRequest = async (path: string) => {
    if (path === '/drafts/options') return structuredClone(options);
    if (path === '/drafts/draft-a') { if (state.detailError) throw state.detailError; return { draft: structuredClone(draft) }; }
    throw Error('Unexpected editor request ' + path);
  };
  let editor = h.mount(h.load('components/draft-editor.tsx', 'ScopedDraftEditor').QAExposed, { scope });
  const cold = () => { editor.unmount(); editor = h.mount(h.load('components/draft-editor.tsx', 'ScopedDraftEditor').QAExposed, { scope }); };
  const update = async () => { await tick(); editor.update(); await tick(); editor.update(); };
  const button = (label: string) => {
    const v = nodes(editor.tree).find(v => [v.props?.label, v.props?.title, v.props?.accessibilityLabel].includes(label)); assert.ok(v, label); return v.props;
  };
  const field = (label: string) => h.find(editor, 'TextInput', label);
  const feedback = () => nodes(editor.tree).filter(v => v.type === 'AccountFeedback').map(v => v.props).at(-1);
  const textRecord = (revision = 5) => ({ version: 1, actorId: 'actor-a', scope, revision, savedAt: '2026-10-04T03:00:00.000Z', mode: 'full-text', templateFingerprint: core.templateFingerprint(options.templates[0]), baselineUpdatedAt: document ? draft.updatedAt : null, text: { title: '  Recovered raw title  ', templateId: 'template-a', fieldValues: { note: '  Recovered private note  ' }, approverIds: ['director'] }, omittedAttachmentCount: 2, pending: null });
  return { h, state, options, get editor() { return editor; }, cold, recovery, core, ApiError, scope, update, button, field, feedback, textRecord, setDraft: (value: typeof draft) => { draft = value; }, getDraft: () => draft };
}

test('editor offers only recovery metadata until explicit confirmed restore, preserving raw text and excluding files', async () => {
  const f = editorFixture();
  try {
    await f.update(); f.state.record = f.textRecord();
    f.cold(); await f.update();
    assert.equal(f.field('제목 필수').value, ''); assert.equal(f.state.getRecordCalls, 0);
    assert.equal(f.button('임시저장').disabled, true);
    f.h.state.confirm = false; f.button('보관 입력 복원').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, ''); assert.equal(f.state.checkpoints.length, 0);
    f.h.state.confirm = true; f.button('보관 입력 복원').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, '  Recovered raw title  '); assert.equal(f.field('Note').value, '  Recovered private note  ');
    assert.equal(f.h.state.picks.length + f.h.state.uploads.length, 0);
    assert.match(f.feedback().message, /첨부파일을 다시 선택/);
  } finally { f.h.dispose(); }
});

test('changed template schema prevents text restoration and never silently applies a prior pending payload', async () => {
  const f = editorFixture();
  try {
    await f.update(); f.state.record = { ...f.textRecord(), templateFingerprint: 'b'.repeat(64) };
    f.cold(); await f.update(); f.button('보관 입력 복원').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, ''); assert.match(f.feedback().error, /양식 또는 결재자/);
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 0);
    assert.ok(f.state.record);
  } finally { f.h.dispose(); }
});

test('unknown save blocks duplicate submissions, checks own status before retry and keeps the original immutable key and body', async () => {
  const f = editorFixture(), held = deferred();
  try {
    await f.update(); f.field('제목 필수').onChangeText(' Original title '); f.field('Note').onChangeText(' Original note '); await f.update();
    const originalRequest = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? held.promise : path.startsWith('/drafts/requests/') ? Promise.reject(new f.ApiError('Not observed', 404, undefined, 'NOT_FOUND')) : originalRequest(path, options);
    const save = f.button('임시저장').onPress; save(); save(); await f.update();
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1);
    const first = structuredClone(f.h.state.requests.find(v => v.method === 'POST').body);
    held.reject(new f.ApiError('Lost acknowledgement', 0)); await f.update();
    assert.equal(f.button('임시저장').disabled, true);
    f.field('제목 필수').onChangeText('Later raw input'); await f.update();
    f.button('원 요청 결과 확인').onPress(); await f.update();
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1);
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? { documentId: 'created-doc', status: 'draft', updatedAt: '2026-10-04T03:00:01.000Z', proof: { requestId: first.requestId, intent: 'draft', originalDocumentId: null, documentId: 'created-doc', committedAt: '2026-10-04T03:00:00.000Z', committedUpdatedAt: '2026-10-04T03:00:01.000Z' } } : path.startsWith('/drafts/requests/') ? Promise.reject(new f.ApiError('Not observed', 404, undefined, 'NOT_FOUND')) : originalRequest(path, options);
    f.button('같은 요청 재시도').onPress(); await f.update();
    const posts = f.h.state.requests.filter(v => v.method === 'POST'); assert.equal(posts.length, 2); assert.deepEqual(posts[1].body, first);
    assert.equal(f.field('제목 필수').value, 'Later raw input'); assert.equal(f.state.discards.length, 0); assert.equal(f.h.state.routes.length, 0);
    assert.match(f.feedback().message, /이후 입력은 남겨/);
    const recent = f.state.checkpoints.at(-1); assert.equal(recent.text.title, 'Later raw input'); assert.equal(recent.pending.text.title, 'Original title');
  } finally { held.resolve({}); f.h.dispose(); }
});

test('attachment-bearing proof recovery can query status but never reupload or repeat its mutation after NOT_FOUND', async () => {
  const f = editorFixture();
  try {
    await f.update();
    f.state.record = { version: 1, actorId: 'actor-a', scope: f.scope, revision: 7, savedAt: '2026-10-04T03:00:00.000Z', mode: 'proof-only', pending: { requestId: 'request_recovery_01', intent: 'draft', revision: 7, expectedUpdatedAt: null, stage: 'unknown', hasNewUploads: true, replayable: false } };
    f.cold(); await f.update(); f.button('요청 확인 정보 열기').onPress(); await f.update();
    const original = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => path.startsWith('/drafts/requests/') ? Promise.reject(new f.ApiError('Not observed', 404, undefined, 'NOT_FOUND')) : original(path, options);
    f.button('원 요청 결과 확인').onPress(); await f.update();
    assert.equal(nodes(f.editor.tree).some(v => v.props?.label === '같은 요청 재시도'), false);
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 0); assert.equal(f.h.state.uploads.length + f.h.state.picks.length, 0);
    assert.match(f.feedback().message, /결과 확인만/);
  } finally { f.h.dispose(); }
});

test('definite field rejection preserves raw input and permits correction with a new request key', async () => {
  const f = editorFixture();
  try {
    await f.update(); f.field('제목 필수').onChangeText(' Raw title '); f.field('Note').onChangeText(' Raw note '); await f.update();
    const original = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? Promise.reject(new f.ApiError('Synthetic validation', 400, { title: 'Correct title' }, 'VALIDATION_ERROR')) : original(path, options);
    f.button('임시저장').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, ' Raw title '); assert.equal(f.field('Note').value, ' Raw note '); assert.equal(f.button('임시저장').disabled, false);
    f.field('제목 필수').onChangeText('Corrected'); await f.update(); f.button('임시저장').onPress(); await f.update();
    const posts = f.h.state.requests.filter(v => v.method === 'POST'); assert.equal(posts.length, 2); assert.notEqual(posts[0].body.requestId, posts[1].body.requestId); assert.equal(posts[1].body.title, 'Corrected');
    assert.equal(nodes(f.editor.tree).some(v => v.props?.label === '원 요청 결과 확인'), false);
  } finally { f.h.dispose(); }
});

test('editor focus and foreground masks hide cached text immediately and stale callbacks cannot save or navigate', async () => {
  const f = editorFixture({ document: true });
  try {
    await f.update(); const staleSave = f.button('임시저장').onPress, staleOpen = f.button('작성 복구').onPress;
    f.editor.blur(); f.editor.render();
    assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false);
    staleSave(); staleOpen(); await tick(); assert.equal(f.h.state.routes.length, 0); assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 0);
    f.state.detailError = new f.ApiError('Synthetic lookup error', 500); f.editor.focus(); await f.update();
    assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false);
    assert.match(f.h.find(f.editor, 'ErrorState').message, /Synthetic lookup error/);
    f.state.detailError = null; f.h.find(f.editor, 'ErrorState').retry(); await f.update(); assert.equal(f.field('Note').value, 'Server private note');
    f.state.foreground = false; f.state.epoch++; f.recovery.foreground = false; f.recovery.foregroundRevision++; f.editor.update();
    assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false); staleSave(); await tick(); assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 0);
  } finally { f.h.dispose(); }
});

test('a late successful save after account loss cannot navigate, erase a checkpoint or disclose the old form', async () => {
  const f = editorFixture(), held = deferred();
  try {
    await f.update(); f.field('제목 필수').onChangeText('Private A'); await f.update();
    const original = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? held.promise : original(path, options);
    f.button('임시저장').onPress(); await f.update(); const post = f.h.state.requests.find(v => v.method === 'POST').body;
    f.state.current = false; f.editor.update();
    assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false);
    held.resolve({ documentId: 'created-doc', status: 'draft', updatedAt: '2026-10-04T03:00:01.000Z', proof: { requestId: post.requestId, intent: 'draft', originalDocumentId: null, documentId: 'created-doc', committedAt: '2026-10-04T03:00:00.000Z', committedUpdatedAt: '2026-10-04T03:00:01.000Z' } }); await f.update();
    assert.equal(f.h.state.routes.length, 0); assert.equal(f.state.discards.length, 0); assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false);
  } finally { held.resolve({}); f.h.dispose(); }
});

test('CAS rejection keeps input and requires an explicit confirmed fresh baseline before a new mutation', async () => {
  const f = editorFixture({ document: true });
  try {
    await f.update(); f.field('제목 필수').onChangeText('My raw input'); await f.update();
    const original = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? Promise.reject(new f.ApiError('CAS conflict', 409, undefined, 'DRAFT_CONFLICT')) : original(path, options);
    f.button('임시저장').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, 'My raw input'); assert.equal(f.button('임시저장').disabled, true);
    f.setDraft({ ...f.getDraft(), title: 'New server content', updatedAt: '2026-10-04T03:00:02.000Z' });
    f.button('최신 내용 확인').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, 'My raw input'); assert.equal(f.button('임시저장').disabled, true);
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1);
    f.h.state.confirm = false; f.button('입력 유지·최신 기준 적용').onPress(); await f.update(); assert.equal(f.button('임시저장').disabled, true);
    f.h.state.confirm = true; f.button('입력 유지·최신 기준 적용').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, 'My raw input'); assert.equal(f.button('임시저장').disabled, false);
    f.button('임시저장').onPress(); await f.update();
    const posts = f.h.state.requests.filter(v => v.method === 'POST'); assert.equal(posts.length, 2); assert.equal(posts[1].body.expectedUpdatedAt, '2026-10-04T03:00:02.000Z'); assert.notEqual(posts[0].body.requestId, posts[1].body.requestId);
  } finally { f.h.dispose(); }
});

test('confirmed target denial removes rendered and stored text while retaining only minimal unknown-request proof', async () => {
  const f = editorFixture({ document: true });
  try {
    await f.update(); f.field('제목 필수').onChangeText('Private unsaved A'); await f.update();
    const original = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? Promise.reject(new f.ApiError('Unknown commit', 0)) : original(path, options);
    f.button('임시저장').onPress(); await f.update();
    assert.equal(f.state.record.mode, 'full-text'); const key = f.state.record.pending.requestId;
    f.state.detailError = new f.ApiError('Permission removed', 403); f.editor.blur(); f.editor.focus(); await f.update();
    assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false); assert.equal(f.state.purges.length, 1);
    assert.equal(f.state.record.mode, 'proof-only'); assert.equal(f.state.record.pending.requestId, key); assert.equal(f.state.record.pending.replayable, false);
    const stored = JSON.stringify(f.state.record); assert.ok(!stored.includes('Private unsaved A')); assert.ok(!stored.includes('Server private note')); assert.ok(!stored.includes('fieldValues'));
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => path.startsWith('/drafts/requests/') ? Promise.reject(new f.ApiError('Not observed', 404, undefined, 'NOT_FOUND')) : original(path, options);
    f.button('원 요청 결과 확인').onPress(); await f.update();
    assert.equal(f.h.state.requests.filter(v => v.path.startsWith('/drafts/requests/')).length, 1);
    assert.equal(nodes(f.editor.tree).some(v => v.props?.label === '같은 요청 재시도'), false);
    f.state.detailError = null; f.editor.blur(); f.editor.focus(); await f.update();
    assert.equal(f.field('제목 필수').value, 'Server title'); assert.equal(f.button('임시저장').disabled, true);
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1);
  } finally { f.h.dispose(); }
});

test('recovery list displays metadata only and masks stale rows and callbacks until a fresh focused read succeeds', async () => {
  const f = editorFixture();
  try {
    await f.update(); f.editor.unmount(); f.state.record = f.textRecord();
    const list = f.h.mount(f.h.load('components/draft-recovery-screen.tsx').DraftRecoveryScreen);
    const refresh = async () => { await tick(); list.update(); await tick(); list.update(); };
    await refresh();
    assert.equal(nodes(list.tree).filter(v => v.props?.role === 'listitem').length, 1); assert.equal(f.state.getRecordCalls, 0);
    assert.ok(!JSON.stringify(list.tree).includes('Recovered private note'));
    const oldOpen = f.h.find(list, 'TextAction', '열기').onPress, oldRemove = f.h.find(list, 'TextAction', '버리기').onPress;
    list.blur(); list.render(); assert.equal(nodes(list.tree).filter(v => v.props?.role === 'listitem').length, 0);
    oldOpen(); oldRemove(); await refresh(); assert.equal(f.h.state.routes.length + f.state.discards.length, 0);
    f.recovery.listMetadata = async () => { throw Error('Synthetic metadata failure'); };
    list.focus(); await refresh(); assert.equal(nodes(list.tree).filter(v => v.props?.role === 'listitem').length, 0);
    assert.equal(nodes(list.tree).some(v => v.type === 'EmptyState'), false); oldOpen(); await tick(); assert.equal(f.h.state.routes.length, 0);
  } finally { f.h.dispose(); }
});

test('changed template pending recovery retains status-only proof instead of trapping or applying incompatible private text', async () => {
  const f = editorFixture();
  try {
    await f.update();
    const record = f.textRecord();
    f.state.record = { ...record, templateFingerprint: 'b'.repeat(64), pending: { requestId: 'request_recovery_01', intent: 'draft', revision: 5, expectedUpdatedAt: null, stage: 'unknown', hasNewUploads: false, replayable: true, templateFingerprint: 'b'.repeat(64), text: record.text } };
    f.cold(); await f.update(); f.button('보관 입력 복원').onPress(); await f.update();
    assert.equal(f.field('제목 필수').value, ''); assert.equal(f.field('Note').value, '');
    const original = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => path.startsWith('/drafts/requests/') ? Promise.reject(new f.ApiError('Not observed', 404, undefined, 'NOT_FOUND')) : original(path, options);
    f.button('원 요청 결과 확인').onPress(); await f.update();
    assert.equal(f.h.state.requests.filter(v => v.path.startsWith('/drafts/requests/')).length, 1);
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 0);
    assert.equal(nodes(f.editor.tree).some(v => v.props?.label === '같은 요청 재시도'), false);
    assert.equal(f.state.record.mode, 'full-text'); assert.equal(f.state.record.pending.requestId, 'request_recovery_01');
    assert.equal(f.state.checkpoints.length, 0); // The incompatible protected original stays intact for explicit disposal.
  } finally { f.h.dispose(); }
});

test('an editable receipt never restores disclosure after the fresh document read definitively denies access', async () => {
  for (const status of [403, 404]) {
    const f = editorFixture({ document: true });
    try {
      await f.update(); f.field('제목 필수').onChangeText('Private awaiting proof'); await f.update();
      const staleInput = f.field('제목 필수'), staleAdd = f.button('파일 추가'), staleSave = f.button('임시저장');
      const original = f.h.state.onRequest;
      f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? Promise.reject(new f.ApiError('Unknown', 0)) : original(path, options);
      f.button('임시저장').onPress(); await f.update(); const pending = f.state.record.pending;
      f.state.detailError = new f.ApiError('Current document access removed', status);
      f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => path.startsWith('/drafts/requests/') ? { ok: true, requestId: pending.requestId, intent: 'draft', originalDocumentId: 'draft-a', documentId: 'draft-a', committedAt: '2026-10-04T03:00:00.000Z', committedUpdatedAt: '2026-10-04T03:00:01.000Z', outcome: 'present', current: { status: 'draft', updatedAt: '2026-10-04T03:00:01.000Z', editable: true } } : original(path, options);
      f.button('원 요청 결과 확인').onPress(); await f.update();
      assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false);
      assert.equal(f.h.state.routes.length, 0); assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1);
      assert.ok(nodes(f.editor.tree).some(v => v.props?.label === '결과 문서 확인'));
      const checkpoints = f.state.checkpoints.length;
      // Post-commit denial preserves internal RAM/protected input; only disclosure
      // and new writes are forbidden. Cold restriction separately proves scrub.
      staleInput.onChangeText('Forbidden stale update'); staleAdd.onPress(); staleSave.onPress();
      f.h.fireTimers(); await f.update();
      assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false);
      assert.equal(f.h.state.picks.length, 0); assert.equal(f.h.state.uploads.length, 0);
      assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1);
      assert.equal(f.state.checkpoints.length, checkpoints);
    } finally { f.h.dispose(); }
  }
});

test('actual provider restriction scrubs protected full text and preserves only minimal actor-owned request proof', async () => {
  const f = await providerFixture();
  try {
    const scope = { kind: 'document', documentId: 'draft-a' }, iso = '2026-10-04T03:00:00.000Z';
    const text = { title: 'PRIVATE_RESTRICTED_TITLE', templateId: 'template-a', fieldValues: { note: 'PRIVATE_RESTRICTED_BODY' }, approverIds: [] };
    await f.value().checkpoint({ version: 1, actorId: 'actor-a', scope, revision: 8, savedAt: iso, mode: 'full-text', templateFingerprint: 'a'.repeat(64), baselineUpdatedAt: iso, text, omittedAttachmentCount: 0, pending: { requestId: 'request_recovery_01', intent: 'draft', revision: 7, expectedUpdatedAt: iso, stage: 'unknown', hasNewUploads: false, replayable: true, templateFingerprint: 'a'.repeat(64), text } });
    f.h.event('blur'); f.provider.update();
    const result = await f.value().restrictScope(scope);
    assert.deepEqual(result, { scope, revision: 8, savedAt: iso, mode: 'proof-only', pending: true });
    assert.equal([...f.h.protectedPort.state.disk.values()].some(v => v.includes('PRIVATE_RESTRICTED')), false);
    f.h.event('focus'); f.provider.update();
    const proof = await f.value().loadForExplicitRestore(scope);
    assert.equal(proof.mode, 'proof-only'); assert.equal(proof.pending.replayable, false); assert.equal(proof.pending.requestId, 'request_recovery_01'); assert.equal(proof.pending.revision, 7);
    const calls = f.h.protectedPort.state.calls.length; f.replaceAccount();
    await assert.rejects(f.value().restrictScope(scope), { name: 'AbortError' }); assert.equal(f.h.protectedPort.state.calls.length, calls);
  } finally { f.h.dispose(); }
});

test('cold forbidden or non-editable draft recovery still reaches own status with no private form or mutation', async () => {
  for (const status of [403, 404]) {
    const f = editorFixture({ document: true });
    try {
      await f.update(); const record = f.textRecord();
      f.state.record = { ...record, pending: { requestId: 'request_recovery_01', intent: 'draft', revision: 5, expectedUpdatedAt: record.baselineUpdatedAt, stage: 'unknown', hasNewUploads: false, replayable: true, templateFingerprint: record.templateFingerprint, text: record.text } };
      f.state.detailError = new f.ApiError('Current access denied', status); f.cold(); await f.update();
      assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false); assert.equal(f.state.record.mode, 'proof-only');
      f.button('요청 확인 정보 열기').onPress(); await f.update();
      const original = f.h.state.onRequest;
      f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => path.startsWith('/drafts/requests/') ? { ok: true, requestId: 'request_recovery_01', intent: 'draft', originalDocumentId: 'draft-a', documentId: 'draft-a', committedAt: '2026-10-04T03:00:00.000Z', committedUpdatedAt: '2026-10-04T03:00:01.000Z', outcome: 'deleted', current: null } : original(path, options);
      f.button('원 요청 결과 확인').onPress(); await f.update();
      assert.equal(f.h.state.requests.filter(v => v.path === '/drafts/requests/request_recovery_01?documentId=draft-a').length, 1);
      assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 0); assert.equal(nodes(f.editor.tree).some(v => v.type === 'TextInput'), false);
      assert.ok(!JSON.stringify(f.editor.tree).includes('Recovered private note'));
    } finally { f.h.dispose(); }
  }
});

test('opening recovery immediately after input waits for a verified checkpoint before navigation', async () => {
  const f = editorFixture(), held = deferred();
  try {
    await f.update(); f.field('제목 필수').onChangeText('Input before debounce'); await f.update();
    f.state.checkpointDelay = held.promise;
    f.button('작성 복구').onPress(); await tick();
    assert.equal(f.h.state.routes.length, 0);
    held.resolve(); await f.update();
    assert.equal(f.state.checkpoints.at(-1).text.title, 'Input before debounce');
    assert.deepEqual(f.h.state.routes, [{ method: 'push', value: '/drafts/recovery' }]);
  } finally { held.resolve(); f.h.dispose(); }
});

test('later input becomes a new explicit mutation only after confirmed fresh baseline and checkpoint readback', async () => {
  const f = editorFixture({ document: true });
  try {
    await f.update(); f.field('제목 필수').onChangeText('First sent input'); await f.update();
    const original = f.h.state.onRequest;
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => options.method === 'POST' ? Promise.reject(new f.ApiError('Unknown', 0)) : original(path, options);
    f.button('임시저장').onPress(); await f.update(); const pending = f.state.record.pending;
    f.field('제목 필수').onChangeText('Later input'); await f.update();
    f.setDraft({ ...f.getDraft(), title: 'Saved original', updatedAt: '2026-10-04T03:00:02.000Z' });
    f.h.state.onRequest = async (path: string, options: Record<string, unknown>) => path.startsWith('/drafts/requests/') ? { ok: true, requestId: pending.requestId, intent: 'draft', originalDocumentId: 'draft-a', documentId: 'draft-a', committedAt: '2026-10-04T03:00:00.000Z', committedUpdatedAt: '2026-10-04T03:00:01.000Z', outcome: 'present', current: { status: 'draft', updatedAt: '2026-10-04T03:00:02.000Z', editable: true } } : original(path, options);
    f.button('원 요청 결과 확인').onPress(); await f.update(); assert.equal(f.field('제목 필수').value, 'Later input');
    f.h.state.confirm = false; f.button('후속 입력으로 계속 작성').onPress(); await f.update(); assert.equal(f.button('임시저장').disabled, true);
    f.h.state.confirm = true; f.state.readbackFailure = true; f.button('후속 입력으로 계속 작성').onPress(); await f.update();
    assert.equal(f.button('임시저장').disabled, true); assert.equal(f.field('제목 필수').value, 'Later input'); assert.equal(f.h.state.routes.length, 0); assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1);
    f.state.readbackFailure = false; f.button('후속 입력으로 계속 작성').onPress(); await f.update();
    assert.equal(f.button('임시저장').disabled, false); assert.equal(f.field('제목 필수').value, 'Later input'); assert.equal(f.state.record.pending, null); assert.equal(f.state.record.baselineUpdatedAt, '2026-10-04T03:00:02.000Z');
    assert.equal(f.h.state.requests.filter(v => v.method === 'POST').length, 1); assert.equal(f.h.state.routes.length, 0);
    f.button('임시저장').onPress(); await f.update(); const posts = f.h.state.requests.filter(v => v.method === 'POST');
    assert.equal(posts.length, 2); assert.notEqual(posts[1].body.requestId, posts[0].body.requestId); assert.equal(posts[1].body.title, 'Later input'); assert.equal(posts[1].body.expectedUpdatedAt, '2026-10-04T03:00:02.000Z');
  } finally { f.h.dispose(); }
});
