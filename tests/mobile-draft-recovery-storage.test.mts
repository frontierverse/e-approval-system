import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftRecoveryHarness, createProtectedPort, deferred, tick } from './helpers/mobile-draft-recovery-client.mjs';

const current = () => true;
const iso = '2026-10-04T03:00:00.000Z';
function record(revision = 1, localId = 'new-one', actorId = 'actor-a') {
  return { version: 1, actorId, scope: { kind: 'new', localId }, revision, savedAt: iso, mode: 'full-text', templateFingerprint: 'a'.repeat(64), baselineUpdatedAt: null, text: { title: '  Synthetic title  ', templateId: 'template-a', fieldValues: { note: '한글과 emoji 🧑‍🤝‍🧑\nraw text  ' }, approverIds: ['director-a'] }, omittedAttachmentCount: 0, pending: null };
}
function pending(value = record()) {
  return { ...value, pending: { requestId: 'request_recovery_01', intent: 'draft', revision: value.revision, expectedUpdatedAt: null, stage: 'unknown', hasNewUploads: false, replayable: true, templateFingerprint: value.templateFingerprint, text: structuredClone(value.text) } };
}
async function createStore(protectedPort = createProtectedPort()) {
  const h = createDraftRecoveryHarness({ protectedPort });
  const core = h.load('lib/draft-recovery-core.ts');
  const store = h.load('lib/draft-recovery-storage.ts').createDraftRecoveryStorage(protectedPort.port);
  await store.bind('actor-a', current);
  return { h, core, store, protectedPort };
}

test('actual recovery storage round-trips raw text, survives module restart and publishes only private metadata', async () => {
  const s = await createStore();
  try {
    const value = pending(); await s.store.write(value, current);
    assert.deepEqual(await s.store.read(value.scope, current), value);
    const list = await s.store.list(current);
    assert.deepEqual(Object.keys(list[0]).sort(), ['mode', 'pending', 'revision', 'savedAt', 'scope']);
    const next = await createStore(s.protectedPort.restart());
    try { assert.deepEqual(await next.store.read(value.scope, current), value); } finally { next.h.dispose(); }
    for (const call of s.protectedPort.state.calls.filter(v => v.operation === 'set')) {
      assert.ok(Buffer.byteLength(call.value, 'utf8') <= 1800);
      assert.match(call.key, /^[A-Za-z0-9._-]+$/); assert.ok(!call.key.includes('Synthetic'));
    }
    assert.ok(s.protectedPort.state.disk.size <= 300);
  } finally { s.h.dispose(); }
});

test('UTF8 chunk boundary preserves codepoints and strict records reject credential or file fields', async () => {
  const s = await createStore();
  try {
    const raw = '한'.repeat(600) + '🧑' + '글'.repeat(600), chunks = s.core.recoveryChunks(raw);
    assert.equal(chunks.join(''), raw); assert.ok(chunks.every((v: string) => Buffer.byteLength(v) <= 1800));
    assert.throws(() => s.core.recoveryChunks('\ud800'));
    for (const field of ['token', 'uploadId', 'uploadUrl', 'uri', 'file', 'name']) {
      assert.equal(s.core.isRecoveryRecord({ ...record(), [field]: 'synthetic-private' }), false);
    }
    assert.equal(s.core.isRecoveryRecord({ ...record(), version: 2 }), false);
    assert.equal(s.core.isRecoveryRecord({ ...record(), savedAt: '2026-10-04' }), false);
  } finally { s.h.dispose(); }
});

test('malformed Unicode inside a serialized recovery record cannot be accepted as intact text', async () => {
  const s = await createStore();
  try {
    const value = record(); value.text.fieldValues.note = '\ud800';
    await assert.rejects(s.store.write(value, current));
    assert.deepEqual(await s.store.list(current), []);
  } finally { s.h.dispose(); }
});

test('a pending revision cannot claim to be newer than the recovery record that contains it', async () => {
  const s = await createStore();
  try {
    const value = pending(); value.pending.revision = value.revision + 1;
    assert.equal(s.core.isRecoveryRecord(value), false);
    await assert.rejects(s.store.write(value, current));
  } finally { s.h.dispose(); }
});

