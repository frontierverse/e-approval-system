import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { lunchCafeAbort, lunchCafeRequest, type LunchCafeRequestOptions } from '@/lib/lunch-cafe-request';
type LunchCafeContextValue = {
  foreground: boolean; foregroundRevision: number; isForeground(): boolean; foregroundGeneration(): number; isCurrentAccount(): boolean;
  get<T>(path: string, options?: Pick<LunchCafeRequestOptions, 'signal'>): Promise<T>;
  request<T>(path: string, options?: LunchCafeRequestOptions): Promise<T>;
};
const LunchCafeContext = createContext<LunchCafeContextValue | null>(null);
export function useLunchCafe() {
  const value = useContext(LunchCafeContext);
  if (!value) throw new Error('LunchCafeProvider가 필요합니다.');
  return value;
}
export function LunchCafeProvider({ children }: PropsWithChildren) {
  const { token, user, expireSession } = useSession();
  const key = token && user ? `${user.id}:${token}` : '';
  const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]);
  return <AccountLunchCafe key={key} token={token} isAccount={() => scope.current === key} expireSession={expireSession}>{children}</AccountLunchCafe>;
}
function AccountLunchCafe({ token, isAccount, expireSession, children }: PropsWithChildren<{ token: string | null; isAccount(): boolean; expireSession(token: string): Promise<void> }>) {
  const alive = useRef(false), generation = useRef(0), account = useRef(isAccount), requests = useRef(new Set<AbortController>());
  const foregroundRef = useRef(AppState.currentState === 'active'), foregroundEpoch = useRef(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active'), [foregroundRevision, setForegroundRevision] = useState(0), [ready, setReady] = useState(false);
  useLayoutEffect(() => { account.current = isAccount; }, [isAccount]);
  const isCurrentAccount = useCallback(() => alive.current && !!token && account.current(), [token]);
  const isForeground = useCallback(() => isCurrentAccount() && foregroundRef.current, [isCurrentAccount]);
  const foregroundGeneration = useCallback(() => foregroundEpoch.current, []);
  const request = useCallback(async <T,>(path: string, options: LunchCafeRequestOptions = {}): Promise<T> => {
    const epoch = generation.current;
    if (!token || !isCurrentAccount()) throw lunchCafeAbort();
    const controller = new AbortController();
    requests.current.add(controller);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const value = await lunchCafeRequest<T>(path, token, { ...options, signal: controller.signal });
      if (controller.signal.aborted || epoch !== generation.current || !isCurrentAccount()) throw lunchCafeAbort();
      return value;
    } catch (cause) {
      if (epoch !== generation.current || !isCurrentAccount()) throw lunchCafeAbort();
      if (cause instanceof ApiError && cause.status === 401) await expireSession(token);
      throw cause;
    } finally {
      requests.current.delete(controller);
      options.signal?.removeEventListener('abort', abort);
    }
  }, [token, isCurrentAccount, expireSession]);
  const get = useCallback(<T,>(path: string, options: Pick<LunchCafeRequestOptions, 'signal'> = {}) => request<T>(path, { ...options, method: 'GET' }), [request]);
  // Epoch and request refs are intentionally mutated on teardown, rather than capturing obsolete values.
  useEffect(() => {
    alive.current = true;
    generation.current++;
    const epoch = generation.current;
    queueMicrotask(() => { if (alive.current && epoch === generation.current) setReady(true); });
    return () => {
      alive.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const controller of requests.current) controller.abort();
      requests.current.clear();
    };
  }, []);
  useEffect(() => {
    const change = (active: boolean) => { if (foregroundRef.current !== active) { foregroundEpoch.current++; setForegroundRevision(foregroundEpoch.current); } foregroundRef.current = active; setForeground(active); };
    const state = AppState.addEventListener('change', value => change(value === 'active'));
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => change(false)) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => change(AppState.currentState === 'active')) : null;
    return () => { state.remove(); blur?.remove(); focus?.remove(); };
  }, []);
  return <LunchCafeContext.Provider value={{ foreground: foreground && ready, foregroundRevision, isForeground, foregroundGeneration, isCurrentAccount, get, request }}>{children}</LunchCafeContext.Provider>;
}
