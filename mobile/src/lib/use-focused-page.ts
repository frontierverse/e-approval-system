import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "./api";
import { useSession } from "./session";

export function useFocusedPage<T>(path: string) {
  const { request, token, user } = useSession();
  const scope = JSON.stringify([token, user?.id]);
  const sequence = useRef(0);
  const inFlight = useRef<{ scope: string; path: string; id: number } | null>(null);
  const [result, setResult] = useState<{ scope: string; path: string; data: T; loadedAt: number } | null>(null);
  const [failure, setFailure] = useState<{ scope: string; path: string; message: string; status: number | null } | null>(null);
  const [pending, setPending] = useState<{ scope: string; path: string; refresh: boolean } | null>(null);
  const load = useCallback(async (refresh = false) => {
    // Synchronous guard also covers multiple taps before React renders disabled controls.
    if (inFlight.current?.scope === scope && inFlight.current.path === path) return;
    const id = ++sequence.current;
    inFlight.current = { scope, path, id };
    setPending({ scope, path, refresh }); setFailure(null);
    const isCurrent = () => id === sequence.current;
    try {
      const data = await request<T>(path);
      if (isCurrent()) setResult({ scope, path, data, loadedAt: Date.now() });
    } catch (cause) {
      if (isCurrent()) {
        const status = cause instanceof ApiError ? cause.status : null;
        // Revoked permission and expired sessions must never retain a private cached list.
        if (status === 401 || status === 403) setResult(null);
        setFailure({ scope, path, status, message: cause instanceof Error ? cause.message : "목록을 불러오지 못했습니다." });
      }
    } finally {
      if (isCurrent()) { setPending(null); inFlight.current = null; }
    }
  }, [path, request, scope]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; inFlight.current = null; }; }, [load]));
  const visibleResult = result?.scope === scope && result.path === path ? result : null;
  const visibleFailure = failure?.scope === scope && failure.path === path ? failure : null;
  const busy = pending?.scope === scope && pending.path === path;
  const data = visibleResult?.data ?? null, error = visibleFailure?.message ?? null;
  return { data, error, errorStatus: visibleFailure?.status ?? null, loadedAt: visibleResult?.loadedAt ?? null,
    refreshing: !!(busy && pending?.refresh), loading: !!busy || (!data && !error), reload: () => load(true) };
}
