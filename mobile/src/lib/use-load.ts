import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useSession } from "./session";

export function useLoad<T>(path: string) {
  const { request } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try { setData(await request<T>(path)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "목록을 불러오지 못했습니다."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [path, request]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return { data, loading, refreshing, error, reload: () => load(true), setData };
}
