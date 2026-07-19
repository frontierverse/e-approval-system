import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HomeRecentApprovalActivity } from "@/components/home-recent-approval-activity";
import { HomeWorkDashboard } from "@/components/home-work-dashboard";
import { PageTitle } from "@/components/page-title";
import { WorkFeatureUpdateList } from "@/components/work-feature-update-list";
import { UserRole } from "@/generated/prisma/client";
import { getRecentHistoryPage } from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { RouteContentSkeleton } from "@/components/route-loading-shell";
import { getHomeDashboardData } from "@/lib/home-dashboard";
import { canViewHomeApprovalQueue } from "@/lib/home-dashboard-visibility";
import { getRecentWorkFeatureUpdates } from "@/lib/work-feature-updates";

export const metadata: Metadata = {
  title: "오늘의 업무",
};

export default function Home() {
  const todayLabel = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date());

  return (
    <>
      <PageTitle
        title="오늘의 업무"
        description={todayLabel}
        compact
        action={
          <Link
            href="/drafts/new"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-10 whitespace-nowrap px-4 text-sm shadow-sm",
            )}
          >
            새 기안 작성
          </Link>
        }
      />

      <Suspense fallback={<RouteContentSkeleton variant="home" />}>
        <HomeContent />
      </Suspense>

      <div className="mt-4">
        <Suspense fallback={<FeatureUpdateListSkeleton />}>
          <HomeFeatureUpdates />
        </Suspense>
      </div>
    </>
  );
}

async function HomeFeatureUpdates() {
  const [user, featureUpdates] = await Promise.all([
    requireUser(),
    getRecentWorkFeatureUpdates(),
  ]);

  if (featureUpdates.length === 0 && user.role !== UserRole.ADMIN) {
    return null;
  }

  return (
    <WorkFeatureUpdateList
      canCreate={user.role === UserRole.ADMIN}
      updates={featureUpdates}
    />
  );
}

async function HomeContent() {
  const user = await requireUser();
  const showApprovalQueue = canViewHomeApprovalQueue(user.position.name);
  const recentHistoryLimit = 2;
  const [dashboard, recentPersonalHistoryPage] = await Promise.all([
    getHomeDashboardData(user.id, {
      includeApprovalQueue: showApprovalQueue,
      sentLimit: 2,
    }),
    getRecentHistoryPage(user.id, {
      pageSize: recentHistoryLimit,
    }),
  ]);

  return (
    <HomeWorkDashboard
      dashboard={dashboard}
      showApprovalQueue={showApprovalQueue}
      relatedActivity={
        <HomeRecentApprovalActivity
          personalHistoryPage={recentPersonalHistoryPage}
        />
      }
    />
  );
}

function FeatureUpdateListSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm"
    >
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <div className="h-5 w-36 rounded-md bg-[#edf1f5]" />
        <div className="mt-2 h-4 w-full max-w-lg rounded-md bg-[#edf1f5]" />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {[0, 1].map((item) => (
            <div key={item} className="w-32">
              <div className="h-3 w-28 rounded-md bg-[#edf1f5]" />
              <div className="mt-1 h-1 rounded-full bg-[#edf1f5]" />
            </div>
          ))}
        </div>
      </div>
      <div className="divide-y divide-[#eef1f5]">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="grid min-h-14 gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
          >
            <div>
              <div className="h-4 w-48 max-w-full rounded-md bg-[#edf1f5]" />
              <div className="mt-2 h-3 w-64 max-w-full rounded-md bg-[#edf1f5]" />
            </div>
            <div className="h-3 w-20 rounded-md bg-[#edf1f5] sm:ml-auto" />
          </div>
        ))}
      </div>
    </section>
  );
}
