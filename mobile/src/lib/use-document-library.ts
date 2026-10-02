import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useSession } from "./session";
import type { DocumentLibraryPage } from "./document-library";

export function useDocumentLibrary(path: string) {
  const { request } = useSession();
  const sequence = useRef(0);
  const [result, setResult] = useState<{ path: string; data: DocumentLibraryPage } | null>(null);
  const [failure, setFailure] = useState<{ path: string; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (refresh = false) => {
    const id = ++sequence.current;
    setPending(true); setRefreshing(refresh); setFailure(null);
    try {
      const data = await request<DocumentLibraryPage>(path);
      if (id === sequence.current) setResult({ path, data });
    } catch (cause) {
      if (id === sequence.current) setFailure({ path, message: cause instanceof Error ? cause.message : "문서함을 불러오지 못했습니다." });
    } finally {
      if (id === sequence.current) { setPending(false); setRefreshing(false); }
    }
  }, [path, request]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const data = result?.path === path ? result.data : null;
  const error = failure?.path === path ? failure.message : null;
  return { data, error, refreshing, loading: pending || (!data && !error), reload: () => load(true) };
}
