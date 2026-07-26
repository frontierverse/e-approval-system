"use client";

import { UserIdentity } from "@/components/user-identity";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatLunchBoxDateLabel,
  type LunchBoxDailyCheckHistoryPage,
} from "@/lib/lunch-box-counts-core";

type LunchBoxDailyCheckHistoryProps = {
  historyPage: LunchBoxDailyCheckHistoryPage;
  isPending: boolean;
  error: string;
  onPageChange: (page: number) => void;
  onRetry: () => void;
};

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const paginationButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.neutral,
  "h-11 min-w-16 px-3 text-sm",
);

export function LunchBoxDailyCheckHistory({
  historyPage,
  isPending,
  error,
  onPageChange,
  onRetry,
}: LunchBoxDailyCheckHistoryProps) {
  const firstItem =
    historyPage.total === 0
      ? 0
      : (historyPage.page - 1) * historyPage.pageSize + 1;
  const lastItem = Math.min(
    historyPage.page * historyPage.pageSize,
    historyPage.total,
  );

  return (
    <section
      aria-busy={isPending || undefined}
      aria-label="날짜별 학교 체크 변경 기록"
      className="mt-4"
      id="lunch-box-daily-check-history"
    >
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            학교 체크 변경 기록
          </h2>
          <p
            aria-live="polite"
            className="mt-1 text-sm tabular-nums text-[var(--text-muted)]"
          >
            {historyPage.total === 0
              ? "표시할 체크 변경 기록이 없습니다."
              : `${historyPage.total.toLocaleString("ko-KR")}건 중 ${firstItem.toLocaleString("ko-KR")}-${lastItem.toLocaleString("ko-KR")}건 표시`}
          </p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          최신 변경순 · 페이지당 {historyPage.pageSize}건
        </p>
      </header>

      {error ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--danger)] bg-[var(--surface)] px-3 py-2">
          <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
            {error}
          </p>
          <button
            type="button"
            className={paginationButtonClassName}
            disabled={isPending}
            onClick={onRetry}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {historyPage.logs.length > 0 ? (
        <ol
          className={[
            "mt-3 divide-y divide-[var(--border)] border-y border-[var(--border-strong)] bg-[var(--surface)]",
            isPending ? "opacity-60" : "",
          ].join(" ")}
        >
          {historyPage.logs.map((log) => {
            const statusLabel =
              log.isChecked === null
                ? "상태 확인 불가"
                : log.isChecked
                  ? "체크"
                  : "체크 해제";
            const actorMeta = [
              log.actor.departmentName,
              log.actor.positionName,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li
                className="grid min-w-0 gap-2 px-3 py-3 sm:grid-cols-[11.5rem_minmax(0,1fr)_12rem] sm:items-center sm:gap-3 sm:px-4"
                key={log.id}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:block">
                  <time
                    className="text-sm font-semibold tabular-nums text-[var(--foreground)]"
                    dateTime={log.createdAt}
                  >
                    {dateTimeFormatter.format(new Date(log.createdAt))}
                  </time>
                  <span
                    className={[
                      "inline-flex h-7 items-center rounded-md border px-2 text-xs font-semibold",
                      log.isChecked
                        ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                        : "border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--text-muted)]",
                      "sm:mt-1.5",
                    ].join(" ")}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-medium tabular-nums text-[var(--text-muted)]">
                    대상일 {formatLunchBoxDateLabel(log.date)}
                  </p>
                  {log.schools.length > 0 ? (
                    <ul
                      aria-label="대상 학교"
                      className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1"
                    >
                      {log.schools.map((school, schoolIndex) => (
                        <li
                          className="break-words text-sm font-semibold text-[var(--foreground)] [overflow-wrap:anywhere]"
                          key={`${school.schoolId || school.schoolName}-${schoolIndex}`}
                        >
                          {school.schoolName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 break-words text-sm text-[var(--text-muted)] [overflow-wrap:anywhere]">
                      {log.message ?? "대상 학교 정보가 없습니다."}
                    </p>
                  )}
                </div>

                <UserIdentity
                  className="min-w-0"
                  meta={actorMeta}
                  metaClassName="text-[var(--text-muted)]"
                  nameClassName="text-[var(--foreground)]"
                  user={log.actor}
                />
              </li>
            );
          })}
        </ol>
      ) : error ? null : (
        <p className="mt-3 border-y border-[var(--border-strong)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          아직 기록된 학교 체크 변경 내역이 없습니다.
        </p>
      )}

      {historyPage.totalPages > 1 ? (
        <nav
          aria-label="날짜별 학교 체크 변경 기록 페이지"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 sm:px-4"
        >
          <p className="text-sm tabular-nums text-[var(--text-muted)]">
            {historyPage.page} / {historyPage.totalPages} 페이지
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={paginationButtonClassName}
              disabled={isPending || historyPage.page <= 1}
              onClick={() => onPageChange(historyPage.page - 1)}
            >
              이전
            </button>
            <button
              type="button"
              className={paginationButtonClassName}
              disabled={
                isPending || historyPage.page >= historyPage.totalPages
              }
              onClick={() => onPageChange(historyPage.page + 1)}
            >
              다음
            </button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
