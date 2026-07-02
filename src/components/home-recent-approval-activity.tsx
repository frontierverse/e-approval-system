"use client";

import Link from "next/link";
import {
  useCallback,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ApprovalLinePreview } from "@/components/approval-line-preview";
import { UserIdentity } from "@/components/user-identity";
import { getAuditActionBadgeClass } from "@/lib/audit-log-display";
import { formatDateTime } from "@/lib/mock-data";
import type { ApprovalStep, UserSummary } from "@/lib/mock-data";

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

export type HomePublicApprovalActivity = {
  action: string;
  actionValue: string;
  actedAt: string;
  actor: UserSummary;
  id: string;
};

export type HomePublicApprovalActivityPage = {
  activities: HomePublicApprovalActivity[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type HomePersonalApprovalHistoryPage = {
  histories: HomeRecentApprovalHistory[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type HomePersonalHistoryPageActionResult = Promise<
  | {
      ok: true;
      data: {
        personalHistoryPage: HomePersonalApprovalHistoryPage;
      };
    }
  | {
      ok: false;
      error: string;
    }
>;

type HomePublicActivityPageActionResult = Promise<
  | {
      ok: true;
      data: {
        publicActivityPage: HomePublicApprovalActivityPage;
      };
    }
  | {
      ok: false;
      error: string;
    }
>;

type HomeRecentApprovalActivityProps = {
  loadPersonalHistoryPage?: (
    page: number,
  ) => HomePersonalHistoryPageActionResult;
  loadPublicActivityPage?: (
    page: number,
  ) => HomePublicActivityPageActionResult;
  personalHistoryPage: HomePersonalApprovalHistoryPage;
  publicActivityPage: HomePublicApprovalActivityPage;
};

export function HomeRecentApprovalActivity({
  loadPersonalHistoryPage,
  loadPublicActivityPage,
  personalHistoryPage,
  publicActivityPage,
}: HomeRecentApprovalActivityProps) {
  const [personalPageState, setPersonalPageState] =
    useState(personalHistoryPage);
  const [publicPageState, setPublicPageState] = useState(publicActivityPage);
  const [personalPageError, setPersonalPageError] = useState("");
  const [publicPageError, setPublicPageError] = useState("");
  const [pendingPersonalPage, setPendingPersonalPage] = useState<number | null>(
    null,
  );
  const [pendingPublicPage, setPendingPublicPage] = useState<number | null>(
    null,
  );
  const [isPersonalPagePending, startPersonalPageTransition] = useTransition();
  const [isPublicPagePending, startPublicPageTransition] = useTransition();

  const loadPersonalPage = useCallback(
    (nextPage: number) => {
      if (!loadPersonalHistoryPage || isPersonalPagePending) {
        return;
      }

      if (nextPage < 1 || nextPage > personalPageState.totalPages) {
        return;
      }

      setPendingPersonalPage(nextPage);
      startPersonalPageTransition(async () => {
        try {
          const result = await loadPersonalHistoryPage(nextPage);

          if (!result.ok) {
            setPersonalPageError(result.error);
            return;
          }

          setPersonalPageState(result.data.personalHistoryPage);
          setPersonalPageError("");
        } finally {
          setPendingPersonalPage(null);
        }
      });
    },
    [
      isPersonalPagePending,
      loadPersonalHistoryPage,
      personalPageState.totalPages,
    ],
  );

  const loadPublicPage = useCallback(
    (nextPage: number) => {
      if (!loadPublicActivityPage || isPublicPagePending) {
        return;
      }

      if (nextPage < 1 || nextPage > publicPageState.totalPages) {
        return;
      }

      setPendingPublicPage(nextPage);
      startPublicPageTransition(async () => {
        try {
          const result = await loadPublicActivityPage(nextPage);

          if (!result.ok) {
            setPublicPageError(result.error);
            return;
          }

          setPublicPageState(result.data.publicActivityPage);
          setPublicPageError("");
        } finally {
          setPendingPublicPage(null);
        }
      });
    },
    [
      isPublicPagePending,
      loadPublicActivityPage,
      publicPageState.totalPages,
    ],
  );

  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-2">
      <RecentActivityPanel
        countLabel={`${personalPageState.page} / ${personalPageState.totalPages}`}
        headerAction={
          <ActivityPagination
            canLoad={Boolean(loadPersonalHistoryPage)}
            isPending={isPersonalPagePending}
            label="나의 최근 결재 활동"
            onPageChange={loadPersonalPage}
            page={personalPageState.page}
            pendingPage={pendingPersonalPage}
            totalPages={personalPageState.totalPages}
          />
        }
        title="나의 최근 결재 활동"
      >
        {personalPageState.histories.length > 0 ? (
          <ol
            aria-busy={isPersonalPagePending}
            className={[
              "mt-5 divide-y divide-[#eef1f5] transition-opacity",
              isPersonalPagePending ? "opacity-60" : "opacity-100",
            ].join(" ")}
          >
            {personalPageState.histories.map((history) => (
              <PersonalActivityItem key={history.id} history={history} />
            ))}
          </ol>
        ) : (
          <p className="mt-5 rounded-md bg-[#f7f9fc] px-3 py-4 text-sm text-[#697386]">
            표시할 결재 활동이 없습니다.
          </p>
        )}
        {personalPageError ? (
          <p className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {personalPageError}
          </p>
        ) : null}
      </RecentActivityPanel>

      <RecentActivityPanel
        countLabel={`${publicPageState.page} / ${publicPageState.totalPages}`}
        headerAction={
          <ActivityPagination
            canLoad={Boolean(loadPublicActivityPage)}
            isPending={isPublicPagePending}
            label="모든 결재 활동"
            onPageChange={loadPublicPage}
            page={publicPageState.page}
            pendingPage={pendingPublicPage}
            totalPages={publicPageState.totalPages}
          />
        }
        title="모든 결재 활동"
      >
        {publicPageState.activities.length > 0 ? (
          <ol
            aria-busy={isPublicPagePending}
            className={[
              "mt-5 divide-y divide-[#eef1f5] transition-opacity",
              isPublicPagePending ? "opacity-60" : "opacity-100",
            ].join(" ")}
          >
            {publicPageState.activities.map((activity) => (
              <PublicActivityItem
                activity={activity}
                key={activity.id}
              />
            ))}
          </ol>
        ) : (
          <p className="mt-5 rounded-md bg-[#f7f9fc] px-3 py-4 text-sm text-[#697386]">
            표시할 결재 활동이 없습니다.
          </p>
        )}
        {publicPageError ? (
          <p className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {publicPageError}
          </p>
        ) : null}
      </RecentActivityPanel>
    </section>
  );
}

function RecentActivityPanel({
  children,
  countLabel,
  headerAction,
  title,
}: {
  children: ReactNode;
  countLabel: string;
  headerAction?: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#697386]">
            {countLabel}
          </span>
          {headerAction}
        </div>
      </div>
      {children}
    </div>
  );
}

function ActivityPagination({
  canLoad,
  isPending,
  label,
  onPageChange,
  page,
  pendingPage,
  totalPages,
}: {
  canLoad: boolean;
  isPending: boolean;
  label: string;
  onPageChange: (page: number) => void;
  page: number;
  pendingPage: number | null;
  totalPages: number;
}) {
  const previousPage = page - 1;
  const nextPage = page + 1;

  return (
    <div className="flex items-center gap-1">
      <IconPageButton
        ariaLabel={`이전 ${label}`}
        disabled={!canLoad || isPending || page <= 1}
        isPending={pendingPage === previousPage}
        onClick={() => onPageChange(previousPage)}
      >
        <ChevronLeftIcon />
      </IconPageButton>
      <IconPageButton
        ariaLabel={`다음 ${label}`}
        disabled={!canLoad || isPending || page >= totalPages}
        isPending={pendingPage === nextPage}
        onClick={() => onPageChange(nextPage)}
      >
        <ChevronRightIcon />
      </IconPageButton>
    </div>
  );
}

function IconPageButton({
  ariaLabel,
  children,
  disabled,
  isPending,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled: boolean;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={[
        "flex size-8 items-center justify-center rounded-md border border-[#cfd6e3] bg-white text-[#394150] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#196b69]",
        disabled
          ? "cursor-not-allowed opacity-45"
          : "hover:border-[#196b69] hover:bg-[#f7fbfb] hover:text-[#0f5553]",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {isPending ? (
        <span className="size-3 animate-pulse rounded-full bg-[#697386]" />
      ) : (
        children
      )}
    </button>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M15 18 9 12l6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
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

  return (
    <li className="py-1 first:pt-0 last:pb-0">
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
        <p className="mt-2 text-sm text-[#394150]">{history.description}</p>
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
        <ApprovalLinePreview steps={history.approvalSteps} className="mt-3" />
      </Link>
    </li>
  );
}

function PublicActivityItem({
  activity,
}: {
  activity: HomePublicApprovalActivity;
}) {
  const badgeClass = getAuditActionBadgeClass(activity.actionValue);

  return (
    <li className="py-1 first:pt-0 last:pb-0">
      <article className="rounded-md px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <UserIdentity
            user={activity.actor}
            meta={`${activity.actor.departmentName} · ${activity.actor.positionName}`}
            size="xs"
          />
          <time className="text-xs text-[#697386]">
            {formatDateTime(activity.actedAt)}
          </time>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={[
              "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold",
              badgeClass,
            ].join(" ")}
          >
            {activity.action}
          </span>
        </div>
        <div className="mt-3 rounded-md border border-dashed border-[#cfd7e3] bg-[#f7f9fc] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span
              aria-hidden="true"
              className="h-3 w-32 max-w-[52%] rounded-full bg-[#cfd7e3]"
            />
            <span
              aria-hidden="true"
              className="h-3 w-16 rounded-full bg-[#dfe5ed]"
            />
          </div>
          <div className="mt-3 grid gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-full rounded-full bg-[#dfe5ed]"
            />
            <span
              aria-hidden="true"
              className="h-2.5 w-3/4 rounded-full bg-[#dfe5ed]"
            />
          </div>
        </div>
      </article>
    </li>
  );
}
