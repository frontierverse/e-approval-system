import Link from "next/link";
import { QuickStatusLinks } from "@/components/quick-status-links";
import { StatusBadge } from "@/components/status-badge";
import type {
  HomeDashboardData,
  HomeDashboardDocument,
} from "@/lib/home-dashboard";

export function HomeWorkDashboard({
  dashboard,
  relatedActivity,
  showApprovalQueue,
}: {
  dashboard: HomeDashboardData;
  relatedActivity?: React.ReactNode;
  showApprovalQueue: boolean;
}) {
  const { counts } = dashboard;
  const approvalMetrics = [
    {
      label: "처리할 결재",
      value: String(counts.activeInbox),
      unit: "건",
      note: "내 승인을 기다리는 문서",
      meta: counts.activeInbox > 0 ? "우선 처리" : "처리 완료",
      href: "/inbox?status=active&sort=oldest",
      tone: counts.activeInbox > 0 ? ("brand" as const) : ("neutral" as const),
    },
    {
      label: "24시간 이상 대기",
      value: String(counts.overdueInbox),
      unit: "건",
      note: "오래 기다린 결재 요청",
      meta: counts.overdueInbox > 0 ? "우선 확인" : "정상",
      href: "/inbox?status=active&sort=oldest",
      tone: counts.overdueInbox > 0 ? ("danger" as const) : ("neutral" as const),
    },
  ];
  const personalMetrics = [
    {
      label: "회수 후 보완",
      value: String(counts.recalled),
      unit: "건",
      note: "수정 후 다시 제출할 문서",
      meta: counts.recalled > 0 ? "재작업 필요" : "대상 없음",
      href: "/drafts?status=recalled",
      tone: counts.recalled > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "진행 중인 내 기안",
      value: String(counts.activeSent),
      unit: "건",
      note: "결재선에서 처리 중인 문서",
      href: "/sent?status=active&sort=oldest",
      tone: "neutral" as const,
    },
  ];
  const metrics = showApprovalQueue
    ? [...approvalMetrics, ...personalMetrics]
    : personalMetrics;

  return (
    <section aria-labelledby="home-priority-heading">
      <h2 id="home-priority-heading" className="sr-only">
        업무 우선순위
      </h2>
      <time className="sr-only" dateTime={dashboard.generatedAt}>
        현황 생성 시각 {dashboard.generatedAt}
      </time>

      <QuickStatusLinks
        ariaLabel={showApprovalQueue ? "오늘의 결재 현황" : "오늘의 내 문서 현황"}
        items={metrics}
      />

      {showApprovalQueue ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)] xl:items-start">
          <InboxQueue
            documents={dashboard.inboxDocuments}
            generatedAt={dashboard.generatedAt}
            total={counts.activeInbox}
          />
          <aside
            aria-label="내 기안 진행 및 최근 변경"
            className="grid min-w-0 gap-3"
          >
            <SentDocumentOverview
              documents={dashboard.sentDocuments}
              generatedAt={dashboard.generatedAt}
              total={counts.activeSent}
            />
            {relatedActivity}
          </aside>
        </div>
      ) : (
        <div
          className={`mt-3 grid gap-3 xl:items-start ${
            relatedActivity ? "xl:grid-cols-2" : ""
          }`}
        >
          <SentDocumentOverview
            documents={dashboard.sentDocuments}
            generatedAt={dashboard.generatedAt}
            total={counts.activeSent}
          />
          {relatedActivity}
        </div>
      )}
    </section>
  );
}

function InboxQueue({
  documents,
  generatedAt,
  total,
}: {
  documents: HomeDashboardDocument[];
  generatedAt: string;
  total: number;
}) {
  return (
    <section
      aria-labelledby="home-inbox-queue-title"
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
    >
      <header className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2
            id="home-inbox-queue-title"
            className="truncate text-sm font-semibold text-[var(--foreground)] sm:text-base"
          >
            지금 처리할 결재
          </h2>
          <span className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--brand)]">
            {total.toLocaleString("ko-KR")}건
          </span>
          <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
            오래 기다린 순
          </span>
        </div>
        <SectionLink
          ariaLabel="받은결재함 전체 보기"
          href="/inbox?status=active&sort=oldest"
        >
          전체 보기
        </SectionLink>
      </header>

      {documents.length > 0 ? (
        <>
          <ol className="divide-y divide-[var(--border)]">
            {documents.map((document) => (
              <InboxQueueItem
                document={document}
                generatedAt={generatedAt}
                key={document.id}
              />
            ))}
          </ol>
          {total > documents.length ? (
            <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-center text-xs text-[var(--text-muted)] sm:px-4">
              목록에 표시되지 않은 결재가{" "}
              <span className="font-semibold tabular-nums text-[var(--foreground)]">
                {total - documents.length}건
              </span>{" "}
              더 있습니다.
            </div>
          ) : null}
        </>
      ) : (
        <DashboardEmptyState
          title="처리할 결재가 없습니다"
          description="새 결재 요청이 도착하면 대기 시간이 긴 순서로 표시됩니다."
          href="/inbox"
          action="받은결재함 보기"
        />
      )}
    </section>
  );
}