test('oversized text preserves only explicit immutable proof; ordinary oversized text and fifth scope never evict', async () => {
  const s = await createStore();
  try {
    const value = pending(); value.text.fieldValues = Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['field' + i, '한'.repeat(5000)]));
    assert.ok(Buffer.byteLength(JSON.stringify(value), 'utf8') > 65536);
    const saved = await s.store.write(value, current);
    assert.equal(saved.mode, 'proof-only'); assert.equal(saved.pending.replayable, false);
    assert.equal(Object.hasOwn(saved, 'text'), false);
    assert.equal(saved.pending.requestId, value.pending.requestId);
    assert.equal(saved.pending.intent, value.pending.intent);
    assert.equal(Object.hasOwn(saved.pending, 'text'), false);
    const ordinary = { ...value, scope: { kind: 'new', localId: 'oversize' }, pending: null };
    await assert.rejects(s.store.write(ordinary, current));
    for (let i = 2; i <= 4; i++) await s.store.write(record(1, 'new-' + i), current);
    await assert.rejects(s.store.write(record(1, 'fifth'), current));
    const list = await s.store.list(current); assert.equal(list.length, 4);
    assert.ok(list.some((v: { scope: { localId: string } }) => v.scope.localId === 'new-one'));
    assert.ok(s.protectedPort.state.disk.size <= 300);
  } finally { s.h.dispose(); }
});

test('an interrupted inactive bank keeps the old committed revision and ignores complete orphan chunks', async () => {
  const s = await createStore();
  try {
    const first = record(); await s.store.write(first, current);
    s.protectedPort.state.handler = async (call: { operation: string; key: string; value: string; apply: () => unknown }) => {
      if (call.operation === 'set' && call.key.endsWith('.manifest')) throw Error('Synthetic interruption before commit point');
      return call.apply();
    };
    await assert.rejects(s.store.write({ ...first, revision: 2, text: { ...first.text, title: 'NEW private text' } }, current));
    const next = await createStore(s.protectedPort.restart());
    try { assert.deepEqual(await next.store.read(first.scope, current), first); } finally { next.h.dispose(); }
  } finally { s.h.dispose(); }
});

test('commit-point effect with lost acknowledgement is not a successful write but restart verifies the complete new revision', async () => {
  const s = await createStore();
  try {
    const first = record(); await s.store.write(first, current);
    s.protectedPort.state.handler = async (call: { operation: string; key: string; apply: () => unknown }) => {
      const result = call.apply();
      if (call.operation === 'set' && call.key.endsWith('.manifest')) throw Error('Synthetic acknowledgement loss');
      return result;
    };
    const latest = { ...first, revision: 2, text: { ...first.text, title: 'Latest raw text' } };
    await assert.rejects(s.store.write(latest, current));
    const next = await createStore(s.protectedPort.restart());
    try { assert.deepEqual(await next.store.read(first.scope, current), latest); } finally { next.h.dispose(); }
  } finally { s.h.dispose(); }
});

test('missing or altered committed chunks reject all text instead of returning partial text or empty success', async () => {
  const s = await createStore();
  try {
    const value = record(); await s.store.write(value, current);
    const key = [...s.protectedPort.state.disk.keys()].find(v => /\.a\.0$/.test(v))!;
    const old = s.protectedPort.state.disk.get(key)!;
    s.protectedPort.state.disk.delete(key);
    await assert.rejects(s.store.read(value.scope, current));
    s.protectedPort.state.disk.set(key, old + 'changed');
    await assert.rejects(s.store.read(value.scope, current));
    s.protectedPort.state.disk.set(key, old);
    assert.deepEqual(await s.store.read(value.scope, current), value);
  } finally { s.h.dispose(); }
});

test('clear invalidates a held old write synchronously, then ordered binding cannot delete new-account text', async () => {
  const s = await createStore(), held = deferred(); let entered = false;
  try {
    s.protectedPort.state.handler = async (call: { operation: string; key: string; apply: () => unknown }) => {
      if (!entered && call.operation === 'set' && /\.a\.0$/.test(call.key)) { entered = true; await held.promise; }
      return call.apply();
    };
    const old = s.store.write(record(), current).catch((cause: unknown) => cause);
    await tick(); assert.equal(entered, true);
    const clear = s.store.clear(); assert.equal(s.store.isReady(), false);
    const bind = s.store.bind('actor-b', current);
    const value = record(1, 'new-b', 'actor-b'), newer = s.store.write(value, current);
    held.resolve(); const cause = await old;
    assert.equal((cause as Error).name, 'AbortError');
    await clear; await bind; await newer;
    assert.deepEqual(await s.store.read(value.scope, current), value);
    assert.equal(await s.store.read(record().scope, current), null);
  } finally { held.resolve(); s.h.dispose(); }
});

