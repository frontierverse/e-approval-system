/* Verified identities are synchronous refs so a changed filter/account cannot publish an old snapshot for one paint. */
/* eslint-disable react-hooks/refs */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError } from '@/lib/api';
import { useLunchCafe } from '@/providers/LunchCafeProvider';
/** Each focus and foreground return verifies the entire current account/query snapshot. */
export function useLunchCafeRead<T>(path: string | null, guard: (value: unknown) => value is T) {
  const { get, foreground, foregroundRevision, isForeground, foregroundGeneration, isCurrentAccount } = useLunchCafe();
  const [data, setData] = useState<T | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [verified, setVerified] = useState(false), [denied, setDenied] = useState(false);
  const accepted = useRef<{ path: string; foreground: number } | null>(null);
  const focused = useRef(false), valid = useRef(false), locked = useRef(false), generation = useRef(0), controller = useRef<AbortController | null>(null), guardRef = useRef(guard), scope = useRef(path);
  useLayoutEffect(() => { guardRef.current = guard; scope.current = path; }, [guard, path]);
  const active = useCallback(() => focused.current && scope.current === path && isCurrentAccount() && isForeground(), [path, isCurrentAccount, isForeground]);
  const current = useCallback(() => focused.current && valid.current && !locked.current && accepted.current?.path === path && scope.current === path && accepted.current.foreground === foregroundGeneration() && isCurrentAccount() && isForeground(), [path, foregroundGeneration, isCurrentAccount, isForeground]);
  const load = useCallback(async (fresh = false) => {
    const requestPath = path;
    if (!requestPath || !focused.current || !isCurrentAccount() || !isForeground()) return;
    controller.current?.abort();
    const next = new AbortController(), epoch = ++generation.current;
    const foregroundAtStart = foregroundGeneration();
    controller.current = next; locked.current = true;
    if (fresh) { valid.current = false; setVerified(false); }
    setLoading(true); setError(null); setDenied(false);
    try {
      const value: unknown = await get(requestPath, { signal: next.signal });
      if (next.signal.aborted || generation.current !== epoch || scope.current !== requestPath || foregroundAtStart !== foregroundGeneration() || !focused.current || !isCurrentAccount() || !isForeground()) return;
      if (!guardRef.current(value)) throw new ApiError('조회 결과를 확인하지 못했습니다. 다시 조회하세요.', 200);
      accepted.current = { path: requestPath, foreground: foregroundAtStart };
      valid.current = true; setVerified(true); setData(value);
      return value;
    } catch (cause) {
      if (next.signal.aborted || generation.current !== epoch || scope.current !== requestPath || foregroundAtStart !== foregroundGeneration() || !focused.current || !isCurrentAccount() || !isForeground()) return;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { valid.current = false; setVerified(false); setData(null); setDenied(true); }
      setError(cause instanceof Error ? cause.message : '조회하지 못했습니다. 다시 시도하세요.');
    } finally {
      if (generation.current === epoch) { locked.current = false; setLoading(false); }
    }
  }, [path, get, foregroundGeneration, isCurrentAccount, isForeground]);
  useFocusEffect(useCallback(() => {
    // A numeric revision forces fresh verification even when blur/focus was batched to the same boolean.
    void foregroundRevision;
    focused.current = true; valid.current = false; setVerified(false);
    if (!path) { setData(null); setLoading(false); setError('조회 조건을 확인하세요.'); }
    else if (foreground) void load(true);
    return () => { focused.current = false; valid.current = false; locked.current = false; generation.current++; controller.current?.abort(); };
  }, [path, foreground, foregroundRevision, load]));
  const visible = focused.current && valid.current && foreground && verified && accepted.current?.path === path && accepted.current.foreground === foregroundGeneration() && isCurrentAccount() ? data : null;
  const invalidate = () => { valid.current = false; accepted.current = null; setVerified(false); setData(null); };
  return { active, invalidate, denied, data: visible, cached: data, loading, error, verified, current, load, refresh: () => load(false), setData, focused, locked };
}
