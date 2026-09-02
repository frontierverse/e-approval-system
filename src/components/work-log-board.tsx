"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type ChangeEvent,
} from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  buildWorkLogContributionWeeks,
  formatWorkLogDateLabel,
  getWorkLogContributionRange,
  getWorkLogMonthLabels,
  isWorkLogDate,
  workLogContentMaxLength,
  workLogKeywordMaxLength,
  type WorkLogEntry,
  type WorkLogFormState,
} from "@/lib/work-log-core";

const initialWorkLogFormState: WorkLogFormState = {};

type SaveWorkLogAction = (
  previousState: WorkLogFormState,
  formData: FormData,
) => Promise<WorkLogFormState>;

export function WorkLogBoard({
  contributionDates,
  recentLogs,
  saveAction,
  selectedDate,
  selectedLog,
  today,
}: {
  contributionDates: string[];
  recentLogs: WorkLogEntry[];
  saveAction: SaveWorkLogAction;
  selectedDate: string;
  selectedLog: WorkLogEntry | null;
  today: string;
}) {
  return (
    <div className="space-y-4">
      <WorkLogContributionGraph
        recordedDates={contributionDates}
        today={today}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]">
        <WorkLogEntryForm
          existingLog={selectedLog}
          saveAction={saveAction}
          selectedDate={selectedDate}
          today={today}
        />
        <WorkLogRecentList
          entries={recentLogs}
          selectedDate={selectedDate}
        />
      </div>
    </div>
  );
}

