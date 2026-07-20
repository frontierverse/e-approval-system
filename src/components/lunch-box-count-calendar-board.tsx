"use client";

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AppModal } from "@/components/app-modal";
import { LunchBoxCountGrid } from "@/components/lunch-box-count-grid";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  createLunchBoxCalendarDays,
  formatLunchBoxDateLabel,
  formatLunchBoxMonthLabel,
  getLunchBoxCountTotal,
  getLunchBoxCurrentMonth,
  lunchBoxCalendarWeekdays,
  shiftLunchBoxMonth,
  type LunchBoxActionResult,
  type LunchBoxCountGrid as LunchBoxCountGridData,
  type LunchBoxCountMonth,
  type LunchBoxCountMonthDay,
  type LunchBoxCountRowInput,
} from "@/lib/lunch-box-counts-core";

type LunchBoxCountCalendarBoardProps = {
  loadGrid: (
    date: string,
  ) => Promise<LunchBoxActionResult<{ grid: LunchBoxCountGridData }>>;
  monthData: LunchBoxCountMonth;
  saveCounts: (
    date: string,
    rows: LunchBoxCountRowInput[],
  ) => Promise<LunchBoxActionResult<{ grid: LunchBoxCountGridData }>>;
  selectedMonth: string;
  today: string;
};

const monthNavLinkClassName =
  "inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]";
const modalCloseButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.danger,
  "h-11 shrink-0 px-3 text-sm",
);
const calendarSchoolPreviewLimit = 2;

export function LunchBoxCountCalendarBoard(
  props: LunchBoxCountCalendarBoardProps,
) {
  return (
    <LunchBoxCountCalendarBoardContent
      key={props.selectedMonth}
      {...props}
    />
  );
}