test('an ACK discard queued before a newer checkpoint cannot tombstone it or erase the prior durable fallback', async () => {
  const s = await createStore(), held = deferred(); let entered = false;
  try {
    const first = record(5); await s.store.write(first, current);
    const unrelated = record(1, 'unrelated'); await s.store.write(unrelated, current);
    s.protectedPort.state.handler = async (call: { operation: string; key: string; apply: () => unknown }) => {
      if (!entered && call.operation === 'get' && call.key.endsWith('.manifest')) { entered = true; await held.promise; }
      return call.apply();
    };
    const blocker = s.store.read(unrelated.scope, current); await tick(); assert.equal(entered, true);
    const discarded = s.store.discard(first.scope, 5, current);
    const latest = { ...first, revision: 6 }, writing = s.store.write(latest, current);
    held.resolve(); await blocker; assert.equal(await discarded, false);
    await writing; assert.deepEqual(await s.store.read(first.scope, current), latest);
    assert.equal(s.protectedPort.state.calls.filter(v => v.operation === 'set' && v.key.endsWith('.manifest') && JSON.parse(v.value).state === 'tombstone').length, 0);
  } finally { held.resolve(); s.h.dispose(); }
});

test('native adapter keeps every protected OS operation in one ThisDeviceOnly service and verifies deletion effects', async () => {
  const protectedPort = createProtectedPort(), h = createDraftRecoveryHarness({ protectedPort });
  try {
    const native = h.load('lib/draft-recovery-store.native.ts');
    assert.equal(native.durableDraftRecovery, true);
    const store = h.load('lib/draft-recovery-storage.ts').createDraftRecoveryStorage(native.draftRecoveryPort);
    await store.bind('actor-a', current); const value = record(); await store.write(value, current);
    protectedPort.state.handler = async (call: { operation: string; apply: () => unknown }) => call.operation === 'remove' ? undefined : call.apply();
    await assert.rejects(store.discard(value.scope, value.revision, current));
    for (const call of protectedPort.state.calls) {
      assert.equal(call.options.keychainService, 'gyeoljaeon.draft-recovery.v1');
      assert.equal(call.options.keychainAccessible, protectedPort.secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
      assert.equal(call.options.requireAuthentication, false);
    }
  } finally { h.dispose(); }
});

test('web adapter never claims durability and a fresh module runtime has no prior memory record', async () => {
  const first = createDraftRecoveryHarness(), second = createDraftRecoveryHarness();
  try {
    const web = first.load('lib/draft-recovery-store.web.ts');
    assert.equal(web.durableDraftRecovery, false);
    const store = first.load('lib/draft-recovery-storage.ts').createDraftRecoveryStorage(web.draftRecoveryPort);
    await store.bind('actor-a', current); await store.write(record(), current);
    const fresh = second.load('lib/draft-recovery-storage.ts').createDraftRecoveryStorage(second.load('lib/draft-recovery-store.web.ts').draftRecoveryPort);
    await fresh.bind('actor-a', current); assert.deepEqual(await fresh.list(current), []);
    assert.equal(first.protectedPort.state.calls.length, 0);
    assert.equal(second.protectedPort.state.calls.length, 0);
  } finally { first.dispose(); second.dispose(); }
});

test('forced scope purge fences a held old read and removes both banks before only new minimal proof is published', async () => {
  const s = await createStore(), held = deferred(); let entered = false;
  try {
    const text = pending(record(5)); await s.store.write(text, current);
    await s.store.write({ ...text, revision: 6 }, current);
    s.protectedPort.state.handler = async (call: { operation: string; key: string; apply: () => unknown }) => {
      if (!entered && call.operation === 'get' && /\.[ab]\.0$/.test(call.key)) { entered = true; await held.promise; }
      return call.apply();
    };
    const oldRead = s.store.read(text.scope, current).catch((cause: unknown) => cause); await tick(); assert.equal(entered, true);
    const purge = s.store.purgeScope(text.scope, current);
    const proof = { version: 1, actorId: 'actor-a', scope: text.scope, revision: 6, savedAt: iso, mode: 'proof-only', pending: { requestId: text.pending.requestId, intent: text.pending.intent, revision: text.pending.revision, expectedUpdatedAt: null, stage: 'unknown', hasNewUploads: false, replayable: false } };
    const checkpoint = s.store.write(proof, current); held.resolve();
    assert.equal((await oldRead as Error).name, 'AbortError'); await purge; await checkpoint;
    assert.deepEqual(await s.store.read(text.scope, current), proof);
    assert.equal([...s.protectedPort.state.disk.values()].some(value => value.includes('Synthetic title') || value.includes('raw text')), false);
    const fresh = await createStore(s.protectedPort.restart());
    try { assert.deepEqual(await fresh.store.read(text.scope, current), proof); } finally { fresh.h.dispose(); }
  } finally { held.resolve(); s.h.dispose(); }
});
