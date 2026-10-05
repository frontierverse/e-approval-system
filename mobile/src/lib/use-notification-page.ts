import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { useNotifications } from "./notifications";
import { useSession } from "./session";
import type { MobileNotification, NotificationsResponse } from "./types";

export type NotificationOperation = { kind: "all" } | { kind: "read" | "open"; item: MobileNotification };
type Failure = { scope: string; message: string; status: number | null; operation?: NotificationOperation };
type ReadResult = { ok: boolean; unreadCount: number; updatedCount: number };
const countValid = (n: number) => Number.isSafeInteger(n) && n >= 0;

export function useNotificationPage(filter: "all" | "unread", page: number) {
  const { request, token, user } = useSession();
  const { setUnreadCount, openNotificationDocument, notificationRevision } = useNotifications();
  const path = `/notifications?filter=${filter}&page=${page}`;
  const scope = JSON.stringify([token, user?.id, path]);
  const currentScope = useRef(scope), sequence = useRef(0), focused = useRef(false), mounted = useRef(true);
  const focusGeneration = useRef(0), queuedReload = useRef(false);
  const inFlight = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const mutation = useRef<{ scope: string } | null>(null);
  const [result, setResult] = useState<{ scope: string; data: NotificationsResponse; loadedAt: number } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState<{ scope: string; refresh: boolean } | null>(null);
  const [operation, setOperation] = useState<{ scope: string; value: NotificationOperation } | null>(null);
  const [notice, setNotice] = useState<{ scope: string; text: string } | null>(null);
  const latestLoad = useRef<(refresh?: boolean) => Promise<void>>(async () => undefined);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback((refresh = false): Promise<void> => {
    if (!focused.current) return Promise.resolve();
    if (mutation.current) { queuedReload.current = true; return Promise.resolve(); }
    queuedReload.current = false;
    if (inFlight.current?.scope === scope) return inFlight.current.promise;
    const id = ++sequence.current;
    const isCurrent = () => mounted.current && focused.current && currentScope.current === scope && id === sequence.current;
    setPending({ scope, refresh });
    setFailure(previous => previous?.scope === scope && previous.operation ? previous : null);
    setNotice(previous => previous?.scope === scope ? previous : null);
    const promise = (async () => {
      try {
        const data = await request<NotificationsResponse>(path);
        if (!isCurrent()) return;
        if (!countValid(data.unreadCount) || !countValid(data.total) || data.pageSize !== 20 || !Number.isSafeInteger(data.page) || data.page < 1 || !Number.isSafeInteger(data.totalPages) || data.totalPages < data.page || !Array.isArray(data.notifications)) {
          throw new ApiError("알림 조회 결과를 확인하지 못했어요. 다시 시도해 주세요.", 0);
        }
        setResult({ scope, data, loadedAt: Date.now() });
        setUnreadCount(data.unreadCount);
      } catch (cause) {
        if (!isCurrent()) return;
        const status = cause instanceof ApiError ? cause.status : null;
        if (status === 401 || status === 403) { setResult(null); setNotice(null); setUnreadCount(null); }
        setFailure({ scope, status, message: cause instanceof Error ? cause.message : "알림을 불러오지 못했어요." });
      } finally {
        if (isCurrent()) { setPending(null); inFlight.current = null; }
      }
    })();
    inFlight.current = { scope, promise };
    return promise;
  }, [path, request, scope, setUnreadCount]);
  useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true; void load();
    return () => { focused.current = false; focusGeneration.current++; sequence.current++; inFlight.current = null; };
  // A push or foreground event refreshes the focused page even when its URL is unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, notificationRevision]));

  const run = useCallback(async (next: NotificationOperation) => {
    if (mutation.current || !focused.current || currentScope.current !== scope) return;
    const lock = { scope };
    const generation = focusGeneration.current;
    mutation.current = lock; sequence.current++; inFlight.current = null;
    setOperation({ scope, value: next }); setPending(null); setFailure(null); setNotice(null);
    const isCurrent = () => mounted.current && focused.current && focusGeneration.current === generation && currentScope.current === scope && mutation.current === lock;
    let reloadAfter = false;
    try {
      if (next.kind === "open") {
        await openNotificationDocument(next.item.documentId, isCurrent);
        reloadAfter = true;
      } else {
        const response = await request<ReadResult>(next.kind === "all" ? "/notifications/read-all" : `/notifications/${encodeURIComponent(next.item.id)}/read`, { method: "POST" });
        if (!isCurrent()) return;
        if (response.ok !== true || !countValid(response.unreadCount) || !countValid(response.updatedCount)) throw new ApiError("읽음 처리 결과를 확인하지 못했어요. 다시 시도해 주세요.", 0);
        setUnreadCount(response.unreadCount);
        const readAt = new Date().toISOString();
        setResult(previous => {
          if (previous?.scope !== scope) return previous;
          const old = previous.data, matches = (item: MobileNotification) => next.kind === "all" || item.id === next.item.id;
          const notifications = filter === "unread" ? old.notifications.filter(item => !matches(item)) : old.notifications.map(item => matches(item) && !item.readAt ? { ...item, readAt } : item);
          const total = filter === "unread" ? response.unreadCount : old.total;
          const totalPages = Math.max(1, Math.ceil(total / 20));
          return { scope, loadedAt: previous.loadedAt, data: { ...old, notifications, total, totalPages, page: Math.min(old.page, totalPages), unreadCount: response.unreadCount } };
        });
        setNotice({ scope, text: next.kind === "all" ? "전체 알림을 읽음으로 표시했어요." : "알림을 읽음으로 표시했어요." });
        reloadAfter = true;
      }
    } catch (cause) {
      if (!isCurrent() || (cause instanceof Error && cause.name === "AbortError")) return;
      const status = cause instanceof ApiError ? cause.status : null;
      // Never retain document text after an access failure. Re-query readable
      // rows after a 404 instead of treating an old snapshot as still authorized.
      if (status === 401 || status === 403 || status === 404) { setResult(null); setNotice(null); setUnreadCount(null); }
      setFailure({ scope, status, operation: next, message: cause instanceof Error ? cause.message : "알림 처리 결과를 확인하지 못했어요." });
      reloadAfter = status === 404;
    } finally {
      mutation.current = null;
      if (mounted.current) setOperation(null);
      // Resume a focus/revision refresh blocked by a mutation, including when
      // its response belongs to an old filter. The latest callback owns the scope.
      if (mounted.current && focused.current && (reloadAfter || queuedReload.current || currentScope.current !== scope)) void latestLoad.current(true);
    }
  }, [filter, openNotificationDocument, request, scope, setUnreadCount]);

  const visible = result?.scope === scope ? result : null;
  const error = failure?.scope === scope ? failure : null;
  const loading = pending?.scope === scope || (!visible && !error);
  return { path, data: visible?.data ?? null, loadedAt: visible?.loadedAt ?? null, loading,
    refreshing: pending?.scope === scope && pending.refresh, busy: operation !== null,
    operation: operation?.scope === scope ? operation.value : null, error,
    message: notice?.scope === scope ? notice.text : null, run, reload: () => load(true),
    dismissError: () => setFailure(null),
    retry: () => error?.operation ? run(error.operation) : load(true) };
}