function InboxQueueItem({
  document,
  generatedAt,
}: {
  document: HomeDashboardDocument;
  generatedAt: string;
}) {
  const activityAt = document.submittedAt ?? document.createdAt;
  const waitMinutes = getWaitMinutes(activityAt, generatedAt);
  const waitingLabel = formatWaitingTime(activityAt, generatedAt);
  const isLongWaiting = waitMinutes >= 24 * 60;
  const stepLabel = document.currentStepOrder
    ? `${document.currentStepOrder}/${document.totalSteps}단계`
    : `${document.completedSteps}/${document.totalSteps}단계`;

  return (
    <li>
      <Link
        href={`/documents/${document.id}`}
        className="group grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3.5 py-2.5 transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:px-4 lg:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_4rem_auto] lg:gap-x-3"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="inline-flex min-h-5 shrink-0 items-center rounded bg-[var(--surface-muted)] px-1.5 text-[0.6875rem] font-semibold text-[var(--text-muted)]">
              {document.category}
            </span>
            <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
              {document.title}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-[0.6875rem] tabular-nums text-[var(--text-muted)]">
            {document.documentNo || "문서번호 미발급"}
          </p>
        </div>

        <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-xs lg:contents">
          <p className="truncate text-[var(--text-muted)]">
            <span className="sr-only">기안자 </span>
            <span className="font-medium text-[var(--foreground)]">
              {document.drafter.name}
            </span>
            <span className="hidden 2xl:inline">
              {" "}· {document.drafter.departmentName}
            </span>
          </p>
          <strong
            className={`whitespace-nowrap font-semibold tabular-nums ${
              isLongWaiting ? "text-[var(--danger)]" : "text-[var(--foreground)]"
            }`}
          >
            <span className="sr-only">대기 시간 </span>
            {waitingLabel}
          </strong>
          <strong className="whitespace-nowrap font-semibold tabular-nums text-[var(--foreground)]">
            <span className="sr-only">현재 단계 </span>
            {stepLabel}
          </strong>
        </div>

        <span
          aria-hidden="true"
          className="col-start-2 row-start-1 grid size-7 place-items-center rounded-md text-base text-[var(--text-muted)] transition group-hover:bg-[var(--brand-soft)] group-hover:text-[var(--brand)] lg:col-start-auto lg:row-start-auto"
        >
          ›
        </span>
      </Link>
    </li>
  );
}

function SentDocumentOverview({
  documents,
  generatedAt,
  total,
}: {
  documents: HomeDashboardDocument[];
  generatedAt: string;
  total: number;
}) {
  return (
    <section
      aria-labelledby="home-sent-overview-title"
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
    >
      <header className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2
            id="home-sent-overview-title"
            className="truncate text-sm font-semibold text-[var(--foreground)] sm:text-base"
          >
            내 기안 진행
          </h2>
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
            {total.toLocaleString("ko-KR")}건
          </span>
        </div>
        <SectionLink
          ariaLabel="내 기안 전체 보기"
          href="/sent?status=active&sort=oldest"
        >
          전체 보기
        </SectionLink>
      </header>

      {documents.length > 0 ? (
        <ul className="divide-y divide-[var(--border)]">
          {documents.map((document) => (
            <SentDocumentItem
              document={document}
              generatedAt={generatedAt}
              key={document.id}
            />
          ))}
        </ul>
      ) : (
        <DashboardEmptyState
          title="진행 중인 내 기안이 없습니다"
          description="새 기안을 제출하면 결재 단계별 진행 상황을 확인할 수 있습니다."
          href="/drafts/new"
          action="새 기안 작성"
        />
      )}
    </section>
  );
}

function SentDocumentItem({
  document,
  generatedAt,
}: {
  document: HomeDashboardDocument;
  generatedAt: string;
}) {
  const progress =
    document.totalSteps > 0
      ? Math.round((document.completedSteps / document.totalSteps) * 100)
      : 0;
  const activityAt = document.submittedAt ?? document.createdAt;

  return (
    <li>
      <Link
        href={`/documents/${document.id}`}
        className="group relative block px-3.5 py-2 transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:px-4"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
              {document.title}
            </h3>
          </div>
          <StatusBadge status={document.status} type="document" />
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-[var(--text-muted)]">
            <span className="hidden tabular-nums sm:inline">
              {document.documentNo || "문서번호 미발급"} ·{" "}
            </span>
            <span>
              {document.currentApprover
                ? `현재 ${document.currentApprover.name} 결재 대기`
                : "결재선 확인 중"}
            </span>
            <span className="sr-only">
              , 제출 후 {formatWaitingTime(activityAt, generatedAt)}
            </span>
          </span>
          <strong className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">
            {document.completedSteps}/{document.totalSteps}단계
          </strong>
        </div>
        <div
          aria-label={`결재 진행률 ${progress}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="absolute inset-x-3.5 bottom-0 h-0.5 overflow-hidden rounded-full bg-[var(--surface-muted)] sm:inset-x-4"
          role="progressbar"
        >
          <span
            className="block h-full rounded-full bg-[var(--brand)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Link>
    </li>
  );
}

function SectionLink({
  ariaLabel,
  children,
  href,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      aria-label={ariaLabel}
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

function DashboardEmptyState({
  action,
  description,
  href,
  title,
}: {
  action: string;
  description: string;
  href: string;
  title: string;
}) {
  return (
    <div className="grid min-h-36 place-items-center px-4 py-5 text-center">
      <div className="max-w-sm">
        <span
          aria-hidden="true"
          className="mx-auto grid size-8 place-items-center rounded-full bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand)]"
        >
          ✓
        </span>
        <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          {description}
        </p>
        <Link
          href={href}
          className="mt-1 inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-soft)]"
        >
          {action}
        </Link>
      </div>
    </div>
  );
}

function getWaitMinutes(from: string, to: string) {
  const difference = new Date(to).getTime() - new Date(from).getTime();

  return Math.max(0, Math.floor(difference / (60 * 1000)));
}

export function formatWaitingTime(from: string, to: string) {
  const minutes = getWaitMinutes(from, to);

  if (minutes < 1) {
    return "방금 도착";
  }

  if (minutes < 60) {
    return `${minutes}분 대기`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}시간 대기`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0
    ? `${days}일 ${remainingHours}시간 대기`
    : `${days}일 대기`;
}
