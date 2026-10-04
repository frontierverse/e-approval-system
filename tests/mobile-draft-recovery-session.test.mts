import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftRecoveryHarness, createProtectedPort, deferred, nodes, tick } from './helpers/mobile-draft-recovery-client.mjs';

function createSession(stored: string | null = null) {
  const disk = new Map<string, string>();
  if (stored) disk.set('gyeoljaeon.mobile.session', stored);
  const protectedPort = createProtectedPort(disk), h = createDraftRecoveryHarness({ protectedPort });
  const binds: Record<string, unknown>[] = [], clears: Record<string, unknown>[] = [];
  const recovery = { bindFailure: false };
  const { ApiError } = h.load('lib/api.ts');
  h.mocks['./api'] = { ApiError, apiRequest: h.request };
  for (const [file, method] of [
    ['./attachment-transfer', 'clearAttachmentTransferCache'], ['./account-image', 'clearAccountImageResources'],
    ['./chat-file-transfer', 'clearChatFileResources'], ['./resource-file-transfer', 'clearResourceFileResources'],
    ['./youth-privacy', 'clearYouthResources'], ['./youth-file-transfer', 'clearYouthFileResources'],
  ]) h.mocks[file] = { [method]: async () => undefined };
  h.mocks['./draft-recovery-privacy'] = {
    bindDraftRecoverySession: async (value: Record<string, unknown>) => { binds.push(value); if (recovery.bindFailure) throw Error('Synthetic recovery storage lock'); },
    clearDraftRecoveryResources: (value: Record<string, unknown>) => { clears.push(value); return Promise.resolve(); },
  };
  const pending: { path: string; options: Record<string, unknown>; settled: boolean; resolve: (value: unknown) => void; reject: (cause: unknown) => void }[] = [];
  h.state.onRequest = (path: string, options: Record<string, unknown>) => {
    if (path === '/auth/logout') return Promise.resolve({ ok: true });
    const item = deferred(); pending.push({ path, options, settled: false, ...item }); return item.promise;
  };
  const provider = h.mount(h.load('lib/session.tsx').SessionProvider, { children: 'synthetic' });
  const session = () => nodes(provider.tree).find(row => row.type?.context)!.props.value;
  const finish = (path: string, value: unknown, reject = false, index = 0) => {
    const call = pending.filter(v => v.path === path && !v.settled)[index]; assert.ok(call, path);
    call.settled = true; if (reject) call.reject(value); else call.resolve(value);
  };
  const refresh = async () => { await tick(); provider.update(); await tick(); provider.update(); };
  const login = async (id: string) => { const result = session().signIn(id, 'synthetic'); finish('/auth/login', { token: 'synthetic-' + id, user: { id } }); await result; await refresh(); };
  return { h, protectedPort, provider, binds, clears, recovery, ApiError, session, finish, refresh, login };
}

test('draft recovery startup waits for verified identity and delayed A auth cannot overwrite signed-in B', async () => {
  const s = createSession('synthetic-a');
  try {
    await s.refresh(); assert.equal(s.binds.length, 0); assert.equal(s.clears.length, 0);
    assert.equal(s.session().token, null);
    await s.login('b'); assert.equal(s.session().token, 'synthetic-b');
    s.finish('/auth/me', { user: { id: 'a' } }); await s.refresh();
    assert.equal(s.session().token, 'synthetic-b');
    assert.deepEqual(s.binds.map(v => [v.actorId, v.mode]), [['b', 'sign-in']]);
    assert.equal(s.protectedPort.state.disk.get('gyeoljaeon.mobile.session'), 'synthetic-b');
  } finally { s.h.dispose(); }
});

test('latest login attempt alone publishes identity and binds the recovery namespace', async () => {
  const s = createSession();
  try {
    await s.refresh();
    const first = s.session().signIn('a', 'synthetic'), second = s.session().signIn('b', 'synthetic');
    s.finish('/auth/login', { token: 'synthetic-b', user: { id: 'b' } }, false, 1); await second; await s.refresh();
    s.finish('/auth/login', { token: 'synthetic-a', user: { id: 'a' } }); await first; await s.refresh();
    assert.equal(s.session().token, 'synthetic-b');
    assert.deepEqual(s.binds.map(v => v.actorId), ['b']);
    assert.equal(s.protectedPort.state.disk.get('gyeoljaeon.mobile.session'), 'synthetic-b');
  } finally { s.h.dispose(); }
});

