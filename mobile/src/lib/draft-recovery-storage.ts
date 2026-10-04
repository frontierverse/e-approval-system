import { boundRecoveryRecord, draftId, draftIso, isRecoveryRecord, isRecoveryScope, RECOVERY_CHUNKS, RECOVERY_CHUNK_BYTES, RECOVERY_RECORD_BYTES, RECOVERY_SLOTS, recoveryAbort, recoveryChunks, recoveryDigest, recoveryObject, recoveryScopeKey, RecoveryUnavailable, utf8Bytes, type RecoveryMetadata, type RecoveryRecord, type RecoveryScope } from './draft-recovery-core';
export type RecoveryStoragePort = { available(): Promise<boolean>; get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };
type Manifest = { version: 1; state: 'record'; actorId: string; scope: RecoveryScope; namespace: string; revision: number; savedAt: string; mode: RecoveryRecord['mode']; pending: boolean; bank: 'a' | 'b'; count: number; bytes: number; digest: string };
const prefix = 'gyeoljaeon.draft-recovery.v1';
const manifestKey = (slot: number) => `${prefix}.${slot}.manifest`;
const chunkKey = (slot: number, bank: 'a' | 'b', index: number) => `${prefix}.${slot}.${bank}.${index}`;
function isManifest(value: unknown): value is Manifest { return recoveryObject(value) && Object.keys(value).length === 13 && ['version', 'state', 'actorId', 'scope', 'namespace', 'revision', 'savedAt', 'mode', 'pending', 'bank', 'count', 'bytes', 'digest'].every(key => Object.hasOwn(value, key)) && value.version === 1 && value.state === 'record' && draftId(value.actorId) && isRecoveryScope(value.scope) && draftId(value.namespace) && Number.isSafeInteger(value.revision) && Number(value.revision) > 0 && draftIso(value.savedAt) && ['full-text', 'proof-only'].includes(String(value.mode)) && typeof value.pending === 'boolean' && ['a', 'b'].includes(String(value.bank)) && Number.isSafeInteger(value.count) && Number(value.count) > 0 && Number(value.count) <= RECOVERY_CHUNKS && Number.isSafeInteger(value.bytes) && Number(value.bytes) > 0 && Number(value.bytes) <= RECOVERY_RECORD_BYTES && typeof value.digest === 'string' && /^[a-f0-9]{64}$/.test(value.digest); }
export function createDraftRecoveryStorage(port: RecoveryStoragePort) {
  let queue: Promise<unknown> = Promise.resolve(), generation = 0, actor: string | null = null, namespace = '', ready = false;
  const scopeEpoch = new Map<string, number>(), latestRevision = new Map<string, number>();
  const ordered = <T,>(work: () => Promise<T>): Promise<T> => { const next = queue.catch(() => undefined).then(work).catch(cause => { if (cause instanceof RecoveryUnavailable || cause instanceof Error && cause.name === 'AbortError') throw cause; throw new RecoveryUnavailable(); }); queue = next; return next; };
  const check = (epoch: number, isCurrent: () => boolean) => { if (epoch !== generation || !actor || !isCurrent()) throw recoveryAbort(); };
  const manifest = async (slot: number): Promise<Manifest | null> => {
    const raw = await port.get(manifestKey(slot));
    if (raw === null) return null;
    let value: unknown; try { value = JSON.parse(raw); } catch { throw new RecoveryUnavailable('기기에 보관한 내용을 확인하지 못했습니다.'); }
    if (recoveryObject(value) && Object.keys(value).length === 3 && value.version === 1 && value.state === 'tombstone' && draftId(value.namespace)) return null;
    if (!isManifest(value) || utf8Bytes(raw) > RECOVERY_CHUNK_BYTES) throw new RecoveryUnavailable('기기에 보관한 내용을 확인하지 못했습니다.');
    return value;
  };
  const removeSlot = async (slot: number) => {
    const tombstone = JSON.stringify({ version: 1, state: 'tombstone', namespace: `cleared_${generation}_${Date.now().toString(36)}` });
    await port.set(manifestKey(slot), tombstone);
    if (await port.get(manifestKey(slot)) !== tombstone) throw new RecoveryUnavailable('기기 보관 내용의 삭제를 확인하지 못했습니다.');
    for (const bank of ['a', 'b'] as const) for (let i = 0; i < RECOVERY_CHUNKS; i++) { const key = chunkKey(slot, bank, i); await port.remove(key); if (await port.get(key) !== null) throw new RecoveryUnavailable('기기 보관 내용의 삭제를 확인하지 못했습니다.'); }
  };
  const locate = async (scope: RecoveryScope) => { let empty = -1; for (let slot = 0; slot < RECOVERY_SLOTS; slot++) { const value = await manifest(slot); if (!value) { if (empty < 0) empty = slot; } else if (value.actorId === actor && recoveryScopeKey(value.scope) === recoveryScopeKey(scope)) return { slot, value }; else if (value.actorId !== actor) throw new RecoveryUnavailable('이전 계정의 보관 내용을 정리하지 못했습니다.'); } return { slot: empty, value: null }; };
  return {
    bind(actorId: string, isCurrent: () => boolean) {
      if (!draftId(actorId)) return Promise.reject(new RecoveryUnavailable());
      const epoch = ++generation; actor = actorId; namespace = `session_${epoch}_${Date.now().toString(36)}`; ready = false; scopeEpoch.clear(); latestRevision.clear();
      return ordered(async () => {
        check(epoch, isCurrent);
        if (!await port.available()) throw new RecoveryUnavailable('이 기기에서 작성 내용 보관을 사용할 수 없습니다.');
        for (let slot = 0; slot < RECOVERY_SLOTS; slot++) { const value = await manifest(slot); check(epoch, isCurrent); if (value && value.actorId !== actorId) await removeSlot(slot); else if (value) latestRevision.set(recoveryScopeKey(value.scope), value.revision); check(epoch, isCurrent); }
        ready = true;
      });
    },
    isReady() { return ready && !!actor; },
    list(isCurrent: () => boolean): Promise<RecoveryMetadata[]> {
      const epoch = generation;
      return ordered(async () => { check(epoch, isCurrent); if (!ready) throw new RecoveryUnavailable(); const result: RecoveryMetadata[] = []; for (let slot = 0; slot < RECOVERY_SLOTS; slot++) { const value = await manifest(slot); check(epoch, isCurrent); if (value && value.actorId === actor) result.push({ scope: value.scope, revision: value.revision, savedAt: value.savedAt, mode: value.mode, pending: value.pending }); } return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt)); });
    },
    read(scope: RecoveryScope, isCurrent: () => boolean): Promise<RecoveryRecord | null> {
      const epoch = generation, key = recoveryScopeKey(scope), captured = scopeEpoch.get(key) ?? 0;
      return ordered(async () => { check(epoch, isCurrent); if (!ready) throw new RecoveryUnavailable(); const found = await locate(scope); check(epoch, isCurrent); if (!found.value) return null; let raw = ''; for (let i = 0; i < found.value.count; i++) { const chunk = await port.get(chunkKey(found.slot, found.value.bank, i)); check(epoch, isCurrent); if (chunk === null || utf8Bytes(chunk) > RECOVERY_CHUNK_BYTES) throw new RecoveryUnavailable('기기에 보관한 내용의 일부를 읽지 못했습니다.'); raw += chunk; } if (captured !== (scopeEpoch.get(key) ?? 0)) throw recoveryAbort(); if (utf8Bytes(raw) !== found.value.bytes || recoveryDigest(raw) !== found.value.digest) throw new RecoveryUnavailable('기기 보관 내용의 무결성을 확인하지 못했습니다.'); let value: unknown; try { value = JSON.parse(raw); } catch { throw new RecoveryUnavailable(); } if (!isRecoveryRecord(value) || value.actorId !== actor || recoveryScopeKey(value.scope) !== key || value.revision !== found.value.revision || value.savedAt !== found.value.savedAt || value.mode !== found.value.mode || !!value.pending !== found.value.pending) throw new RecoveryUnavailable(); return value; });
    },
    write(input: RecoveryRecord, isCurrent: () => boolean): Promise<RecoveryRecord> {
      let record: RecoveryRecord; try { record = boundRecoveryRecord(input); } catch (cause) { return Promise.reject(cause); }
      const epoch = generation, key = recoveryScopeKey(record.scope), captured = scopeEpoch.get(key) ?? 0;
      latestRevision.set(key, Math.max(latestRevision.get(key) ?? 0, record.revision));
      return ordered(async () => { check(epoch, isCurrent); if (!ready || record.actorId !== actor) throw new RecoveryUnavailable(); if (captured !== (scopeEpoch.get(key) ?? 0) || record.revision < (latestRevision.get(key) ?? 0)) throw recoveryAbort(); const found = await locate(record.scope); check(epoch, isCurrent); if (found.slot < 0) throw new RecoveryUnavailable('기기에는 작성 내용 4개까지 보관할 수 있습니다. 현재 입력은 유지됩니다.'); if (found.value && found.value.revision > record.revision) throw recoveryAbort(); const bank = found.value?.bank === 'a' ? 'b' : 'a'; const raw = JSON.stringify(record), chunks = recoveryChunks(raw); if (!chunks.length || chunks.length > RECOVERY_CHUNKS) throw new RecoveryUnavailable(); const guard = () => { check(epoch, isCurrent); if (captured !== (scopeEpoch.get(key) ?? 0) || record.revision < (latestRevision.get(key) ?? 0)) throw recoveryAbort(); }; for (let i = 0; i < chunks.length; i++) { guard(); await port.set(chunkKey(found.slot, bank, i), chunks[i]); guard(); if (await port.get(chunkKey(found.slot, bank, i)) !== chunks[i]) throw new RecoveryUnavailable('기기 보관을 확인하지 못했습니다.'); } guard(); const next: Manifest = { version: 1, state: 'record', actorId: record.actorId, scope: record.scope, namespace, revision: record.revision, savedAt: record.savedAt, mode: record.mode, pending: !!record.pending, bank, count: chunks.length, bytes: utf8Bytes(raw), digest: recoveryDigest(raw) }; const encoded = JSON.stringify(next); if (utf8Bytes(encoded) > RECOVERY_CHUNK_BYTES) throw new RecoveryUnavailable(); await port.set(manifestKey(found.slot), encoded); guard(); if (await port.get(manifestKey(found.slot)) !== encoded) throw new RecoveryUnavailable('기기 보관을 확인하지 못했습니다.'); guard(); return record; });
    },
    discard(scope: RecoveryScope, expectedRevision: number, isCurrent: () => boolean): Promise<boolean> {
      const epoch = generation, key = recoveryScopeKey(scope);
      if ((latestRevision.get(key) ?? 0) > expectedRevision) return Promise.resolve(false);
      scopeEpoch.set(key, (scopeEpoch.get(key) ?? 0) + 1);
      return ordered(async () => { check(epoch, isCurrent); if (!ready) throw new RecoveryUnavailable(); if ((latestRevision.get(key) ?? 0) > expectedRevision) return false; const found = await locate(scope); check(epoch, isCurrent); if ((latestRevision.get(key) ?? 0) > expectedRevision) return false; if (!found.value) return true; if (found.value.revision !== expectedRevision) return false; await removeSlot(found.slot); check(epoch, isCurrent); latestRevision.delete(key); return true; });
    },
    purgeScope(scope: RecoveryScope, isCurrent: () => boolean): Promise<void> {
      const epoch = generation, key = recoveryScopeKey(scope); scopeEpoch.set(key, (scopeEpoch.get(key) ?? 0) + 1);
      return ordered(async () => { check(epoch, isCurrent); if (!ready) throw new RecoveryUnavailable(); const found = await locate(scope); check(epoch, isCurrent); if (found.value) await removeSlot(found.slot); check(epoch, isCurrent); latestRevision.delete(key); });
    },
    clear() {
      generation++; actor = null; ready = false; scopeEpoch.clear(); latestRevision.clear();
      return ordered(async () => { if (!await port.available()) throw new RecoveryUnavailable('기기 보관 내용을 정리하지 못했습니다.'); for (let slot = 0; slot < RECOVERY_SLOTS; slot++) await removeSlot(slot); });
    },
  };
}
export type DraftRecoveryStorage = ReturnType<typeof createDraftRecoveryStorage>;
