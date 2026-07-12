import Link from "next/link";
import { Suspense } from "react";
import {
  getHomePersonalApprovalHistoryPageAction,
  getHomePublicApprovalActivityPageAction,
} from "@/app/home-actions";
import { HomeRecentApprovalActivity } from "@/components/home-recent-approval-activity";
import { QuickStatusLinks } from "@/components/quick-status-links";
import { WorkFeatureUpdateList } from "@/components/work-feature-update-list";
import { UserRole } from "@/generated/prisma/client";
import {
  getCompletedDocuments,
  getDraftDocuments,
  getInboxDocuments,
  getRecentHistoryPage,
  getRecentPublicApprovalActivityPage,
  getSentDocuments,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { RouteContentSkeleton } from "@/components/route-loading-shell";
import { getSystemUsageSummary } from "@/lib/system-usage";
import { getRecentWorkFeatureUpdates } from "@/lib/work-feature-updates";
import { getCurrentUser } from "@/lib/auth";
import { appDescription, appName, organizationName } from "@/lib/branding";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "전자결재·사내 업무 시스템",
  description: appDescription,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return <PublicLanding />;
  }

  return <AuthenticatedHome />;
}

function PublicLanding() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f9] px-4 py-10 text-[#16181d]">
      <section className="w-full max-w-xl rounded-md border border-[#d9dee7] bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold tracking-[0.16em] text-[#2563eb]">
          BAJAUL
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{appName}</h1>
        <p className="mt-4 text-lg leading-8 text-[#4b5563]">{appDescription}</p>
        <p className="mt-3 text-sm leading-6 text-[#697386]">{organizationName}</p>
        <Link
          href="/login"
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.create,
            "mt-8 inline-flex h-11 px-5 text-sm shadow-sm",
          )}
        >
          시스템 로그인
        </Link>
      </section>
    </main>
  );
}

function AuthenticatedHome() {
  return (
    <>
      <div className="mb-5 lg:relative lg:[--home-draft-action-gap:2rem] lg:[--home-draft-action-height:3.25rem] lg:[--home-draft-action-width:8rem]">
        <div className="mb-3 flex justify-end lg:absolute lg:right-0 lg:top-0 lg:z-20 lg:mb-0">
          <Link
            href="/drafts/new"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-10 whitespace-nowrap px-4 text-sm shadow-sm lg:w-[var(--home-draft-action-width)]",
            )}
          >
            새 기안 작성
          </Link>
        </div>
        <Suspense fallback={<FeatureUpdateListSkeleton />}>
          <HomeFeatureUpdates />
        </Suspense>
      </div>

      <Suspense fallback={<RouteContentSkeleton variant="home" />}>
        <HomeContent />
      </Suspense>
    </>
  );
}

async function HomeFeatureUpdates() {
  const [user, featureUpdates, usageSummary] = await Promise.all([
    requireUser(),
    getRecentWorkFeatureUpdates(),
    getSystemUsageSummary(),
  ]);

  return (
    <WorkFeatureUpdateList
      avoidTopRightSlot
      canCreate={user.role === UserRole.ADMIN}
      usageSummary={usageSummary}
      updates={featureUpdates}
    />
  );
}

async function HomeContent() {
  const user = await requireUser();
  const recentHistoryLimit = 5;
  const [
    draftDocuments,
    inboxDocuments,
    sentDocuments,
    completedDocuments,
    recentPersonalHistoryPage,
    recentPublicActivityPage,
  ] = await Promise.all([
    getDraftDocuments(user.id),
    getInboxDocuments(user.id),
    getSentDocuments(user.id),
    getCompletedDocuments(user.id),
    getRecentHistoryPage(user.id, {
      pageSize: recentHistoryLimit,
    }),
    getRecentPublicApprovalActivityPage({
      pageSize: recentHistoryLimit,
    }),
  ]);
  const activeSentDocuments = sentDocuments.filter(
    (document) =>
      document.status === "submitted" || document.status === "in_progress",
  );

  const summaries = [
    {
      label: "임시저장/회수",
      value: String(draftDocuments.length),
      note: "이어 작성할 문서",
      href: "/drafts",
    },
    {
      label: "받은 결재 대기",
      value: String(inboxDocuments.length),
      note: "처리할 문서",
      href: "/inbox",
    },
    {
      label: "진행 중 결재 요청",
      value: String(activeSentDocuments.length),
      note: "내가 올린 문서",
      href: "/sent",
    },
    {
      label: "완료 문서",
      value: String(completedDocuments.length),
      note: "승인 또는 반려",
      href: "/completed",
    },
  ];

  return (
    <>
      <QuickStatusLinks items={summaries} />

      <HomeRecentApprovalActivity
        loadPersonalHistoryPage={getHomePersonalApprovalHistoryPageAction}
        loadPublicActivityPage={getHomePublicApprovalActivityPageAction}
        personalHistoryPage={recentPersonalHistoryPage}
        publicActivityPage={recentPublicActivityPage}
      />
    </>
  );
}

function FeatureUpdateListSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="home-feature-card overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm"
    >
      <div className="home-feature-card-header border-b border-[#eef1f5] px-5 py-4">
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