test('late old-token 401 cannot clear B recovery or cancel its ongoing login', async () => {
  const s = createSession();
  try {
    await s.refresh(); await s.login('a');
    const old = s.session().request('/drafts/options').catch((cause: unknown) => cause);
    const logging = s.session().signIn('b', 'synthetic');
    s.finish('/drafts/options', new s.ApiError('synthetic old expiry', 401), true); await old; await s.refresh();
    s.finish('/auth/login', { token: 'synthetic-b', user: { id: 'b' } }); await logging; await s.refresh();
    const clears = s.clears.length;
    await s.session().expireSession('synthetic-a'); await s.refresh();
    assert.equal(s.clears.length, clears); assert.equal(s.session().token, 'synthetic-b');
    assert.equal(s.protectedPort.state.disk.get('gyeoljaeon.mobile.session'), 'synthetic-b');
    assert.deepEqual(s.binds.map(v => v.actorId), ['a', 'b']);
  } finally { s.h.dispose(); }
});

test('logout during a held credential commit cannot resurrect its token or recovery identity', async () => {
  const s = createSession(), held = deferred();
  try {
    await s.refresh(); await s.login('a');
    s.protectedPort.state.handler = async (call: { operation: string; value: string; apply: () => unknown }) => {
      if (call.operation === 'set' && call.value === 'synthetic-b') await held.promise;
      return call.apply();
    };
    const login = s.session().signIn('b', 'synthetic'); s.finish('/auth/login', { token: 'synthetic-b', user: { id: 'b' } }); await s.refresh();
    const logout = s.session().signOut(); await s.refresh();
    assert.equal(s.session().token, null);
    assert.ok(s.clears.some(v => v.expectedToken === 'synthetic-a' && v.reason === 'logout'));
    held.resolve(); await Promise.all([login, logout]); await s.refresh();
    assert.equal(s.session().token, null); assert.equal(s.session().user, null);
    assert.equal(s.protectedPort.state.disk.has('gyeoljaeon.mobile.session'), false);
    assert.deepEqual(s.binds.map(v => v.actorId), ['a']);
  } finally { held.resolve(); s.h.dispose(); }
});

test('verified startup preserves durable recovery while explicit logout clears the exact active identity once', async () => {
  const s = createSession('synthetic-a');
  try {
    await s.refresh(); s.finish('/auth/me', { user: { id: 'a' } }); await s.refresh();
    assert.equal(s.clears.length, 0); assert.equal(s.binds[0].mode, 'verified-startup');
    const captured = s.binds[0].isCurrent as () => boolean; assert.equal(captured(), true);
    await s.session().signOut(); await s.refresh(); assert.equal(captured(), false);
    assert.deepEqual(s.clears.map(v => [v.expectedToken, v.reason]), [['synthetic-a', 'logout']]);
  } finally { s.h.dispose(); }
});

test('recovery storage binding failure does not reject a valid persisted login', async () => {
  const s = createSession();
  try {
    await s.refresh(); s.recovery.bindFailure = true;
    await s.login('b');
    assert.equal(s.session().token, 'synthetic-b'); assert.equal(s.session().user.id, 'b');
    assert.equal(s.protectedPort.state.disk.get('gyeoljaeon.mobile.session'), 'synthetic-b');
    assert.deepEqual(s.binds.map(v => v.actorId), ['b']);
  } finally { s.h.dispose(); }
});

test('credential persistence failure preserves the current account and never binds the new recovery identity', async () => {
  const s = createSession();
  try {
    await s.refresh(); await s.login('a');
    s.protectedPort.state.handler = async (call: { operation: string; apply: () => unknown }) => {
      if (call.operation === 'set') throw Error('Synthetic credential OS lock');
      return call.apply();
    };
    const attempt = s.session().signIn('b', 'synthetic');
    s.finish('/auth/login', { token: 'synthetic-b', user: { id: 'b' } });
    await assert.rejects(attempt, /Synthetic credential OS lock/); await s.refresh();
    assert.equal(s.session().token, 'synthetic-a'); assert.equal(s.session().user.id, 'a');
    assert.equal(s.protectedPort.state.disk.get('gyeoljaeon.mobile.session'), 'synthetic-a');
    assert.deepEqual(s.binds.map(v => v.actorId), ['a']);
  } finally { s.h.dispose(); }
});
