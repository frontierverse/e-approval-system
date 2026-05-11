"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getNotificationTypeLabel } from "@/lib/notification-labels";
import type { AppNotification } from "@/lib/notification-types";

type NotificationSummary = {
  unreadCount: number;
  notifications: AppNotification[];
};

type NotificationBellProps = {
  initialUnreadCount: number;
  initialNotifications: AppNotification[];
};

type AudioContextRef = {
  current: AudioContext | null;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const notificationDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

export function NotificationBell({
  initialUnreadCount,
  initialNotifications,
}: NotificationBellProps) {
  const router = useRouter();
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastUnreadCountRef = useRef(initialUnreadCount);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState(initialNotifications);
  const displayUnreadCount = unreadCount > 99 ? "99+" : String(unreadCount);
  const hasUnread = unreadCount > 0;
  const buttonLabel = hasUnread
    ? `알림 ${displayUnreadCount}개`
    : "알림";

  useEffect(() => {
    function unlockNotificationSound() {
      const context = getNotificationAudioContext(audioContextRef);

      if (context?.state === "suspended") {
        void context.resume().catch(() => {});
      }
    }

    window.addEventListener("pointerdown", unlockNotificationSound);
    window.addEventListener("keydown", unlockNotificationSound);

    return () => {
      window.removeEventListener("pointerdown", unlockNotificationSound);
      window.removeEventListener("keydown", unlockNotificationSound);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function refreshNotifications() {
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as NotificationSummary;

        if (!isMounted) {
          return;
        }

        if (data.unreadCount > lastUnreadCountRef.current) {
          playNotificationSound(audioContextRef);
        }

        lastUnreadCountRef.current = data.unreadCount;
        setUnreadCount(data.unreadCount);
        setNotifications(data.notifications);
      } catch {
      }
    }

    const intervalId = window.setInterval(refreshNotifications, 15000);
    window.addEventListener("focus", refreshNotifications);
    window.addEventListener(
      "gyeoljaeon:notifications-changed",
      refreshNotifications,
    );

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener(
        "gyeoljaeon:notifications-changed",
        refreshNotifications,
      );
    };
  }, []);

  async function openNotification(notification: AppNotification) {
    setIsOpen(false);

    if (!notification.readAt) {
      setUnreadCount((current) => {
        const nextUnreadCount = Math.max(0, current - 1);

        lastUnreadCountRef.current = nextUnreadCount;

        return nextUnreadCount;
      });
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );

      await fetch(`/api/notifications/${notification.id}/read`, {
        method: "POST",
      }).catch(() => {});
      window.dispatchEvent(new Event("gyeoljaeon:notifications-changed"));
    }

    router.push(`/documents/${notification.documentId}`);
  }

  async function markAllRead() {
    if (!hasUnread) {
      return;
    }

    lastUnreadCountRef.current = 0;
    setUnreadCount(0);
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      })),
    );

    await fetch("/api/notifications/read-all", {
      method: "POST",
    }).catch(() => {});
    window.dispatchEvent(new Event("gyeoljaeon:notifications-changed"));
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => setIsOpen((current) => !current)}
        className="relative grid size-9 place-items-center rounded-full border border-[#cfd6e3] bg-white text-[#394150] transition hover:bg-[#f7f9fc]"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#b42318] px-1.5 text-[0.68rem] font-bold leading-5 text-white">
            {displayUnreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-md border border-[#d9dee7] bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-[#eef1f5] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#16181d]">알림</p>
              <p className="mt-0.5 text-xs text-[#697386]">
                안 읽음 {unreadCount}개
              </p>
            </div>
            <button
              type="button"
              disabled={!hasUnread}
              onClick={markAllRead}
              className="h-8 rounded-md border border-[#cfd6e3] bg-white px-3 text-xs font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              모두 읽음
            </button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto py-2">
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-[#f7f9fc]"
                >
                  <span className="flex items-center gap-2">
                    {!notification.readAt ? (
                      <span
                        className="size-2 rounded-full bg-[#2563eb]"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="text-xs font-semibold text-[#2563eb]">
                      {getNotificationTypeLabel(notification.type)}
                    </span>
                    <span className="ml-auto text-xs text-[#697386]">
                      {notificationDateFormatter.format(
                        new Date(notification.createdAt),
                      )}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-[#16181d]">
                    {notification.title}
                  </span>
                  <span className="line-clamp-2 text-xs leading-5 text-[#697386]">
                    {notification.message}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-4 py-8 text-center text-sm text-[#697386]">
                아직 알림이 없습니다.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              router.push("/notifications");
            }}
            className="flex h-10 w-full items-center justify-center border-t border-[#eef1f5] text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
          >
            전체 알림 보기
          </button>
        </div>
      ) : null}
    </div>
  );
}

function getNotificationAudioContext(ref: AudioContextRef) {
  if (ref.current) {
    return ref.current;
  }

  const audioWindow = window as AudioWindow;
  const AudioContextConstructor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  ref.current = new AudioContextConstructor();

  return ref.current;
}

function playNotificationSound(ref: AudioContextRef) {
  const context = getNotificationAudioContext(ref);

  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context
      .resume()
      .then(() => playNotificationChime(context))
      .catch(() => {});
    return;
  }

  if (context.state === "running") {
    playNotificationChime(context);
  }
}

function playNotificationChime(context: AudioContext) {
  const startAt = context.currentTime;
  const gain = context.createGain();

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.075, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42);
  gain.connect(context.destination);

  [
    { frequency: 880, offset: 0 },
    { frequency: 1174.66, offset: 0.16 },
  ].forEach(({ frequency, offset }) => {
    const oscillator = context.createOscillator();
    const toneStart = startAt + offset;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    oscillator.connect(gain);
    oscillator.start(toneStart);
    oscillator.stop(toneStart + 0.22);
  });
}
