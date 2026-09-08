"use client";

import { useEffect, useRef, useState } from "react";

export type StaffChatSyncStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "offline"
  | "paused"
  | "expired";

const statusLabels: Record<StaffChatSyncStatus, string> = {
  connected: "실시간 연결됨",
  connecting: "실시간 연결 중",
  reconnecting: "재연결 중 · 5초마다 새 메시지 확인",
  offline: "오프라인 · 연결을 확인해 주세요",
  paused: "탭으로 돌아오면 새 메시지 확인",
  expired: "로그인이 필요합니다",
};

/** Keep mounted with the dock closed so the unread badge continues to update. */
export function useStaffChatSync({
  userId,
  refresh,
}: {
  userId: string;
  refresh: () => Promise<void>;
}) {
  const refreshRef = useRef(refresh);
  const [status, setStatus] = useState<StaffChatSyncStatus>("connecting");

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let expired = false;
    let realtimeReady = false;
    let dirty = false;
    let refreshing = false;
    let syncFailed = false;
    let lastRefreshAt = 0;
    let source: EventSource | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function active() {
      return !disposed && !expired && navigator.onLine && document.visibilityState !== "hidden";
    }

    async function synchronize() {
      if (!active()) return;
      dirty = true;
      if (refreshing) return;
      refreshing = true;
      try {
        while (dirty && active()) {
          dirty = false;
          try {
            await refreshRef.current();
            lastRefreshAt = Date.now();
            syncFailed = false;
            if (active() && realtimeReady) setStatus("connected");
          } catch {
            syncFailed = true;
            if (active()) setStatus("reconnecting");
          }
        }
      } finally {
        refreshing = false;
      }
    }

    function scheduleSync(delay = 75) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void synchronize(), delay);
    }

    function disconnect() {
      realtimeReady = false;
      source?.close();
      source = undefined;
      clearTimeout(reconnectTimer);
    }

    function reconnect() {
      disconnect();
      if (!active()) return;
      setStatus("reconnecting");
      scheduleSync(0);
      reconnectTimer = setTimeout(connect, 3_000);
    }

    function connect() {
      if (!active() || source) return;
      if (typeof EventSource === "undefined") {
        setStatus("reconnecting");
        return;
      }

      const current = new EventSource("/api/chat/stream");
      source = current;
      current.addEventListener("ready", () => {
        if (source !== current || !active()) return;
        realtimeReady = true;
        // The socket alone is insufficient: first recover messages missed offline.
        scheduleSync(0);
      });
      current.addEventListener("change", () => {
        if (source === current && active()) scheduleSync();
      });
      current.addEventListener("reconnect", () => {
        if (source === current && !disposed) reconnect();
      });
      current.addEventListener("auth-expired", () => {
        if (source !== current || disposed) return;
        expired = true;
        disconnect();
        setStatus("expired");
        // The owner can clear private message state when its HTTP request returns 401.
        void refreshRef.current().catch(() => undefined);
      });
      current.onerror = () => {
        if (source === current && !disposed) reconnect();
      };
    }

    function resume() {
      disconnect();
      if (expired || disposed) return;
      if (!navigator.onLine) {
        setStatus("offline");
      } else if (document.visibilityState === "hidden") {
        setStatus("paused");
      } else {
        setStatus("connecting");
        connect();
        scheduleSync(0);
      }
    }

    resume();
    const fallbackTimer = setInterval(() => {
      // Even a healthy socket needs occasional reconciliation after a publish failure.
      if (active() && (!realtimeReady || syncFailed || Date.now() - lastRefreshAt >= 30_000)) {
        scheduleSync(0);
      }
    }, 5_000);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);

    return () => {
      disposed = true;
      disconnect();
      clearTimeout(debounceTimer);
      clearInterval(fallbackTimer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [userId]);

  return { status, statusLabel: statusLabels[status] };
}