export function WorkLogContributionGraph({
  recordedDates,
  today,
}: {
  recordedDates: string[];
  today: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weeks = useMemo(
    () => buildWorkLogContributionWeeks({ recordedDates, today }),
    [recordedDates, today],
  );
  const monthLabels = useMemo(() => getWorkLogMonthLabels(weeks), [weeks]);
  const recordedDateSet = useMemo(
    () => new Set(recordedDates.filter((date) => date <= today)),
    [recordedDates, today],
  );
  const { endDate, startDate } = getWorkLogContributionRange(today);
  const recordedDateLabels = [...recordedDateSet]
    .sort()
    .map(formatWorkLogDateLabel);

  useEffect(() => {
    const scrollArea = scrollRef.current;

    if (scrollArea) {
      scrollArea.scrollLeft = scrollArea.scrollWidth;
    }
  }, [today]);

  return (
    <section
      aria-labelledby="work-log-contribution-title"
      className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="work-log-contribution-title"
            className="text-base font-semibold text-[var(--foreground)]"
          >
            최근 1년 업무일지
          </h2>
          <p className="mt-0.5 text-sm tabular-nums text-[var(--text-muted)]">
            {recordedDateSet.size}일 기록
          </p>
        </div>
        <div
          aria-label="업무일지 잔디 범례"
          className="flex items-center gap-2 text-xs text-[var(--text-muted)]"
        >
          <span>없음</span>
          <span
            aria-hidden="true"
            className="size-3 rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)]"
          />
          <span
            aria-hidden="true"
            className="size-3 rounded-[2px] border border-[var(--brand)] bg-[var(--brand)]"
          />
          <span>작성 있음</span>
        </div>
      </header>

      <div className="px-4 py-3 sm:px-5">
        <div
          ref={scrollRef}
          aria-label={`${formatWorkLogDateLabel(startDate)}부터 ${formatWorkLogDateLabel(
            today,
          )}까지 업무일지 잔디 가로 스크롤 영역. ${recordedDateSet.size}일 기록.`}
          role="img"
          tabIndex={0}
          className="scrollbar-stable overflow-x-auto rounded-sm pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <div
            aria-hidden="true"
            className="grid w-max"
            style={{
              columnGap: "0.1875rem",
              gridTemplateColumns: "1.5rem repeat(53, 0.6875rem)",
              gridTemplateRows: "1rem repeat(7, 0.6875rem)",
              rowGap: "0.1875rem",
            }}
          >
            {monthLabels.map((month) => (
              <span
                key={`${month.label}-${month.weekIndex}`}
                className="truncate text-[10px] font-medium leading-4 text-[var(--text-muted)]"
                style={{
                  gridColumn: `${month.weekIndex + 2} / span 4`,
                  gridRow: 1,
                }}
              >
                {month.label}
              </span>
            ))}

            {[
              { label: "월", weekday: 1 },
              { label: "수", weekday: 3 },
              { label: "금", weekday: 5 },
            ].map((item) => (
              <span
                key={item.label}
                className="text-[10px] leading-[0.6875rem] text-[var(--text-muted)]"
                style={{ gridColumn: 1, gridRow: item.weekday + 2 }}
              >
                {item.label}
              </span>
            ))}

            {weeks.flatMap((week) =>
              week.days.map((day) => (
                <span
                  key={day.date}
                  title={
                    day.future
                      ? undefined
                      : `${formatWorkLogDateLabel(day.date)} · ${
                          day.recorded ? "업무일지 작성" : "기록 없음"
                        }`
                  }
                  className={[
                    "size-[0.6875rem] rounded-[2px] border",
                    day.future
                      ? "border-transparent bg-transparent"
                      : day.recorded
                        ? "border-[var(--brand)] bg-[var(--brand)]"
                        : "border-[var(--border)] bg-[var(--surface-muted)]",
                  ].join(" ")}
                  style={{
                    gridColumn: week.weekIndex + 2,
                    gridRow: day.weekday + 2,
                  }}
                />
              )),
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)] sm:hidden">
          최근 날짜가 보이도록 오른쪽 끝에서 시작합니다. 좌우로 스크롤할 수 있습니다.
        </p>
        <p className="sr-only">
          표시 범위는 {formatWorkLogDateLabel(startDate)}부터 {formatWorkLogDateLabel(endDate)}까지이며,
          기록된 날짜는 {recordedDateLabels.length > 0 ? recordedDateLabels.join(", ") : "없습니다"}.
        </p>
      </div>
    </section>
  );
}

function WorkLogEntryForm({
  existingLog,
  saveAction,
  selectedDate,
  today,
}: {
  existingLog: WorkLogEntry | null;
  saveAction: SaveWorkLogAction;
  selectedDate: string;
  today: string;
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [isDatePending, startDateTransition] = useTransition();
  const [state, formAction, pending] = useActionState(
    saveAction,
    initialWorkLogFormState,
  );
  const keyword = state.values?.keyword ?? existingLog?.keyword ?? "";
  const content = state.values?.content ?? existingLog?.content ?? "";
  const savedKeyword = state.success
    ? (state.values?.keyword ?? existingLog?.keyword ?? "")
    : (existingLog?.keyword ?? "");
  const savedContent = state.success
    ? (state.values?.content ?? existingLog?.content ?? "")
    : (existingLog?.content ?? "");

  useEffect(() => {
    if (state.error) {
      errorRef.current?.focus();
    }
  }, [state.error]);

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDate = event.currentTarget.value;

    if (!isWorkLogDate(nextDate) || nextDate > today) {
      return;
    }

    const form = event.currentTarget.form;
    const currentValues = form ? new FormData(form) : null;
    const hasUnsavedChanges =
      String(currentValues?.get("keyword") ?? "").trim() !== savedKeyword ||
      String(currentValues?.get("content") ?? "").trim() !== savedContent;

    if (
      hasUnsavedChanges &&
      !window.confirm(
        "작성 중인 키워드와 내용이 사라집니다. 다른 날짜로 이동할까요?",
      )
    ) {
      event.currentTarget.value = selectedDate;
      return;
    }

    startDateTransition(() => {
      router.replace(
        `/work-schedule/work-log?date=${encodeURIComponent(nextDate)}`,
        { scroll: false },
      );
    });
  }

  return (
    <section
      aria-labelledby="work-log-form-title"
      className="rounded-md border border-[var(--border)] bg-[var(--surface)]"
    >
      <header className="border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2
            id="work-log-form-title"
            className="text-base font-semibold text-[var(--foreground)]"
          >
            {existingLog ? "업무일지 수정" : "업무일지 작성"}
          </h2>
          <span className="inline-flex h-7 items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-semibold text-[var(--text-muted)]">
            {existingLog ? "등록됨" : "새 기록"}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          같은 날짜로 저장하면 기존 업무일지가 수정됩니다.
        </p>
      </header>

      <form action={formAction} aria-busy={pending || undefined} className="p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <label className="block min-w-0">
            <span className="block text-xs font-semibold text-[var(--text-muted)]">
              날짜 <RequiredMark />
            </span>
            <input
              aria-describedby={state.fieldErrors?.workDate ? "work-log-date-error" : undefined}
              aria-invalid={Boolean(state.fieldErrors?.workDate) || undefined}
              type="date"
              name="workDate"
              required
              max={today}
              defaultValue={state.values?.workDate ?? selectedDate}
              onChange={handleDateChange}
              className="mt-2 h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm tabular-nums text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
            {state.fieldErrors?.workDate ? (
              <FieldError id="work-log-date-error">
                {state.fieldErrors.workDate}
              </FieldError>
            ) : null}
          </label>

          <label className="block min-w-0">
            <span className="block text-xs font-semibold text-[var(--text-muted)]">
              키워드 <RequiredMark />
            </span>
            <input
              aria-describedby={state.fieldErrors?.keyword ? "work-log-keyword-error" : undefined}
              aria-invalid={Boolean(state.fieldErrors?.keyword) || undefined}
              type="text"
              name="keyword"
              required
              maxLength={workLogKeywordMaxLength}
              defaultValue={keyword}
              placeholder="예: 월간 보고서 작성"
              className="mt-2 h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[#9aa4b2] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
            {state.fieldErrors?.keyword ? (
              <FieldError id="work-log-keyword-error">
                {state.fieldErrors.keyword}
              </FieldError>
            ) : null}
          </label>
        </div>

        <label className="mt-4 block min-w-0">
          <span className="block text-xs font-semibold text-[var(--text-muted)]">
            내용 <RequiredMark />
          </span>
          <textarea
            aria-describedby={state.fieldErrors?.content ? "work-log-content-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.content) || undefined}
            name="content"
            required
            maxLength={workLogContentMaxLength}
            defaultValue={content}
            placeholder="진행한 업무, 결과, 다음에 이어서 할 내용을 기록해 주세요."
            className="mt-2 min-h-36 w-full resize-y rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[#9aa4b2] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
          />
          {state.fieldErrors?.content ? (
            <FieldError id="work-log-content-error">
              {state.fieldErrors.content}
            </FieldError>
          ) : null}
        </label>

        {state.error ? (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f] dark:border-[#f851498c] dark:bg-[#da363329] dark:text-[#ff7b72]"
          >
            {state.error}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="min-h-5 text-sm">
            {isDatePending ? (
              <p className="text-[var(--text-muted)]">선택한 날짜를 불러오는 중입니다.</p>
            ) : state.success ? (
              <p className="font-medium text-[var(--brand)]">{state.success}</p>
            ) : (
              <p className="text-[var(--text-muted)]">
                날짜별로 1건의 업무일지가 저장됩니다.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending || isDatePending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-11 w-full px-5 text-sm sm:w-auto",
            )}
          >
            {pending
              ? "저장 중"
              : existingLog
                ? "수정 내용 저장"
                : "업무일지 등록"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function WorkLogRecentList({
  entries,
  selectedDate,
}: {
  entries: WorkLogEntry[];
  selectedDate: string;
}) {
  return (
    <section
      aria-labelledby="recent-work-log-title"
      className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]"
    >
      <header className="border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <h2
          id="recent-work-log-title"
          className="text-base font-semibold text-[var(--foreground)]"
        >
          최근 업무일지
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {entries.length > 0
            ? `최근 ${entries.length}일의 기록입니다.`
            : "등록된 업무일지가 없습니다."}
        </p>
      </header>

      {entries.length > 0 ? (
        <ol className="divide-y divide-[var(--border)]">
          {entries.map((entry) => {
            const selected = entry.workDate === selectedDate;

            return (
              <li key={entry.id}>
                <Link
                  href={`/work-schedule/work-log?date=${encodeURIComponent(entry.workDate)}`}
                  aria-current={selected ? "page" : undefined}
                  aria-label={`${formatWorkLogDateLabel(entry.workDate)} ${entry.keyword} 업무일지 불러오기`}
                  scroll={false}
                  className={[
                    "grid min-h-[4.5rem] min-w-0 gap-1 px-4 py-3 transition hover:bg-[var(--surface-hover)] sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4 sm:px-5",
                    selected ? "bg-[var(--brand-soft)]" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <time
                    dateTime={entry.workDate}
                    className="text-xs font-semibold tabular-nums text-[var(--text-muted)] sm:pt-0.5"
                  >
                    {formatWorkLogDateLabel(entry.workDate)}
                  </time>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                      {entry.keyword}
                    </span>
                    <span className="mt-1 line-clamp-2 block whitespace-pre-wrap break-words text-sm leading-5 text-[var(--text-muted)] [overflow-wrap:anywhere]">
                      {entry.content}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-4 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)] sm:m-5">
          왼쪽 입력란에서 첫 업무일지를 등록해 보세요.
        </p>
      )}
    </section>
  );
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-1 text-[var(--danger)]">
        *
      </span>
      <span className="sr-only">필수</span>
    </>
  );
}

function FieldError({
  children,
  id,
}: {
  children: React.ReactNode;
  id: string;
}) {
  return (
    <span id={id} className="mt-1 block text-xs text-[var(--danger)]">
      {children}
    </span>
  );
}
