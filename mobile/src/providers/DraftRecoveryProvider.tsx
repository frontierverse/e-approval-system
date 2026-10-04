import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { draftRequest, type DraftRequestOptions } from '@/lib/draft-request';
import { draftRecoveryHasAccount, getDraftRecoverySnapshot, getDraftRecoveryStorage, subscribeDraftRecovery } from '@/lib/draft-recovery-privacy';
import { recoveryAbort, type RecoveryMetadata, type RecoveryRecord, type RecoveryScope } from '@/lib/draft-recovery-core';

type DraftRecoveryContextValue = {
  actorId: string | null; foreground: boolean; foregroundRevision: number; bindingRevision: number;
  durable: boolean; recoveryUnavailable: boolean; storageReady: boolean;
  isCurrentAccount(): boolean; isForeground(): boolean; foregroundGeneration(): number;
  request<T>(path: string, options?: DraftRequestOptions): Promise<T>;
  listMetadata(): Promise<RecoveryMetadata[]>;
  loadForExplicitRestore(scope: RecoveryScope): Promise<RecoveryRecord | null>;
  checkpoint(record: RecoveryRecord): Promise<RecoveryRecord>;
  restrictScope(scope: RecoveryScope): Promise<RecoveryMetadata | null>;
  purgeScope(scope: RecoveryScope): Promise<void>;
  discard(scope: RecoveryScope, expectedRevision: number): Promise<boolean>;
};
const DraftRecoveryContext = createContext<DraftRecoveryContextValue | null>(null);
export function useDraftRecovery() { const value = useContext(DraftRecoveryContext); if (!value) throw new Error('DraftRecoveryProvider가 필요합니다.'); return value; }
export function DraftRecoveryProvider({ children }: PropsWithChildren) {
  const { token, user, expireSession } = useSession();
  const key = token && user ? `${user.id}:${token}` : '';
  const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]);
  return <AccountDraftRecovery key={key} token={token} actorId={user?.id ?? null} isAccount={() => scope.current === key} expireSession={expireSession}>{children}</AccountDraftRecovery>;
}
function AccountDraftRecovery({ token, actorId, isAccount, expireSession, children }: PropsWithChildren<{ token: string | null; actorId: string | null; isAccount(): boolean; expireSession(token: string): Promise<void> }>) {
  const privacy = useSyncExternalStore(subscribeDraftRecovery, getDraftRecoverySnapshot, getDraftRecoverySnapshot);
  const alive = useRef(false), generation = useRef(0), account = useRef(isAccount), requests = useRef(new Map<AbortController, boolean>());
  const foregroundRef = useRef(AppState.currentState === 'active'), foregroundEpoch = useRef(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active'), [foregroundRevision, setForegroundRevision] = useState(0), [ready, setReady] = useState(false);
  useLayoutEffect(() => { account.current = isAccount; }, [isAccount]);
  const isCurrentAccount = useCallback(() => alive.current && !!token && !!actorId && account.current() && draftRecoveryHasAccount(actorId, token), [token, actorId]);
  const isForeground = useCallback(() => isCurrentAccount() && foregroundRef.current && getDraftRecoverySnapshot().status !== 'binding', [isCurrentAccount]);
  const foregroundGeneration = useCallback(() => foregroundEpoch.current, []);
  const request = useCallback(async <T,>(path: string, options: DraftRequestOptions = {}): Promise<T> => {
    const epoch = generation.current, foregroundAtStart = foregroundEpoch.current, isRead = (options.method ?? 'GET') === 'GET';
    if (!token || !isCurrentAccount() || isRead && !isForeground()) throw recoveryAbort();
    const controller = new AbortController(); requests.current.set(controller, isRead);
    const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
    try {
      const result = await draftRequest<T>(path, token, { ...options, signal: controller.signal });
      if (controller.signal.aborted || epoch !== generation.current || !isCurrentAccount() || isRead && (foregroundAtStart !== foregroundEpoch.current || !isForeground())) throw recoveryAbort();
      return result;
    } catch (cause) {
      if (epoch !== generation.current || !isCurrentAccount()) throw recoveryAbort();
      if (cause instanceof ApiError && cause.status === 401) await expireSession(token);
      throw cause;
    } finally { requests.current.delete(controller); options.signal?.removeEventListener('abort', abort); }
  }, [token, isCurrentAccount, isForeground, expireSession]);
  const listMetadata = useCallback(() => { if (!token || !actorId || !isForeground()) return Promise.reject(recoveryAbort()); return getDraftRecoveryStorage(actorId, token).list(isCurrentAccount); }, [token, actorId, isForeground, isCurrentAccount]);
  const loadForExplicitRestore = useCallback((scope: RecoveryScope) => { if (!token || !actorId || !isForeground()) return Promise.reject(recoveryAbort()); const foregroundAtStart = foregroundEpoch.current; return getDraftRecoveryStorage(actorId, token).read(scope, () => isForeground() && foregroundAtStart === foregroundEpoch.current); }, [token, actorId, isForeground]);
  const checkpoint = useCallback((record: RecoveryRecord) => { if (!token || !actorId || !isCurrentAccount()) return Promise.reject(recoveryAbort()); return getDraftRecoveryStorage(actorId, token).write(record, isCurrentAccount); }, [token, actorId, isCurrentAccount]);
  const restrictScope = useCallback(async (scope: RecoveryScope): Promise<RecoveryMetadata | null> => {
    if (!token || !actorId || !isCurrentAccount()) throw recoveryAbort();
    const store = getDraftRecoveryStorage(actorId, token);
    let record: RecoveryRecord | null = null;
    try { record = await store.read(scope, isCurrentAccount); }
    catch (cause) { if (cause instanceof Error && cause.name === 'AbortError') throw cause; }
    const original = record?.pending;
    const proof: RecoveryRecord | null = original && record ? { version: 1, actorId, scope, revision: record.revision, savedAt: record.savedAt, mode: 'proof-only', pending: { requestId: original.requestId, intent: original.intent, revision: original.revision, expectedUpdatedAt: original.expectedUpdatedAt, stage: original.stage, hasNewUploads: original.hasNewUploads, replayable: false } } : null;
    record = null;
    await store.purgeScope(scope, isCurrentAccount);
    if (!isCurrentAccount()) throw recoveryAbort();
    if (!proof) return null;
    const saved = await store.write(proof, isCurrentAccount);
    return { scope, revision: saved.revision, savedAt: saved.savedAt, mode: saved.mode, pending: true };
  }, [token, actorId, isCurrentAccount]);
  const purgeScope = useCallback((scope: RecoveryScope) => { if (!token || !actorId || !isCurrentAccount()) return Promise.reject(recoveryAbort()); return getDraftRecoveryStorage(actorId, token).purgeScope(scope, isCurrentAccount); }, [token, actorId, isCurrentAccount]);
  const discard = useCallback((scope: RecoveryScope, expectedRevision: number) => { if (!token || !actorId || !isForeground()) return Promise.reject(recoveryAbort()); return getDraftRecoveryStorage(actorId, token).discard(scope, expectedRevision, isCurrentAccount); }, [token, actorId, isForeground, isCurrentAccount]);
  useEffect(() => {
    alive.current = true; generation.current++; const epoch = generation.current;
    queueMicrotask(() => { if (alive.current && epoch === generation.current) setReady(true); });
    return () => {
      alive.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const controller of requests.current.keys()) controller.abort();
      requests.current.clear();
    };
  }, []);
  useEffect(() => {
    const change = (active: boolean) => { if (foregroundRef.current !== active) { foregroundEpoch.current++; setForegroundRevision(foregroundEpoch.current); } foregroundRef.current = active; setForeground(active); if (!active) for (const [controller, isRead] of requests.current) if (isRead) controller.abort(); };
    const state = AppState.addEventListener('change', value => change(value === 'active'));
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => change(false)) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => change(AppState.currentState === 'active')) : null;
    return () => { state.remove(); blur?.remove(); focus?.remove(); };
  }, []);
  const same = privacy.actorId === actorId && !!token;
  return <DraftRecoveryContext.Provider value={{ actorId, foreground: foreground && ready && same && privacy.status !== 'binding' && privacy.status !== 'unbound', foregroundRevision, bindingRevision: privacy.revision, durable: privacy.durable, storageReady: same && privacy.status === 'ready', recoveryUnavailable: same && privacy.status === 'unavailable', isCurrentAccount, isForeground, foregroundGeneration, request, listMetadata, loadForExplicitRestore, checkpoint, restrictScope, purgeScope, discard }}>{children}</DraftRecoveryContext.Provider>;
}
