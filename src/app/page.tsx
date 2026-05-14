import Link from "next/link";
import { Suspense } from "react";
import { ApprovalLinePreview } from "@/components/approval-line-preview";
import { PageTitle } from "@/components/page-title";
import { UserIdentity } from "@/components/user-identity";
import {
  getCompletedDocuments,
  getDraftDocuments,
  getInboxDocuments,
  getRecentHistories,
  getSentDocuments,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { formatDateTime } from "@/lib/mock-data";
import { RouteContentSkeleton } from "@/components/route-loading-shell";

export default function Home() {
  return (
    <>
      <PageTitle
        title="업무 홈"
        description="결재 대기 문서, 진행 중인 요청 문서, 완료 문서 현황을 확인합니다."
        action={
          <Link
            href="/drafts/new"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-10 px-4 text-sm",
            )}
          >
            새 기안 작성
          </Link>
        }
      />

      <Suspense fallback={<RouteContentSkeleton variant="home" />}>
        <HomeContent />
      </Suspense>
    </>
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
    recentHistories,
  ] = await Promise.all([
    getDraftDocuments(user.id),
    getInboxDocuments(user.id),
    getSentDocuments(user.id),
    getCompletedDocuments(user.id),
    getRecentHistories(user.id, user.role, recentHistoryLimit),
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
      <section className="grid gap-4 md:grid-cols-4">
        {summaries.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-md border border-[#d9dee7] bg-white p-5"
          >
            <p className="text-sm font-medium text-[#697386]">{item.label}</p>
            <p className="mt-4 text-3xl font-semibold text-[#16181d]">
              {item.value}
            </p>
            <p className="mt-2 text-sm text-[#697386]">{item.note}</p>
          </Link>
        ))}
      </section>

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
              return (
                <li key={history.id} className="py-1 first:pt-0 last:pb-0">
                  <Link
                    href={`/documents/${history.documentId}`}
                    className="group block rounded-md px-3 py-3 transition hover:bg-[#f7fbfb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#196b69]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#16181d] group-hover:text-[#0f5553]">
                        {history.title}
                      </p>
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
