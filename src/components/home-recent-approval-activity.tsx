import Link from "next/link";
import { getAuditActionBadgeClass } from "@/lib/audit-log-display";
import type { ApprovalStep, UserSummary } from "@/lib/mock-data";

const compactDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

export type HomeRecentApprovalHistory = {
  id: string;
  action: string;
  actionValue?: string | null;
  approvalSteps: ApprovalStep[];
  createdAt: string;
  description: string;
  documentId: string;
  documentNo: string;
  requester: UserSummary;
  title: string;
};

export type HomePersonalApprovalHistoryPage = {
  histories: HomeRecentApprovalHistory[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function HomeRecentApprovalActivity({
  personalHistoryPage,
}: {
  personalHistoryPage: HomePersonalApprovalHistoryPage;
}) {
  return (
    <section
      aria-labelledby="home-related-activity-title"
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
    >
      <header className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 sm:px-4">
        <h2
          id="home-related-activity-title"
          className="truncate text-sm font-semibold text-[var(--foreground)] sm:text-base"
        >
          내 관련 문서의 최근 변경
        </h2>
        <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
          총 {personalHistoryPage.total.toLocaleString("ko-KR")}건
        </span>
      </header>

      {personalHistoryPage.histories.length > 0 ? (
        <ol className="divide-y divide-[var(--border)]">
          {personalHistoryPage.histories.slice(0, 2).map((history) => (
            <PersonalActivityItem key={history.id} history={history} />
          ))}
        </ol>
      ) : (
        <div className="px-4 py-5 text-center">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            최근 문서 변경이 없습니다
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            결재 요청이나 처리 결과가 발생하면 이곳에 표시됩니다.
          </p>
        </div>
      )}
    </section>
  );
}

function PersonalActivityItem({
  history,
}: {
  history: HomeRecentApprovalHistory;
}) {
  const isPdfCreation = history.action === "PDF 생성";
  const badgeLabel = isPdfCreation ? "시스템 PDF 생성" : history.action;
  const badgeClass = isPdfCreation
    ? "border-[#bdd7f0] bg-[#edf6ff] text-[#245d8f]"
    : getAuditActionBadgeClass(history.actionValue ?? "");
  const progressLabel = getApprovalProgressLabel(history.approvalSteps);

  return (
    <li>
      <Link
        href={`/documents/${history.documentId}`}
        className="group block px-3.5 py-2 transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex min-h-6 shrink-0 items-center rounded-md border px-2 text-[0.6875rem] font-semibold ${badgeClass}`}
          >
            {badgeLabel}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
            {history.title}
          </h3>
        </div>

        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <p className="min-w-0 truncate">
            <span className="hidden tabular-nums sm:inline">
              {history.documentNo || "문서번호 미발급"} ·{" "}
            </span>
            {progressLabel}
          </p>
          <p className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span>
              <span className="sr-only">요청자 </span>
              {history.requester.name}
            </span>
            <time dateTime={history.createdAt} className="tabular-nums">
              {compactDateTimeFormatter.format(new Date(history.createdAt))}
            </time>
          </p>
        </div>
      </Link>
    </li>
  );
}

function getApprovalProgressLabel(steps: ApprovalStep[]) {
  if (steps.length === 0) {
    return "결재선 없음";
  }

  const approvedCount = steps.filter((step) => step.status === "approved").length;
  const rejectedStep = steps.find((step) => step.status === "rejected");

  if (rejectedStep) {
    return `${rejectedStep.order}단계 반려 · ${rejectedStep.approver.name}`;
  }

  const pendingStep = steps.find((step) => step.status === "pending");

  if (pendingStep) {
    return `${approvedCount}/${steps.length}단계 완료 · ${pendingStep.approver.name} 결재 대기`;
  }

  if (approvedCount === steps.length) {
    return `결재 완료 · ${approvedCount}/${steps.length}단계`;
  }

  return `${approvedCount}/${steps.length}단계 완료`;
}
