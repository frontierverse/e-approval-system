import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "./api";
import { useSession } from "./session";
import type { MobileDocument } from "./types";

/** Keep readable data after a connection failure, but erase it when access is revoked. */
export function useDocumentDetail(id: string) {
  const { request } = useSession();
  const sequence = useRef(0);
  const [document, setDocument] = useState<MobileDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true);
    try {
      const result = await request<{ document: MobileDocument }>(`/documents/${id}`);
      if (version !== sequence.current) return null;
      setDocument(result.document); setError(null); setUnavailable(false);
      return result.document;
    } catch (cause) {
      if (version !== sequence.current) return null;
      const denied = cause instanceof ApiError && [401, 403, 404, 410].includes(cause.status);
      if (denied) setDocument(null);
      setUnavailable(denied);
      setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다.");
      return null;
    } finally { if (version === sequence.current) setLoading(false); }
  }, [id, request]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  return { document, error, unavailable, loading, reload: load };
}