function LunchBoxCountCalendarBoardContent({
  loadGrid,
  monthData,
  saveCounts,
  selectedMonth,
  today,
}: LunchBoxCountCalendarBoardProps) {
  const [days, setDays] = useState(monthData.days);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedGrid, setSelectedGrid] =
    useState<LunchBoxCountGridData | null>(null);
  const [modalError, setModalError] = useState("");
  const [isGridDirty, setIsGridDirty] = useState(false);
  const [isGridSavePending, setIsGridSavePending] = useState(false);
  const [isGridLoading, setIsGridLoading] = useState(false);
  const gridRequestIdRef = useRef(0);

  const calendarDays = useMemo(
    () => createLunchBoxCalendarDays(selectedMonth),
    [selectedMonth],
  );
  const monthLabel = formatLunchBoxMonthLabel(selectedMonth);
  const monthTotal = useMemo(
    () =>
      calendarDays.reduce(
        (sum, day) =>
          day.isCurrentMonth ? sum + (days[day.date]?.totalCount ?? 0) : sum,
        0,
      ),
    [calendarDays, days],
  );
  const previousMonth = shiftLunchBoxMonth(selectedMonth, -1);
  const nextMonth = shiftLunchBoxMonth(selectedMonth, 1);
  const currentMonth = getLunchBoxCurrentMonth();

  function openDayModal(date: string) {
    setSelectedDate(date);
    setSelectedGrid(null);
    setModalError("");
    setIsGridDirty(false);
    setIsGridSavePending(false);
    setIsGridLoading(true);
    const requestId = ++gridRequestIdRef.current;

    void (async () => {
      try {
        const result = await loadGrid(date);

        if (requestId !== gridRequestIdRef.current) {
          return;
        }

        if (!result.ok) {
          setModalError(result.error);
          return;
        }

        setSelectedGrid(result.data.grid);
      } catch {
        if (requestId === gridRequestIdRef.current) {
          setModalError("도시락 개수를 불러오지 못했습니다. 다시 시도하세요.");
        }
      } finally {
        if (requestId === gridRequestIdRef.current) {
          setIsGridLoading(false);
        }
      }
    })();
  }

  function openDayModalWithKeyboard(
    event: KeyboardEvent<HTMLDivElement>,
    date: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openDayModal(date);
  }

  function closeDayModal() {
    if (isGridSavePending) {
      return;
    }

    if (
      isGridDirty &&
      !window.confirm("저장하지 않은 도시락 개수 변경사항을 버릴까요?")
    ) {
      return;
    }

    gridRequestIdRef.current += 1;
    setSelectedDate(null);
    setSelectedGrid(null);
    setModalError("");
    setIsGridDirty(false);
    setIsGridSavePending(false);
    setIsGridLoading(false);
  }

  function applySavedGrid(grid: LunchBoxCountGridData) {
    setIsGridDirty(false);
    setDays((currentDays) => {
      const schools = grid.rows.flatMap((row) => {
        const total = getLunchBoxCountTotal(row);

        if (total === 0) {
          return [];
        }

        return [
          {
            schoolId: row.schoolId,
            schoolName: row.schoolName,
            schoolType: row.schoolType,
            total,
          },
        ];
      });
      const nextDays = { ...currentDays };

      if (schools.length === 0) {
        delete nextDays[grid.date];
        return nextDays;
      }

      const day: LunchBoxCountMonthDay = {
        date: grid.date,
        totalCount: schools.reduce((sum, school) => sum + school.total, 0),
        schools,
      };

      nextDays[grid.date] = day;
      return nextDays;
    });
  }

  return (
    <section aria-label={`${monthLabel} 도시락 현황`}>
      <div className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#eef1f5] px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#16181d]">
              {monthLabel}
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              월 총계 {monthTotal.toLocaleString("ko-KR")}개
              (보존식·배송기사 포함) · 날짜를 누르면 학교별 개수를 입력할 수
              있습니다.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
            <Link
              href={createLunchBoxMonthHref(previousMonth)}
              className={monthNavLinkClassName}
            >
              이전 달
            </Link>
            <Link
              href={createLunchBoxMonthHref(nextMonth)}
              className={monthNavLinkClassName}
            >
              다음 달
            </Link>
            <Link
              href={createLunchBoxMonthHref(currentMonth)}
              className={monthNavLinkClassName}
            >
              이번 달
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 text-sm">
            {lunchBoxCalendarWeekdays.map((weekday) => (
              <div
                key={weekday.value}
                className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-center text-xs font-semibold text-[#394150]"
              >
                {weekday.label}
              </div>
            ))}

            {calendarDays.map((day) => {
              const dayData = days[day.date];
              const visibleSchools =
                dayData?.schools.slice(0, calendarSchoolPreviewLimit) ?? [];
              const hiddenSchoolCount = Math.max(
                0,
                (dayData?.schools.length ?? 0) - visibleSchools.length,
              );

              return (
                <div
                  key={day.date}
                  aria-label={`${formatLunchBoxDateLabel(day.date)} 도시락 개수 입력`}
                  className={[
                    "group h-36 cursor-pointer overflow-hidden border-b border-r border-[#eef1f5] px-2.5 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]",
                    day.isCurrentMonth
                      ? "bg-white hover:bg-[#f0f8f7]"
                      : "bg-[#f7f9fc] hover:bg-[#eef4f3]",
                  ].join(" ")}
                  onClick={() => openDayModal(day.date)}
                  onKeyDown={(event) =>
                    openDayModalWithKeyboard(event, day.date)
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={[
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition",
                        day.isToday
                          ? "bg-[#196b69] text-white"
                          : day.isCurrentMonth
                            ? "text-[#16181d]"
                            : "text-[#8a95a6]",
                      ].join(" ")}
                    >
                      {day.day}
                    </span>
                    {dayData ? (
                      <span className="mt-1 inline-flex shrink-0 items-center rounded-full bg-[#eef7f6] px-2 py-0.5 text-xs font-semibold text-[#196b69]">
                        {dayData.totalCount.toLocaleString("ko-KR")}개
                      </span>
                    ) : null}
                  </div>

                  {dayData ? (
                    <ul className="mt-2 space-y-1">
                      {visibleSchools.map((school) => (
                        <li
                          key={school.schoolId}
                          className="flex items-center justify-between gap-2 rounded-md border border-[#d6e6e4] bg-[#f5fbfa] px-2 py-1 text-xs text-[#1f3f3d]"
                        >
                          <span className="truncate">{school.schoolName}</span>
                          <span className="shrink-0 font-semibold">
                            {school.total}
                          </span>
                        </li>
                      ))}
                      {hiddenSchoolCount > 0 ? (
                        <li className="rounded-md bg-[#eef1f5] px-2 py-1 text-center text-xs font-semibold text-[#566174]">
                          외 {hiddenSchoolCount.toLocaleString("ko-KR")}곳
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDate ? (
        <AppModal
          className="max-w-7xl"
          label={`${formatLunchBoxDateLabel(selectedDate)} 도시락 개수 입력`}
          mobileFullscreen
          onClose={closeDayModal}
        >
          <div className="flex h-dvh min-h-0 flex-col p-0 sm:h-[calc(100dvh-3rem)] sm:p-4">
            <div className="min-h-0 flex-1">
              {modalError ? (
                <LunchBoxCountGridError
                  date={selectedDate}
                  error={modalError}
                  onClose={closeDayModal}
                />
              ) : isGridLoading || !selectedGrid ? (
                <LunchBoxCountGridSkeleton
                  date={selectedDate}
                  onClose={closeDayModal}
                />
              ) : (
                <LunchBoxCountGrid
                  initialGrid={selectedGrid}
                  isCloseDisabled={isGridSavePending}
                  loadGrid={loadGrid}
                  onClose={closeDayModal}
                  onDirtyChange={setIsGridDirty}
                  onGridLoaded={(loadedGrid) =>
                    setSelectedDate(loadedGrid.date)
                  }
                  onGridSaved={applySavedGrid}
                  onSavePendingChange={setIsGridSavePending}
                  saveCounts={saveCounts}
                  today={today}
                />
              )}
            </div>
          </div>
        </AppModal>
      ) : null}
    </section>
  );
}

function LunchBoxCountGridError({
  date,
  error,
  onClose,
}: {
  date: string;
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white sm:rounded-md sm:border sm:border-[#d9dee7] sm:shadow-sm">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eef1f5] px-3 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#16181d]">
            일자별 도시락 개수
          </h2>
          <p className="mt-1 text-xs tabular-nums text-[#697386] sm:text-sm">
            {formatLunchBoxDateLabel(date)} 기준
          </p>
        </div>
        <button
          type="button"
          data-modal-initial-focus
          className={modalCloseButtonClassName}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <p
          className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]"
          role="alert"
        >
          {error}
        </p>
      </div>
    </div>
  );
}

function LunchBoxCountGridSkeleton({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white sm:rounded-md sm:border sm:border-[#d9dee7]">
      <span className="sr-only" role="status">
        {formatLunchBoxDateLabel(date)} 도시락 개수를 불러오는 중입니다.
      </span>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eef1f5] px-3 py-3 sm:px-5 sm:py-4">
        <div aria-hidden="true" className="min-w-0 flex-1">
          <div className="h-5 w-36 rounded bg-[#edf1f5] motion-safe:animate-pulse" />
          <div className="mt-2 h-4 w-full max-w-64 rounded bg-[#edf1f5] motion-safe:animate-pulse" />
        </div>
        <button
          type="button"
          data-modal-initial-focus
          className={modalCloseButtonClassName}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <div
        aria-hidden="true"
        className="min-h-0 flex-1 overflow-hidden px-3 pb-3 sm:px-5 sm:pb-4"
      >
        <div className="grid min-w-[720px] grid-cols-[9rem_repeat(8,4rem)] border-b border-[#eef1f5] py-3 text-center text-xs font-semibold text-[#697386] sm:min-w-[900px] sm:grid-cols-[2fr_repeat(8,1fr)]">
          <span className="text-left">학교명</span>
          <span>보존식</span>
          <span>배송기사</span>
          <span>1반</span>
          <span>2반</span>
          <span>3반</span>
          <span>4반</span>
          <span>연계형</span>
          <span>합계</span>
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="grid min-w-[720px] grid-cols-[9rem_repeat(8,4rem)] items-center border-b border-[#f3f5f8] py-1 sm:min-w-[900px] sm:grid-cols-[2fr_repeat(8,1fr)] sm:gap-3 sm:py-2"
          >
            <div className="h-8 w-28 rounded bg-[#edf1f5] motion-safe:animate-pulse sm:w-32" />
            {Array.from({ length: 8 }, (_, cellIndex) => (
              <div
                key={cellIndex}
                className="mx-auto h-11 w-12 rounded bg-[#edf1f5] motion-safe:animate-pulse sm:w-14"
              />
            ))}
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between border-t border-[#eef1f5] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4"
      >
        <div className="h-4 w-28 rounded bg-[#edf1f5] motion-safe:animate-pulse" />
        <div className="h-11 w-16 rounded bg-[#edf1f5] motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

function createLunchBoxMonthHref(month: string) {
  return `/work-schedule/lunch-boxes?month=${month}`;
}
