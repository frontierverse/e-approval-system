import Link from "next/link";
import { Suspense } from "react";
import { ApprovalLinePreview } from "@/components/approval-line-preview";
import { QuickStatusLinks } from "@/components/quick-status-links";
import { UserIdentity } from "@/components/user-identity";
import { WorkFeatureUpdateList } from "@/components/work-feature-update-list";
import { UserRole } from "@/generated/prisma/client";
import {
  getCompletedDocuments,
  getDraftDocuments,
  getInboxDocuments,
  getRecentHistories,
  getSentDocuments,
  getSystemCompletedApprovalCount,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { formatDateTime } from "@/lib/mock-data";
import { RouteContentSkeleton } from "@/components/route-loading-shell";
import { getAuditActionBadgeClass } from "@/lib/audit-log-display";
import { getRecentWorkFeatureUpdates } from "@/lib/work-feature-updates";

export default function Home() {
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
  const [user, featureUpdates] = await Promise.all([
    requireUser(),
    getRecentWorkFeatureUpdates(),
  ]);

  return (
    <WorkFeatureUpdateList
      avoidTopRightSlot
      canCreate={user.role === UserRole.ADMIN}
      updates={featureUpdates}
    />
  );
}

async function HomeContent() {
  const user = await requireUser();
  const recentHistoryLimit = 5;
  const [
    systemCompletedApprovalCount,
    draftDocuments,
    inboxDocuments,
    sentDocuments,
    completedDocuments,
    recentHistories,
  ] = await Promise.all([
    getSystemCompletedApprovalCount(),
    getDraftDocuments(user.id),
    getInboxDocuments(user.id),
    getSentDocuments(user.id),
    getCompletedDocuments(user.id),
    getRecentHistories(user.id, recentHistoryLimit),
  ]);
  const activeSentDocuments = sentDocuments.filter(
    (document) =>
      document.status === "submitted" || document.status === "in_progress",
  );

  const summaries = [
    {
      label: "전체 완료 결재",
      value: String(systemCompletedApprovalCount),
      note: "시스템 누적 처리",
    },
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

      <section className="mt-6">
        <div className="rounded-md border border-[#d9dee7] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">최근 결재 활동</h2>
            <span className="text-xs font-medium text-[#697386]">
              최대 {recentHistoryLimit}건
            </span>
          </div>
          <ol className="mt-5 divide-y divide-[#eef1f5]">
            {recentHistories.map((history) => {
              const isPdfCreation = history.action === "PDF 생성";
              const badgeLabel = isPdfCreation ? "시스템 PDF 생성" : history.action;
              const badgeClass = isPdfCreation
                ? "border-[#bdd7f0] bg-[#edf6ff] text-[#245d8f]"
                : getAuditActionBadgeClass(history.actionValue ?? "");

              return (
                <li key={history.id} className="py-1 first:pt-0 last:pb-0">
                  <Link
                    href={`/documents/${history.documentId}`}
                    className="group block rounded-md px-3 py-3 transition hover:bg-[#f7fbfb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#196b69]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold",
                            badgeClass,
                          ].join(" ")}
                        >
                          {badgeLabel}
                        </span>
                        <p className="font-semibold text-[#16181d] group-hover:text-[#0f5553]">
                          {history.title}
                        </p>
                      </div>
                      <time className="text-xs text-[#697386]">
                        {formatDateTime(history.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 text-sm text-[#394150]">
                      {history.description}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[#697386]">
                      <span>{history.documentNo}</span>
                      <span aria-hidden="true">·</span>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0">결재요청자:</span>
                        <UserIdentity
                          user={history.requester}
                          size="xs"
                          nameClassName="text-[#697386]"
                        />
                      </div>
                    </div>
                    <ApprovalLinePreview
                      steps={history.approvalSteps}
                      className="mt-3"
                    />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
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
