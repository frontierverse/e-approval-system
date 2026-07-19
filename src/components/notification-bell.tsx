"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AppModal } from "@/components/app-modal";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastUnreadCountRef = useRef(initialUnreadCount);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [dismissedModalIds, setDismissedModalIds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const notificationPanelId = useId();
  const approvalModalTitleId = useId();
  const approvalModalDescriptionId = useId();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const modalNotification = notifications.find(
    (n) =>
      !n.readAt &&
      (n.type === "APPROVAL_APPROVED" ||
        n.type === "APPROVAL_REJECTED" ||
        n.type === "APPROVAL_COMPLETED") &&
      n.latestComment &&
      !dismissedModalIds.has(n.id)
  ) || null;
  const displayUnreadCount = unreadCount > 99 ? "99+" : String(unreadCount);
  const hasUnread = unreadCount > 0;
  const buttonLabel = hasUnread
    ? `알림 ${displayUnreadCount}개`
    : "알림";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleOutsideClick(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeFromEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setIsOpen(false);
      window.requestAnimationFrame(() => notificationButtonRef.current?.focus());
    }

    document.addEventListener("keydown", closeFromEscape);
    return () => document.removeEventListener("keydown", closeFromEscape);
  }, [isOpen]);

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

  async function handleCloseModal(nId: string) {
    setDismissedModalIds((prev) => {
      const next = new Set(prev);
      next.add(nId);
      return next;
    });

    setUnreadCount((current) => Math.max(0, current - 1));
    setNotifications((current) =>
      current.map((item) =>
        item.id === nId
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );

    await fetch(`/api/notifications/${nId}/read`, {
      method: "POST",
    }).catch(() => {});
    window.dispatchEvent(new Event("gyeoljaeon:notifications-changed"));
  }

  async function handleGoToApproval(n: AppNotification) {
    await handleCloseModal(n.id);
    router.push(`/documents/${n.documentId}`);
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
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        aria-controls={notificationPanelId}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={buttonLabel}
        ref={notificationButtonRef}
        title={buttonLabel}
        onClick={() => setIsOpen((current) => !current)}
        className="relative grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
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
        <div
          id={notificationPanelId}
          aria-label="알림 목록"
          className="absolute right-0 top-12 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
          role="region"
        >
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
                      <>
                        <span
                          className="size-2 rounded-full bg-[#2563eb]"
                          aria-hidden="true"
                        />
                        <span className="sr-only">읽지 않음</span>
                      </>
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

      {mounted && modalNotification ? (
        <AppModal
          className="max-w-lg"
          describedBy={approvalModalDescriptionId}
          labelledBy={approvalModalTitleId}
          onClose={() => handleCloseModal(modalNotification.id)}
        >
          <div className="relative p-6">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#eef1f5] pb-4">
              <div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  modalNotification.type === "APPROVAL_REJECTED"
                    ? "bg-[#fff1f1] text-[#8a1f1f] border-[#f0c6c6]"
                    : "bg-[#e8f5ed] text-[#22633a] border-[#bddfc9]"
                }`}>
                  {modalNotification.type === "APPROVAL_REJECTED" ? "반려됨" : "승인됨"}
                </span>
                <h2
                  id={approvalModalTitleId}
                  className="mt-2 text-lg font-bold text-[#16181d]"
                >
                  결재 의견 알림
                </h2>
              </div>
              <button
                type="button"
                aria-label="결재 의견 알림 닫기"
                onClick={() => handleCloseModal(modalNotification.id)}
                className="rounded-lg p-1 text-[#697386] transition hover:bg-[#f7f9fc] hover:text-[#16181d]"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div
              id={approvalModalDescriptionId}
              className="mt-4 space-y-4"
            >
              {/* Document Metadata */}
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#f7f9fc] p-3 text-xs text-[#697386]">
                <div>
                  <span className="font-semibold text-[#394150]">일련번호</span>
                  <p className="mt-0.5 font-mono text-[#16181d]">{modalNotification.documentNo || "-"}</p>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold text-[#394150]">결재 제목</span>
                  <p className="mt-0.5 truncate text-[#16181d]">{modalNotification.documentTitle}</p>
                </div>
              </div>

              {/* Document body snippet */}
              {modalNotification.documentContent && (
                <div>
                  <h4 className="text-xs font-semibold text-[#697386]">기안 내용</h4>
                  <div className="mt-1 max-h-24 overflow-y-auto rounded-lg border border-[#eef1f5] bg-[#fbfcfd] p-2.5 text-xs text-[#394150] whitespace-pre-wrap leading-relaxed">
                    {modalNotification.documentContent}
                  </div>
                </div>
              )}

              {/* Approver Comment */}
              <div className={`rounded-xl border p-4 ${
                modalNotification.type === "APPROVAL_REJECTED"
                  ? "border-[#f0c6c6] bg-[#fff1f1]"
                  : "border-[#b9c9ea] bg-[#eaf0fb]"
              }`}>
                <h4 className={`text-xs font-bold ${
                  modalNotification.type === "APPROVAL_REJECTED" ? "text-[#8a1f1f]" : "text-[#274f9f]"
                }`}>
                  {modalNotification.latestApproverName || "결재자"}님의 의견
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed text-[#16181d] font-medium whitespace-pre-wrap">
                  {modalNotification.latestComment}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2 border-t border-[#eef1f5] pt-4">
              <button
                type="button"
                onClick={() => handleCloseModal(modalNotification.id)}
                className="h-10 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => handleGoToApproval(modalNotification)}
                className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#143f3e]"
              >
                해당 결재로 이동
              </button>
            </div>
          </div>
        </AppModal>
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
