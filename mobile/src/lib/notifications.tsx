import { router } from "expo-router";
import * as NativeNotifications from "expo-notifications";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { apiRequest, ApiError } from "./api";
import { getPushToken, notificationDocumentId, PushPermissionError, validNotificationDocumentId } from "./push";
import { useSession } from "./session";

type NotificationsContextValue = {
  unreadCount: number | null;
  notificationRevision: number;
  setUnreadCount: (count: number | null) => void;
  refreshUnreadCount: () => Promise<void>;
  openNotificationDocument: (documentId: string, isActive?: () => boolean) => Promise<void>;
  notificationOpenError: string | null;
  retryNotificationOpen: () => Promise<void>;
  dismissNotificationOpenError: () => void;
  pushStatus: { enabled: boolean } | null;
  pushLoading: boolean;
  pushPending: boolean;
  pushError: string | null;
  pushMessage: string | null;
  pushNeedsSettings: boolean;
  pushFailedMode: "auto" | "enable" | "disable" | null;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
  retryPushRegistration: () => Promise<void>;
  refreshPushStatus: () => Promise<void>;
  openPushSettings: () => Promise<void>;
};
const NotificationsContext = createContext<NotificationsContextValue | null>(null);
function stoppedError() { const error = new Error("알림 작업을 취소했습니다."); error.name = "AbortError"; return error; }
function checkedCount(count: unknown) {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new ApiError("알림 건수를 확인하지 못했습니다. 다시 시도하세요.", 0);
  return count;
}
export function notificationBadge(count: number | null) { return count !== null && count > 99 ? "99+" : count !== null && count > 0 ? count : undefined; }

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const currentToken = useRef(token);
  useLayoutEffect(() => { currentToken.current = token; }, [token]);
  const isCurrentToken = useCallback((expected: string | null) => currentToken.current === expected, []);
  return <AccountNotificationsProvider key={token ?? "anonymous"} token={token} isCurrentToken={isCurrentToken}>{children}</AccountNotificationsProvider>;
}
function AccountNotificationsProvider({ children, token, isCurrentToken }: { children: React.ReactNode; token: string | null; isCurrentToken: (expected: string | null) => boolean }) {
  const { expireSession } = useSession();
  const alive = useRef(true);
  const scopeGeneration = useRef(0);
  const current = useCallback(() => alive.current && isCurrentToken(token), [isCurrentToken, token]);
  const check = useCallback(() => { if (!current()) throw stoppedError(); }, [current]);
  const authenticated = useCallback(async <T,>(path: string, options: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}): Promise<T> => {
    const started = scopeGeneration.current;
    const checkOperation = () => { check(); if (started !== scopeGeneration.current) throw stoppedError(); };
    checkOperation();
    if (!token) throw new ApiError("로그인이 필요합니다.", 401);
    try {
      const result = await apiRequest<T>(path, { ...options, token });
      checkOperation(); return result;
    } catch (error) {
      checkOperation();
      if (error instanceof ApiError && error.status === 401) await expireSession(token);
      throw error;
    }
  }, [check, token, expireSession]);
  const [unreadCount, updateUnreadCount] = useState<number | null>(null);
  const [notificationRevision, updateRevision] = useState(0);
  const countRevision = useRef(0);
  const countPending = useRef<Promise<void> | null>(null);
  const countQueued = useRef(false);
  const setUnreadCount = useCallback((count: number | null) => {
    if (!current() || (count !== null && (!Number.isSafeInteger(count) || count < 0))) return;
    countRevision.current++; updateUnreadCount(count);
  }, [current]);
  const refreshUnreadCount = useCallback(function refresh(): Promise<void> {
    if (!token || !current()) return Promise.resolve();
    if (countPending.current) { countQueued.current = true; return countPending.current; }
    const version = countRevision.current;
    const started = scopeGeneration.current;
    const operation = authenticated<{ unreadCount: number }>("/notifications?page=1").then(result => {
      if (current() && started === scopeGeneration.current && version === countRevision.current) setUnreadCount(checkedCount(result.unreadCount));
    }).finally(() => {
      if (countPending.current !== operation) return;
      countPending.current = null;
      if (countQueued.current && current()) { countQueued.current = false; void refresh().catch(() => undefined); }
    });
    countPending.current = operation;
    return operation;
  }, [authenticated, current, setUnreadCount, token]);
  const invalidate = useCallback(() => {
    if (!current()) return;
    updateRevision(value => value + 1);
    void refreshUnreadCount().catch(() => undefined);
  }, [current, refreshUnreadCount]);
  const [notificationOpenError, setNotificationOpenError] = useState<string | null>(null);
  const retryDocument = useRef<string | null>(null);
  const openSequence = useRef(0);
  const opening = useRef(new Map<string, Promise<void>>());
  const openNotificationDocument = useCallback((documentId: string, isActive?: () => boolean): Promise<void> => {
    if (!validNotificationDocumentId(documentId)) return Promise.reject(new ApiError("알림의 문서 정보를 확인하지 못했습니다.", 400));
    if (!current() || (isActive && !isActive())) return Promise.reject(stoppedError());
    const pending = opening.current.get(documentId);
    if (pending) return pending;
    const sequence = ++openSequence.current;
    const started = scopeGeneration.current;
    const operation = authenticated<{ ok: boolean; unreadCount: number }>("/notifications/read-document", { method: "POST", body: { documentId } }).then(result => {
      check();
      if (started !== scopeGeneration.current) throw stoppedError();
      // A list can lose focus while its read request settles. The server may have
      // read the alerts, but that response must not navigate away from the new screen.
      if (isActive && !isActive()) { invalidate(); throw stoppedError(); }
      if (result.ok !== true) throw new ApiError("알림 문서를 열지 못했습니다. 다시 시도하세요.", 0);
      const count = checkedCount(result.unreadCount);
      if (sequence === openSequence.current) {
        setUnreadCount(count); setNotificationOpenError(null); retryDocument.current = null;
        router.push("/documents/" + documentId);
      }
      invalidate();
    }).finally(() => { if (opening.current.get(documentId) === operation) opening.current.delete(documentId); });
    opening.current.set(documentId, operation);
    return operation;
  }, [authenticated, check, current, invalidate, setUnreadCount]);
  const handlePushDocument = useCallback(async (documentId: string) => {
    let attempt = openSequence.current;
    try {
      if (current()) setNotificationOpenError(null);
      const pending = openNotificationDocument(documentId); attempt = openSequence.current; await pending;
    } catch (error) {
      if (attempt !== openSequence.current || !current() || (error instanceof Error && error.name === "AbortError")) return;
      retryDocument.current = documentId;
      setNotificationOpenError(error instanceof Error ? error.message : "알림 문서를 열지 못했습니다. 다시 시도하세요.");
    }
  }, [current, openNotificationDocument]);
  const retryNotificationOpen = useCallback(async () => { const id = retryDocument.current; if (id && current()) await handlePushDocument(id); }, [current, handlePushDocument]);
  const dismissNotificationOpenError = useCallback(() => { openSequence.current++; retryDocument.current = null; setNotificationOpenError(null); }, []);

  const [pushStatus, setPushStatus] = useState<{ enabled: boolean } | null>(null);
  const status = useRef<{ enabled: boolean } | null>(null);
  const [pushPending, setPushPending] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushNeedsSettings, setPushNeedsSettings] = useState(false);
  const needsSettings = useRef(false);
  const pushOperation = useRef<Promise<void> | null>(null);
  const failedPushMode = useRef<"auto" | "enable" | "disable" | null>(null);
  const queuedDeviceToken = useRef<NativeNotifications.DevicePushToken | null>(null);
  const registeredToken = useRef<string | null>(null);
  const lastDeviceToken = useRef<string | null>(null);
  const setStatus = useCallback((enabled: boolean) => { status.current = { enabled }; setPushStatus({ enabled }); }, []);
  const syncPush = useCallback(function sync(mode: "auto" | "enable" | "disable", devicePushToken?: NativeNotifications.DevicePushToken): Promise<void> {
    if (!token || !current() || Platform.OS === "web") return Promise.resolve();
    if (pushOperation.current) {
      if (devicePushToken) queuedDeviceToken.current = devicePushToken;
      return pushOperation.current;
    }
    const started = scopeGeneration.current;
    const operationCurrent = () => current() && started === scopeGeneration.current;
    setPushPending(true);
    if (mode !== "auto") { setPushError(null); setPushMessage(null); }
    const operation = (async () => {
      try {
        if (mode === "disable") {
          const result = await authenticated<{ enabled: boolean }>("/push-subscription", { method: "DELETE" });
          if (!operationCurrent()) throw stoppedError();
          if (result.enabled !== false) throw new ApiError("알림 설정을 확인하지 못했습니다.", 0);
          setStatus(false); registeredToken.current = null;
          needsSettings.current = false; setPushNeedsSettings(false); setPushError(null);
          failedPushMode.current = null; setPushMessage("이 기기의 결재 알림을 껐습니다."); return;
        }
        if (mode === "auto") {
          const result = await authenticated<{ enabled: boolean }>("/push-subscription");
          if (!operationCurrent()) throw stoppedError();
          if (typeof result.enabled !== "boolean") throw new ApiError("알림 설정을 확인하지 못했습니다.", 0);
          setStatus(result.enabled);
          if (!result.enabled) {
            registeredToken.current = null;
            if (failedPushMode.current !== "enable") {
              failedPushMode.current = null; needsSettings.current = false; setPushNeedsSettings(false); setPushError(null);
            }
            return;
          }
          // A failed OFF action retains the user's intent until an explicit retry succeeds.
          if (failedPushMode.current === "disable") return;
        }
        const expoPushToken = await getPushToken(mode === "enable", devicePushToken, operationCurrent);
        if (!operationCurrent()) throw stoppedError();
        if (!expoPushToken) throw new PushPermissionError();
        if (mode !== "auto" || expoPushToken !== registeredToken.current) {
          const result = await authenticated<{ enabled: boolean }>("/push-subscription", { method: "POST", body: { expoPushToken } });
          if (!operationCurrent()) throw stoppedError();
          if (result.enabled !== true) throw new ApiError("알림 등록 결과를 확인하지 못했습니다.", 0);
        }
        setStatus(true); registeredToken.current = expoPushToken; failedPushMode.current = null;
        needsSettings.current = false; setPushNeedsSettings(false); setPushError(null);
        if (mode === "enable") setPushMessage("이 기기에서 결재 알림을 받습니다.");
      } catch (error) {
        if (!operationCurrent() || (error instanceof Error && error.name === "AbortError")) return;
        failedPushMode.current = mode;
        if (error instanceof PushPermissionError) { needsSettings.current = true; setPushNeedsSettings(true); }
        setPushError(error instanceof Error ? error.message : "알림을 등록하지 못했습니다. 다시 시도하세요.");
      } finally {
        if (operationCurrent()) {
          pushOperation.current = null;
          setPushPending(false);
          const queued = queuedDeviceToken.current; queuedDeviceToken.current = null;
          if (queued) void sync("auto", queued);
        }
      }
    })();
    pushOperation.current = operation;
    return operation;
  }, [authenticated, current, setStatus, token]);
  const enablePush = useCallback(() => syncPush("enable"), [syncPush]);
  const disablePush = useCallback(() => syncPush("disable"), [syncPush]);
  const retryPushRegistration = useCallback(() => syncPush(failedPushMode.current ?? "auto"), [syncPush]);
  const refreshPushStatus = useCallback(() => syncPush("auto"), [syncPush]);
  const openPushSettings = useCallback(async () => {
    if (!current() || Platform.OS === "web") return;
    try { await Linking.openSettings(); }
    catch { if (current()) setPushError("기기 설정을 열지 못했습니다. 설정 앱에서 바자울 알림을 허용하세요."); }
  }, [current]);

  useEffect(() => {
    alive.current = true;
    const started = scopeGeneration.current;
    const effectCurrent = () => current() && started === scopeGeneration.current;
    const stop = () => {
      alive.current = false; scopeGeneration.current++; openSequence.current++;
      countPending.current = null; countQueued.current = false; pushOperation.current = null; queuedDeviceToken.current = null; opening.current.clear();
    };
    if (!token) return stop;
    void refreshUnreadCount().catch(() => undefined);
    void refreshPushStatus();
    let lastState = AppState.currentState;
    const app = AppState.addEventListener("change", next => {
      const foreground = next === "active" && lastState !== "active"; lastState = next;
      if (foreground && effectCurrent()) { invalidate(); void refreshPushStatus(); }
    });
    if (Platform.OS === "web") return () => { stop(); app.remove(); };
    const received = NativeNotifications.addNotificationReceivedListener(() => { if (effectCurrent()) invalidate(); });
    const handled = new Set<string>();
    const open = (response: NativeNotifications.NotificationResponse | null) => {
      if (!effectCurrent() || !response) return;
      const documentId = notificationDocumentId(response);
      if (!documentId) return;
      const key = response.notification.request.identifier + ":" + response.actionIdentifier;
      if (handled.has(key)) return;
      handled.add(key);
      try { NativeNotifications.clearLastNotificationResponse(); } catch { /* Native response delivery can still proceed. */ }
      void handlePushDocument(documentId);
    };
    const response = NativeNotifications.addNotificationResponseReceivedListener(open);
    void NativeNotifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const rollover = NativeNotifications.addPushTokenListener(deviceToken => {
      if (!effectCurrent()) return;
      const identity = deviceToken.type + ":" + deviceToken.data;
      if (identity === lastDeviceToken.current) return;
      lastDeviceToken.current = identity;
      if (status.current?.enabled || pushOperation.current) void syncPush("auto", deviceToken);
    });
    return () => {
      stop();
      app.remove(); received.remove(); response.remove(); rollover.remove();
      // A cached response belongs to the departing account; never consume it after switching accounts.
      try { NativeNotifications.clearLastNotificationResponse(); } catch { /* Unavailable on some runtimes. */ }
    };
  }, [current, handlePushDocument, invalidate, refreshPushStatus, refreshUnreadCount, syncPush, token]);
  const pushFailedMode = failedPushMode.current;
  const value = useMemo<NotificationsContextValue>(() => ({
    unreadCount, notificationRevision, setUnreadCount, refreshUnreadCount, openNotificationDocument,
    notificationOpenError, retryNotificationOpen, dismissNotificationOpenError,
    pushStatus, pushLoading: Platform.OS !== "web" && !!token && !pushStatus && pushPending, pushPending, pushError, pushMessage, pushNeedsSettings, pushFailedMode,
    enablePush, disablePush, retryPushRegistration, refreshPushStatus, openPushSettings,
  }), [unreadCount, notificationRevision, setUnreadCount, refreshUnreadCount, openNotificationDocument, notificationOpenError, retryNotificationOpen, dismissNotificationOpenError,
    pushStatus, pushPending, pushError, pushMessage, pushNeedsSettings, pushFailedMode, enablePush, disablePush, retryPushRegistration, refreshPushStatus, openPushSettings, token]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("NotificationsProvider가 필요합니다.");
  return value;
}
