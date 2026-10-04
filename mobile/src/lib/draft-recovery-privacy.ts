import { createDraftRecoveryStorage } from './draft-recovery-storage';
import { draftRecoveryPort, durableDraftRecovery } from './draft-recovery-store';
import { recoveryAbort, RecoveryUnavailable } from './draft-recovery-core';
const storage = createDraftRecoveryStorage(draftRecoveryPort);
type Snapshot = { actorId: string | null; status: 'unbound' | 'binding' | 'ready' | 'unavailable'; revision: number; durable: boolean };
let snapshot: Snapshot = { actorId: null, status: 'unbound', revision: 0, durable: durableDraftRecovery };
let boundToken: string | null = null, generation = 0;
const listeners = new Set<() => void>();
function publish(status: Snapshot['status'], actorId = snapshot.actorId) { snapshot = { actorId, status, revision: snapshot.revision + 1, durable: durableDraftRecovery }; for (const listener of listeners) listener(); }
export function subscribeDraftRecovery(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getDraftRecoverySnapshot() { return snapshot; }
export function draftRecoveryHasAccount(actorId: string, token: string) { return boundToken === token && snapshot.actorId === actorId; }
export function draftRecoveryIsBound(actorId: string, token: string) { return boundToken === token && snapshot.actorId === actorId && snapshot.status === 'ready'; }
export function getDraftRecoveryStorage(actorId: string, token: string) { if (!draftRecoveryHasAccount(actorId, token)) throw recoveryAbort(); if (snapshot.status !== 'ready') throw new RecoveryUnavailable('작성 내용 보관을 사용할 수 없습니다. 현재 입력은 유지됩니다.'); return storage; }
export function bindDraftRecoverySession({ actorId, token, mode, isCurrent }: { actorId: string; token: string; mode: 'verified-startup' | 'sign-in'; isCurrent: () => boolean }): Promise<void> {
  void mode;
  if (!isCurrent()) return Promise.reject(recoveryAbort());
  const epoch = ++generation; boundToken = token; publish('binding', actorId);
  return storage.bind(actorId, () => epoch === generation && boundToken === token && isCurrent()).then(() => { if (epoch !== generation || !isCurrent()) throw recoveryAbort(); publish('ready', actorId); }).catch(cause => { if (epoch === generation && boundToken === token) publish('unavailable', actorId); throw cause; });
}
export function clearDraftRecoveryResources({ expectedToken, reason }: { expectedToken: string | null; reason: 'logout' | 'unauthorized' | 'no-session' }): Promise<void> {
  void reason;
  if (expectedToken === null ? boundToken !== null : boundToken !== expectedToken) return Promise.resolve();
  const epoch = ++generation; boundToken = null; publish('unbound', null);
  return storage.clear().catch(cause => { if (epoch === generation && boundToken === null) publish('unavailable', null); throw cause; });
}
