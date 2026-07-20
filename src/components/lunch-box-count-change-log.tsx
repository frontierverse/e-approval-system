import Link from "next/link";
import { UserIdentity } from "@/components/user-identity";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatLunchBoxDateLabel,
  lunchBoxCountFieldLabels,
  type LunchBoxCountChangeLogPage,
} from "@/lib/lunch-box-counts-core";

const changeLogSectionId = "lunch-box-change-log";

export function LunchBoxCountChangeLog({
  changeLogPage,
  selectedMonth,
}: {
  changeLogPage: LunchBoxCountChangeLogPage;
  selectedMonth: string;
}) {
  const firstItem =
    changeLogPage.total === 0
      ? 0
      : (changeLogPage.page - 1) * changeLogPage.pageSize + 1;
  const lastItem = Math.min(
    changeLogPage.page * changeLogPage.pageSize,
    changeLogPage.total,
  );

  return (
    <section
      aria-labelledby={`${changeLogSectionId}-title`}
      className="mt-6 scroll-mt-20"
      id={changeLogSectionId}
    >
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="text-base font-semibold text-[var(--foreground)]"
            id={`${changeLogSectionId}-title`}
          >
            도시락 변경 기록
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {changeLogPage.total === 0
              ? "표시할 변경 기록이 없습니다."
              : `${changeLogPage.total.toLocaleString("ko-KR")}건 중 ${firstItem.toLocaleString("ko-KR")}-${lastItem.toLocaleString("ko-KR")}건 표시`}
          </p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          최신 변경순 · 페이지당 {changeLogPage.pageSize}건
        </p>
      </header>

      {changeLogPage.logs.length > 0 ? (
        <ol className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border-strong)] bg-[var(--surface)]">
          {changeLogPage.logs.map((log) => (
            <li
              className="grid gap-3 px-4 py-4 lg:grid-cols-[13rem_minmax(0,1fr)]"
              key={log.id}
            >
              <div className="min-w-0">
                <time
                  className="text-sm font-semibold tabular-nums text-[var(--foreground)]"
                  dateTime={log.createdAt}
                >
                  {formatChangeLogDateTime(log.createdAt)}
                </time>
                <UserIdentity
                  className="mt-2"
                  meta={[log.actor.departmentName, log.actor.positionName]
                    .filter(Boolean)
                    .join(" · ")}
                  nameClassName="text-[var(--foreground)]"
                  user={log.actor}
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {log.date ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-[#b8d9d7] bg-[#eef7f6] px-2.5 text-xs font-semibold tabular-nums text-[#196b69] dark:border-[#388bfd66] dark:bg-[#1f6feb29] dark:text-[#79c0ff]">
                      대상일 {formatLunchBoxDateLabel(log.date)}
                    </span>
                  ) : null}
                  <span className="text-sm text-[var(--text-muted)]">
                    {log.schools.length.toLocaleString("ko-KR")}개교 변경
                  </span>
                </div>

                <p className="mt-2 break-words text-sm leading-6 text-[var(--foreground)] [overflow-wrap:anywhere]">
                  {log.message ?? "도시락 개수 변경 기록입니다."}
                </p>

                {log.schools.length > 0 ? (
                  <ul className="mt-3 space-y-2" aria-label="학교별 상세 변경값">
                    {log.schools.map((school, schoolIndex) => (
                      <li
                        className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] sm:items-start"
                        key={`${school.schoolId || school.schoolName}-${schoolIndex}`}
                      >
                        <p className="break-words text-sm font-semibold text-[var(--foreground)] [overflow-wrap:anywhere]">
                          {school.schoolName}
                        </p>
                        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
                          {school.changes.map((change) => (
                            <p
                              className="text-sm tabular-nums text-[var(--foreground)]"
                              key={change.field}
                            >
                              <span className="mr-1 font-medium text-[var(--text-muted)]">
                                {lunchBoxCountFieldLabels[change.field]}
                              </span>
                              <span>{change.previous}</span>
                              <span className="sr-only">에서</span>
                              <span aria-hidden="true" className="mx-1">
                                →
                              </span>
                              <span className="font-semibold text-[var(--brand)]">
                                {change.next}
                              </span>
                              <span className="sr-only">로 변경</span>
                            </p>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-md border border-dashed border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--text-muted)]">
                    이전 형식의 기록으로 상세 변경값은 제공되지 않습니다.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 border-y border-[var(--border-strong)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          아직 기록된 도시락 변경 내역이 없습니다.
        </p>
      )}

      <LunchBoxCountChangeLogPagination
        changeLogPage={changeLogPage}
        selectedMonth={selectedMonth}
      />
    </section>
  );
}

function LunchBoxCountChangeLogPagination({
  changeLogPage,
  selectedMonth,
}: {
  changeLogPage: LunchBoxCountChangeLogPage;
  selectedMonth: string;
}) {
  if (changeLogPage.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="도시락 변경 기록 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3"
    >
      <p className="text-sm tabular-nums text-[var(--text-muted)]">
        {changeLogPage.page} / {changeLogPage.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <ChangeLogPageLink
          disabled={changeLogPage.page <= 1}
          href={createLunchBoxCountChangeLogHref({
            page: changeLogPage.page - 1,
            selectedMonth,
          })}
        >
          이전
        </ChangeLogPageLink>
        <ChangeLogPageLink
          disabled={changeLogPage.page >= changeLogPage.totalPages}
          href={createLunchBoxCountChangeLogHref({
            page: changeLogPage.page + 1,
            selectedMonth,
          })}
        >
          다음
        </ChangeLogPageLink>
      </div>
    </nav>
  );
}

function ChangeLogPageLink({
  children,
  disabled,
  href,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
}) {
  const className = buttonClass(
    buttonStyles.base,
    buttonStyles.neutral,
    "h-11 min-w-16 px-3 text-sm",
  );

  return disabled ? (
    <span aria-disabled="true" className={`${className} opacity-50`}>
      {children}
    </span>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function createLunchBoxCountChangeLogHref({
  page,
  selectedMonth,
}: {
  page: number;
  selectedMonth: string;
}) {
  const params = new URLSearchParams({ month: selectedMonth });

  if (page > 1) {
    params.set("logPage", String(page));
  }

  return `/work-schedule/lunch-boxes?${params.toString()}#${changeLogSectionId}`;
}

function formatChangeLogDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
