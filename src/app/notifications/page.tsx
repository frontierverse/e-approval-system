import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import { getNotificationTypeLabel } from "@/lib/notification-labels";
import { getNotifications } from "@/lib/notifications";
import { RouteContentSkeleton } from "@/components/route-loading-shell";

export const metadata: Metadata = {
  title: "알림",
};

const notificationDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export default function NotificationsPage() {
  return (
    <>
      <PageTitle
        title="알림"
        description="결재 요청, 승인, 반려, 완료 알림을 확인합니다."
      />

      <Suspense fallback={<RouteContentSkeleton variant="notifications" />}>
        <NotificationsContent />
      </Suspense>
    </>
  );
}

async function NotificationsContent() {
  const user = await requireUser();
  const notifications = await getNotifications(user.id, 50);

  return (
      <section className="rounded-md border border-[#d9dee7] bg-white">
        {notifications.length > 0 ? (
          <ol className="divide-y divide-[#eef1f5]">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <Link
                  href={`/documents/${notification.documentId}`}
                  className="grid gap-2 px-5 py-4 transition hover:bg-[#f7f9fc]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {!notification.readAt ? (
                      <span className="rounded-full bg-[#eaf1ff] px-2 py-1 text-xs font-semibold text-[#2563eb]">
                        새 알림
                      </span>
                    ) : null}
                    <span className="rounded-full bg-[#f1f5f9] px-2 py-1 text-xs font-semibold text-[#475569]">
                      {getNotificationTypeLabel(notification.type)}
                    </span>
                    <span className="ml-auto text-xs text-[#697386]">
                      {notificationDateFormatter.format(
                        new Date(notification.createdAt),
                      )}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#16181d]">
                      {notification.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#697386]">
                      {notification.message}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="px-5 py-16 text-center">
            <p className="text-sm font-semibold text-[#394150]">
              아직 알림이 없습니다.
            </p>
            <p className="mt-2 text-sm text-[#697386]">
              결재 요청이나 처리 결과가 생기면 이곳에 표시됩니다.
            </p>
          </div>
        )}
      </section>
  );
}
