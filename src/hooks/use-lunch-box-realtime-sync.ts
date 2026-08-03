"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createLunchBoxRealtimeSyncCoordinator,
  requestLunchBoxRealtimeSync,
  type LunchBoxRealtimeSyncCoordinator,
} from "@/lib/lunch-box-realtime-sync";

export type LunchBoxRealtimeConnectionStatus =
  | "connected"
  | "connecting"
  | "offline"
  | "paused"
  | "reconnecting";

type LunchBoxRealtimeLoadResult<T> =
  | { data: T; ok: true }
  | { ok: false };

type UseLunchBoxRealtimeSyncOptions<T> = {
  apply: (data: T) => void;
  load: () => Promise<LunchBoxRealtimeLoadResult<T>>;
  scopeKey: string;
  streamUrl: string;
};

const realtimeChangeDebounceMs = 75;
const realtimeFallbackSyncIntervalMs = 5_000;
const realtimeSyncRetryMs = 3_000;

const realtimeStatusLabels: Record<
  LunchBoxRealtimeConnectionStatus,
  string
> = {
  connected: "실시간 연결됨",
  connecting: "실시간 연결 중",
  offline: "오프라인 · 연결 복구 대기 중",
  paused: "탭 복귀 시 실시간 동기화",
  reconnecting: "실시간 재연결 중",
};

export function useLunchBoxRealtimeSync<T>({
  apply,
  load,
  scopeKey,
  streamUrl,
}: UseLunchBoxRealtimeSyncOptions<T>) {
  const [connectionStatus, setConnectionStatus] =
    useState<LunchBoxRealtimeConnectionStatus>("connecting");
  const [syncFailed, setSyncFailed] = useState(false);
  const applyRef = useRef(apply);
  const loadRef = useRef(load);
  const isMountedRef = useRef(false);
  const activeCoordinatorRef =
    useRef<LunchBoxRealtimeSyncCoordinator | null>(null);
  const coordinator = useMemo(
    () => createLunchBoxRealtimeSyncCoordinator(scopeKey),
    [scopeKey],
  );

  useEffect(() => {
    applyRef.current = apply;
    loadRef.current = load;
  }, [apply, load]);

  useEffect(() => {
    isMountedRef.current = true;
    activeCoordinatorRef.current = coordinator;

    return () => {
      if (activeCoordinatorRef.current === coordinator) {
        activeCoordinatorRef.current = null;
      }
    };
  }, [coordinator]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const requestCanonicalSync = useCallback(async () => {
    const succeeded = await requestLunchBoxRealtimeSync({
      coordinator,
      isActive: () =>
        isMountedRef.current &&
        activeCoordinatorRef.current === coordinator,
      load: () => loadRef.current(),
      apply: (data) => {
        setSyncFailed(false);
        applyRef.current(data);
      },
      onFailure: () => {
        if (
          isMountedRef.current &&
          activeCoordinatorRef.current === coordinator
        ) {
          setSyncFailed(true);
        }
      },
    });

    if (
      succeeded &&
      isMountedRef.current &&
      activeCoordinatorRef.current === coordinator
    ) {
      setSyncFailed(false);
    }

    return succeeded;
  }, [coordinator]);

  useEffect(() => {
    if (!syncFailed) {
      return;
    }

    let disposed = false;
    let retryTimer: number | undefined;

    async function retryCanonicalSync() {
      if (
        document.visibilityState === "hidden" ||
        !navigator.onLine
      ) {
        if (!disposed) {
          retryTimer = window.setTimeout(
            retryCanonicalSync,
            realtimeSyncRetryMs,
          );
        }
        return;
      }

      const succeeded = await requestCanonicalSync();

      if (!disposed && !succeeded) {
        retryTimer = window.setTimeout(
          retryCanonicalSync,
          realtimeSyncRetryMs,
        );
      }
    }

    retryTimer = window.setTimeout(
      retryCanonicalSync,
      realtimeSyncRetryMs,
    );

    return () => {
      disposed = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [requestCanonicalSync, syncFailed]);

  useEffect(() => {
    let changeDebounceTimer: number | undefined;
    let disposed = false;
    let eventSource: EventSource | null = null;
    let isRealtimeReady = false;

    function scheduleCanonicalSync(delay = realtimeChangeDebounceMs) {
      if (changeDebounceTimer) {
        window.clearTimeout(changeDebounceTimer);
      }

      changeDebounceTimer = window.setTimeout(() => {
        changeDebounceTimer = undefined;
        void requestCanonicalSync();
      }, delay);
    }

    function closeEventSource() {
      isRealtimeReady = false;
      eventSource?.close();
      eventSource = null;
    }

    function connect() {
      if (disposed || eventSource) {
        return;
      }

      if (document.visibilityState === "hidden") {
        setConnectionStatus("paused");
        return;
      }

      if (!navigator.onLine) {
        setConnectionStatus("offline");
        return;
      }

      setConnectionStatus("connecting");

      const source = new EventSource(streamUrl);
      eventSource = source;

      source.addEventListener("ready", () => {
        if (disposed || eventSource !== source) {
          return;
        }

        isRealtimeReady = true;
        setConnectionStatus("connected");
        scheduleCanonicalSync(0);
      });
      source.addEventListener("change", () => {
        if (!disposed && eventSource === source) {
          scheduleCanonicalSync();
        }
      });
      source.addEventListener("reconnect", () => {
        if (!disposed && eventSource === source) {
          isRealtimeReady = false;
          setConnectionStatus("reconnecting");
        }
      });
      source.onerror = () => {
        if (!disposed && eventSource === source) {
          isRealtimeReady = false;
          setConnectionStatus(
            navigator.onLine ? "reconnecting" : "offline",
          );
        }
      };
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        closeEventSource();
        setConnectionStatus("paused");
        return;
      }

      connect();
      scheduleCanonicalSync(0);
    }

    function handleOnline() {
      closeEventSource();
      connect();
      scheduleCanonicalSync(0);
    }

    function handleOffline() {
      closeEventSource();
      setConnectionStatus("offline");
    }

    connect();
    const fallbackSyncTimer = window.setInterval(() => {
      if (
        !isRealtimeReady &&
        document.visibilityState !== "hidden" &&
        navigator.onLine
      ) {
        scheduleCanonicalSync(0);
      }
    }, realtimeFallbackSyncIntervalMs);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      closeEventSource();

      if (changeDebounceTimer) {
        window.clearTimeout(changeDebounceTimer);
      }

      window.clearInterval(fallbackSyncTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [requestCanonicalSync, streamUrl]);

  return {
    connectionStatus,
    statusLabel: syncFailed
      ? "실시간 동기화 복구 중"
      : realtimeStatusLabels[connectionStatus],
    syncFailed,
  };
}
