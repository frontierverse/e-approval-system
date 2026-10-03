"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent } from "react";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";
import { UserIdentity } from "@/components/user-identity";
import type {
  WorkSchedule,
  WorkScheduleChangeLog,
  WorkScheduleChangeLogActor,
  WorkScheduleChangeLogFilters,
  WorkScheduleChangeLogsResult,
} from "@/lib/work-schedules";
import {
  createWorkScheduleCalendarDays,
  formatWorkScheduleDateLabel,
  formatWorkScheduleMonthLabel,
  getWorkScheduleCurrentMonth,
  getWorkScheduleMonthFromDate,
  shiftWorkScheduleMonth,
  isWorkScheduleDate,
  workScheduleCalendarWeekdays,
} from "@/lib/work-schedule-calendar";
import type { WorkScheduleBaseline } from "@/lib/work-schedule-mutations";
import type { YouthActionResult } from "@/lib/youth-management-core";
import {
  getYouthLearningScheduleEndMinute,
  getYouthLearningScheduleStartMinute,
  youthLearningScheduleMinuteStep,
  youthLearningScheduleStartHour,
} from "@/lib/youth-management-core";

type WorkScheduleCalendarBoardProps = {
  changeLogActors: WorkScheduleChangeLogActor[];
  changeLogFilterControls?: React.ReactNode;
  changeLogFilters: WorkScheduleChangeLogFilters;
  changeLogs: WorkScheduleChangeLog[];
  deleteSchedule: (
    scheduleDate: string,
    startMinute: number,
    baseline?: WorkScheduleBaseline,
  ) => Promise<YouthActionResult<{ scheduleDate: string; startMinute: number }>>;
  loadChangeLogs?: (
    filters: Pick<
      WorkScheduleChangeLogFilters,
      "actorId" | "page" | "scheduleDate"
    >,
  ) => Promise<
    YouthActionResult<{ changeLogResult: WorkScheduleChangeLogsResult }>
  >;
  saveSchedule: (
    scheduleDate: string,
    startMinute: number,
    endMinute: number,
    content: string,
    sourceScheduleDate?: string,
    sourceStartMinute?: number,
    baseline?: WorkScheduleBaseline,
  ) => Promise<YouthActionResult<{ schedule: WorkSchedule | null }>>;
  schedules: WorkSchedule[];
  selectedMonth: string;
};

type SelectedScheduleCell = {
  scheduleDate: string;
  scheduleId?: string;
  startMinute: number;
  schedule: WorkSchedule | null;
  baseline: WorkScheduleBaseline;
  initial: { scheduleDate: string; startMinute: number; endMinute: number; content: string };
};

const defaultWorkStartMinute = getYouthLearningScheduleStartMinute(
  youthLearningScheduleStartHour,
);

export function WorkScheduleCalendarBoard(
  props: WorkScheduleCalendarBoardProps,
) {
  return <WorkScheduleCalendarBoardContent key={props.selectedMonth} {...props} />;
}

function WorkScheduleCalendarBoardContent({
  changeLogActors,
  changeLogFilterControls,
  changeLogFilters,
  changeLogs,
  deleteSchedule,
  loadChangeLogs,
  saveSchedule,
  schedules,
  selectedMonth,
}: WorkScheduleCalendarBoardProps) {
  const [scheduleItems, setScheduleItems] = useState(schedules);
  const [requiresScheduleReview, setRequiresScheduleReview] = useState(false);
  const scheduleReviewLock = useRef(false);
  const latestSchedules = useRef(schedules);
  useLayoutEffect(() => { latestSchedules.current = schedules; }, [schedules]);
  const actionLock = useRef(false);
  const alive = useRef(true);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [previousSchedules, setPreviousSchedules] = useState(schedules);
  if (previousSchedules !== schedules) { setPreviousSchedules(schedules); setScheduleItems(schedules); }
  const [selectedCell, setSelectedCell] = useState<SelectedScheduleCell | null>(
    null,
  );
  const [scheduleDateDraft, setScheduleDateDraft] = useState(
    `${selectedMonth}-01`,
  );
  const [dateJumpDraft, setDateJumpDraft] = useState(`${selectedMonth}-01`);
  const [startMinuteDraft, setStartMinuteDraft] =
    useState(defaultWorkStartMinute);
  const [endMinuteDraft, setEndMinuteDraft] = useState(
    defaultWorkStartMinute + 60,
  );
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingScheduleAction, startPendingScheduleAction] = useTransition();
  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);
  const [changeLogState, setChangeLogState] = useState({
    filters: changeLogFilters,
    logs: changeLogs,
  });
  const [changeLogError, setChangeLogError] = useState("");
  const [pendingChangeLogPage, setPendingChangeLogPage] = useState<
    number | null
  >(null);
  const [isChangeLogPending, startChangeLogTransition] = useTransition();

  const days = useMemo(
    () => createWorkScheduleCalendarDays(selectedMonth),
    [selectedMonth],
  );
  const schedulesByDate = useMemo(() => {
    const nextMap = new Map<string, WorkSchedule[]>();

    for (const schedule of scheduleItems) {
      const currentSchedules = nextMap.get(schedule.scheduleDate) ?? [];
      currentSchedules.push(schedule);
      nextMap.set(schedule.scheduleDate, currentSchedules);
    }

    for (const currentSchedules of nextMap.values()) {
      currentSchedules.sort(sortWorkScheduleItems);
    }

    return nextMap;
  }, [scheduleItems]);
  const scheduleMap = useMemo(
    () => createEditableWorkScheduleMap(scheduleItems),
    [scheduleItems],
  );
  const scheduleIdMap = useMemo(() => {
    const nextMap = new Map<string, WorkSchedule>();

    for (const schedule of scheduleItems) {
      nextMap.set(schedule.id, schedule);
    }

    return nextMap;
  }, [scheduleItems]);
  // Manual edits keep their captured CAS baseline; linked details must still exist in the fresh list.
  const selectedScheduleReadOnly = Boolean(selectedCell?.schedule?.readOnly);
  const freshLinkedSchedule = selectedCell?.scheduleId ? scheduleIdMap.get(selectedCell.scheduleId) : undefined;
  const selectedSchedule = selectedScheduleReadOnly
    ? freshLinkedSchedule?.readOnly && freshLinkedSchedule.scheduleDate === selectedCell?.scheduleDate ? freshLinkedSchedule : undefined
    : selectedCell?.schedule ?? undefined;
  const previousMonth = shiftWorkScheduleMonth(selectedMonth, -1);
  const nextMonth = shiftWorkScheduleMonth(selectedMonth, 1);
  const currentMonth = getWorkScheduleCurrentMonth();
  const monthLabel = formatWorkScheduleMonthLabel(selectedMonth);
  const currentChangeLogFilters = changeLogState.filters;
  const currentChangeLogs = changeLogState.logs;

  const loadChangeLogPage = useCallback(
    (
      page: number,
      options?: {
        filters?: Pick<
          WorkScheduleChangeLogFilters,
          "actorId" | "page" | "scheduleDate"
        >;
        updateHistory?: boolean;
      },
    ) => {
      if (!loadChangeLogs) {
        return;
      }

      const nextFilters = {
        actorId: options?.filters?.actorId ?? changeLogState.filters.actorId,
        page,
        scheduleDate:
          options?.filters?.scheduleDate ?? changeLogState.filters.scheduleDate,
      };
      const updateHistory = options?.updateHistory ?? true;

      setPendingChangeLogPage(page);
      startChangeLogTransition(async () => {
        try {
          const result = await loadChangeLogs(nextFilters);

          if (!result.ok) {
            setChangeLogError(result.error);
            return;
          }

          const { changeLogResult } = result.data;

          setChangeLogState({
            filters: {
              actorId: changeLogResult.actorId,
              page: changeLogResult.page,
              pageSize: changeLogResult.pageSize,
              scheduleDate: changeLogResult.scheduleDate,
              total: changeLogResult.total,
              totalPages: changeLogResult.totalPages,
            },
            logs: changeLogResult.logs,
          });
          setChangeLogError("");

          if (updateHistory) {
            window.history.pushState(
              { workScheduleLogPage: changeLogResult.page },
              "",
              createChangeLogHref({
                actorId: changeLogResult.actorId,
                page: changeLogResult.page,
                scheduleDate: changeLogResult.scheduleDate,
                selectedMonth,
              }),
            );
          }
        } finally {
          setPendingChangeLogPage(null);
        }
      });
    },
    [
      changeLogState.filters.actorId,
      changeLogState.filters.scheduleDate,
      loadChangeLogs,
      selectedMonth,
    ],
  );

  useEffect(() => {
    if (!loadChangeLogs) {
      return;
    }

    function loadFromHistory() {
      const filters = getWorkScheduleChangeLogFiltersFromLocation();

      loadChangeLogPage(filters.page, {
        filters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [loadChangeLogPage, loadChangeLogs]);

  function openScheduleModal(
    scheduleDate: string,
    startMinute?: number,
    scheduleId?: string,
  ) {
    if (actionLock.current || pendingScheduleAction || !alive.current) return;
    const selectedStartMinute =
      startMinute ?? getDefaultStartMinuteForDate(scheduleDate, scheduleItems);
    const schedule = scheduleId
      ? scheduleIdMap.get(scheduleId)
      : startMinute === undefined
        ? undefined
        : scheduleMap.get(createScheduleKey(scheduleDate, startMinute));

    scheduleReviewLock.current = false; setRequiresScheduleReview(false);
    setSelectedCell({
      scheduleDate,
      scheduleId: schedule?.id,
      startMinute: schedule?.startMinute ?? selectedStartMinute,
      schedule: schedule ?? null,
      baseline: { manualScheduleId: schedule && !schedule.readOnly ? schedule.id : null, expectedUpdatedAt: schedule?.updatedAt ?? "" },
      initial: { scheduleDate: schedule?.scheduleDate ?? scheduleDate, startMinute: schedule?.startMinute ?? selectedStartMinute, endMinute: schedule?.endMinute ?? Math.min(selectedStartMinute + 60, getYouthLearningScheduleEndMinute()), content: schedule?.content ?? "" },
    });
    setScheduleDateDraft(schedule?.scheduleDate ?? scheduleDate);
    setStartMinuteDraft(schedule?.startMinute ?? selectedStartMinute);
    setEndMinuteDraft(
      schedule?.endMinute ??
        Math.min(selectedStartMinute + 60, getYouthLearningScheduleEndMinute()),
    );
    setScheduleDraft(schedule?.content ?? "");
    setFormError("");
  }

  function resetScheduleModal() {
    scheduleReviewLock.current = false; setRequiresScheduleReview(false);
    setSelectedCell(null);
    setScheduleDateDraft(`${selectedMonth}-01`);
    setStartMinuteDraft(defaultWorkStartMinute);
    setEndMinuteDraft(defaultWorkStartMinute + 60);
    setScheduleDraft("");
    setFormError("");
  }

  function closeScheduleModal() {
    if (actionLock.current || pendingScheduleAction || !alive.current) return;
    if (selectedCell && !selectedScheduleReadOnly) {
      const initial = selectedCell.initial;
      const dirty = scheduleDateDraft !== initial.scheduleDate || startMinuteDraft !== initial.startMinute || endMinuteDraft !== initial.endMinute || scheduleDraft !== initial.content;
      if (dirty && !window.confirm("저장하지 않은 일정 입력을 버리고 닫으시겠습니까?")) return;
    }
    resetScheduleModal();
  }

  function canMutateSchedule() {
    if (!selectedCell || selectedScheduleReadOnly || actionLock.current || scheduleReviewLock.current || pendingScheduleAction || !alive.current) return false;
    if (selectedCell.baseline.manualScheduleId !== null && !isWorkScheduleBaselineToken(selectedCell.baseline.expectedUpdatedAt)) {
      setFormError("수정 기준 시간을 확인하지 못했습니다. 최신 일정을 다시 불러오세요. 입력 내용은 유지됩니다.");
      return false;
    }
    return true;
  }

  function confirmScheduleDeletion() {
    return window.confirm(`${formatWorkScheduleDateLabel(selectedCell!.scheduleDate)} ${formatScheduleRangeLabel(selectedCell!.startMinute, selectedCell!.initial.endMinute)} 일정 ‘${selectedCell!.initial.content.slice(0, 120)}’을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.`);
  }

  function updateStartMinuteDraft(nextStartMinute: number) {
    if (actionLock.current || !alive.current) return;
    const currentDuration = Math.max(
      youthLearningScheduleMinuteStep,
      endMinuteDraft - startMinuteDraft,
    );
    const nextEndMinute = Math.min(
      getYouthLearningScheduleEndMinute(),
      nextStartMinute + currentDuration,
    );

    setStartMinuteDraft(nextStartMinute);
    setEndMinuteDraft(
      nextEndMinute > nextStartMinute
        ? nextEndMinute
        : nextStartMinute + youthLearningScheduleMinuteStep,
    );
    setFormError("");
  }

  function saveSelectedSchedule() {
    if (!canMutateSchedule() || !selectedCell) return;
    if (selectedSchedule && !scheduleDraft.trim() && !confirmScheduleDeletion()) return;
    const source = selectedCell;
    const observedSchedules = latestSchedules.current;
    actionLock.current = true;
    startPendingScheduleAction(async () => {
      try {
        const result = await saveSchedule(scheduleDateDraft, startMinuteDraft, endMinuteDraft, scheduleDraft, source.scheduleDate, source.startMinute, source.baseline);
        if (!alive.current) return;
        if (!result.ok) { setFormError(result.error); return; }
        // A server render that arrived while saving is authoritative; an older ack must not overwrite it.
        if (latestSchedules.current === observedSchedules) setScheduleItems(current => {
          const next = result.data.schedule;
          const kept = current.filter(item => item.id !== source.baseline.manualScheduleId && item.id !== next?.id);
          return next ? [...kept, next] : kept;
        });
        resetScheduleModal();
      } catch {
        if (alive.current) { scheduleReviewLock.current = true; setRequiresScheduleReview(true); setFormError("저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 최신 목록에서 반영 여부를 확인하세요. 이 작성 화면에서는 저장 요청을 다시 보내지 않습니다."); }
      } finally { actionLock.current = false; }
    });
  }

  function removeSelectedSchedule() {
    if (!canMutateSchedule() || !selectedCell || !selectedSchedule || !confirmScheduleDeletion()) return;
    const source = selectedCell;
    actionLock.current = true;
    startPendingScheduleAction(async () => {
      try {
        const result = await deleteSchedule(source.scheduleDate, source.startMinute, source.baseline);
        if (!alive.current) return;
        if (!result.ok) { setFormError(result.error); return; }
        // Never remove a replacement record at the same date and time from the local list.
        setScheduleItems(current => current.filter(item => item.id !== source.baseline.manualScheduleId));
        resetScheduleModal();
      } catch {
        if (alive.current) { scheduleReviewLock.current = true; setRequiresScheduleReview(true); setFormError("삭제 결과를 확인하지 못했습니다. 최신 목록에서 반영 여부를 확인하세요. 이 작성 화면에서는 삭제·저장 요청을 다시 보내지 않습니다."); }
      } finally { actionLock.current = false; }
    });
  }

  function jumpToDate(nextScheduleDate: string) {
    setDateJumpDraft(nextScheduleDate);

    if (!isWorkScheduleDate(nextScheduleDate)) {
      setFormError("이동할 날짜를 다시 선택하세요.");
      return;
    }

    setFormError("");
    window.location.href = createWorkScheduleMonthHref(
      getWorkScheduleMonthFromDate(nextScheduleDate),
    );
  }

  function openScheduleModalWithKeyboard(
    event: KeyboardEvent<HTMLDivElement>,
    scheduleDate: string,
  ) {
    if (
      !shouldOpenWorkScheduleCellWithKeyboard(
        event.key,
        event.target === event.currentTarget,
      )
    ) {
      return;
    }

    event.preventDefault();
    openScheduleModal(scheduleDate);
  }

  function saveSelectedScheduleWithKeyboard(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if ((!event.metaKey && !event.ctrlKey) || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    saveSelectedSchedule();
  }

  return (
    <section aria-label={`${monthLabel} 업무 일정`} className="space-y-6">
      <div className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#eef1f5] px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#16181d]">
              {monthLabel}
            </h2>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Link
                href={createWorkScheduleMonthHref(previousMonth)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                이전 달
              </Link>
              <Link
                href={createWorkScheduleMonthHref(nextMonth)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                다음 달
              </Link>
              <Link
                href={createWorkScheduleMonthHref(currentMonth)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] sm:w-auto"
              >
                이번 달
              </Link>
            </div>
            <DatePickerInput
              aria-label="업무 일정 날짜 이동"
              value={dateJumpDraft}
              onChange={(event) => jumpToDate(event.currentTarget.value)}
              className="h-10 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] lg:w-40"
            />
          </div>
        </div>

        {formError ? (
          <p className="border-b border-[#f0c6c6] bg-[#fff1f1] px-4 py-2 text-sm text-[#8a1f1f]">
            {formError}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 text-sm">
            {workScheduleCalendarWeekdays.map((weekday) => (
              <div
                key={weekday.value}
                className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-center text-xs font-semibold text-[#394150]"
              >
                {weekday.label}
              </div>
            ))}

            {days.map((day) => {
              const daySchedules = schedulesByDate.get(day.date) ?? [];

              return (
                <div
                  key={day.date}
                  aria-label={`${formatWorkScheduleDateLabel(day.date)} 업무 일정 등록`}
                  className={[
                    "group min-h-[9.5rem] cursor-pointer border-b border-r border-[#eef1f5] px-2.5 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]",
                    day.isCurrentMonth
                      ? "bg-white hover:bg-[#f0f8f7]"
                      : "bg-[#f7f9fc] hover:bg-[#eef4f3]",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => openScheduleModal(day.date)}
                  onKeyDown={(event) =>
                    openScheduleModalWithKeyboard(event, day.date)
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
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {day.day}
                    </span>
                    <span
                      aria-hidden="true"
                      className="grid size-7 shrink-0 place-items-center rounded-full border border-[#b7d3d0] bg-white text-base font-semibold leading-none text-[#196b69] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                    >
                      +
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {daySchedules.map((schedule) => (
                      <button
                        key={schedule.id}
                        type="button"
                        aria-label={createWorkScheduleCardAriaLabel(schedule)}
                        onClick={(event) => {
                          event.stopPropagation();
                          openScheduleModal(
                            schedule.scheduleDate,
                            schedule.startMinute,
                            schedule.id,
                          );
                        }}
                        className={[
                          "block min-h-11 w-full rounded-md border px-2 py-1.5 text-left text-xs shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1",
                          getWorkScheduleCardClassName(schedule),
                        ].join(" ")}
                      >
                        <span className="flex min-w-0 items-center justify-between gap-1.5 font-semibold">
                          <span className="min-w-0 truncate">
                            {schedule.timeLabel ??
                              formatScheduleRangeLabel(
                                schedule.startMinute,
                                schedule.endMinute,
                              )}
                          </span>
                          {schedule.readOnly ? (
                            <span
                              aria-hidden="true"
                              className={[
                                "inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[0.625rem] font-semibold",
                                getReadOnlySchedulePresentation(schedule)
                                  .cardBadgeClassName,
                              ].join(" ")}
                            >
                              {
                                getReadOnlySchedulePresentation(schedule)
                                  .cardBadgeLabel
                              }
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 break-words leading-4 [overflow-wrap:anywhere]">
                          {schedule.content}
                        </span>
                        {schedule.detailLabel ? (
                          <span className="mt-0.5 block line-clamp-1 text-[0.6875rem] opacity-80">
                            {schedule.detailLabel}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <WorkScheduleChangeLogSection
        actors={changeLogActors}
        error={changeLogError}
        filterControls={changeLogFilterControls}
        filters={currentChangeLogFilters}
        isPending={isChangeLogPending}
        logs={currentChangeLogs}
        onPageChange={loadChangeLogs ? loadChangeLogPage : undefined}
        pendingPage={pendingChangeLogPage}
        selectedMonth={selectedMonth}
      />

      {selectedCell ? (
        <AppModal
          className="flex max-w-2xl flex-col"
          labelledBy="work-schedule-modal-title"
          onClose={closeScheduleModal}
        >
          {selectedScheduleReadOnly ? selectedSchedule ? (
            <WorkScheduleReadOnlyDetail schedule={selectedSchedule} onClose={closeScheduleModal} />
          ) : (
            <div className="p-4">
              <h3 id="work-schedule-modal-title" className="text-base font-semibold text-[var(--foreground)]">현재 조회할 수 없는 일정</h3>
              <p role="alert" className="mt-2 text-sm text-[var(--text-muted)]">최신 목록에 이 연동 일정이 없습니다. 예약 상태와 조회 대상을 다시 확인하세요.</p>
              <button type="button" data-modal-initial-focus="true" onClick={closeScheduleModal} className="mt-3 h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">닫기</button>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-4 pb-4 pt-4 sm:px-6">
                  <p className="text-xs font-semibold text-[#697386]">
                    {selectedSchedule ? "업무 일정 수정" : "업무 일정 등록"}
                  </p>
                  <h3
                    id="work-schedule-modal-title"
                    className="mt-2 break-words text-2xl font-semibold leading-tight text-[#16181d]"
                  >
                    {formatWorkScheduleDateLabel(scheduleDateDraft)}
                  </h3>

                  {formError ? (
                    <p ref={formErrorRef} role="alert" tabIndex={-1} className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                      {formError}
                    </p>
                  ) : null}
                  {requiresScheduleReview && !formError ? <p role="alert" className="mt-4 text-sm text-[var(--text-muted)]">결과가 확인되지 않았습니다. 입력은 유지되며 이 화면에서는 저장·삭제 요청을 다시 보내지 않습니다.</p> : null}
                  {formError || requiresScheduleReview ? <WorkScheduleRefreshButton disabled={pendingScheduleAction} canRefresh={() => alive.current && !actionLock.current} /> : null}

                <div className="mt-5 divide-y divide-[#eef1f5] border-y border-[#eef1f5]">
                  <label className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <span className="text-sm font-medium text-[#697386]">
                      날짜
                    </span>
                    <DatePickerInput
                      value={scheduleDateDraft}
                      disabled={pendingScheduleAction}
                      onChange={(event) => {
                        if (actionLock.current || !alive.current) return;
                        setScheduleDateDraft(event.currentTarget.value);
                        setFormError("");
                      }}
                      className="block h-11 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
                    />
                  </label>

                  <div className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <span className="text-sm font-medium text-[#697386]">
                      시간
                    </span>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <select
                        aria-label="시작 시간"
                        value={startMinuteDraft}
                        disabled={pendingScheduleAction}
                        onChange={(event) =>
                          updateStartMinuteDraft(
                            Number(event.currentTarget.value),
                          )
                        }
                        className="h-11 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        {createWorkScheduleStartMinuteOptions().map((minute) => (
                          <option key={minute} value={minute}>
                            {formatMinuteLabel(minute)}
                          </option>
                        ))}
                      </select>
                      <span
                        aria-hidden="true"
                        className="hidden text-center text-[#9aa4b2] sm:block"
                      >
                        -
                      </span>
                      <select
                        aria-label="종료 시간"
                        value={endMinuteDraft}
                        disabled={pendingScheduleAction}
                        onChange={(event) => {
                          if (actionLock.current || !alive.current) return;
                          setEndMinuteDraft(Number(event.currentTarget.value));
                          setFormError("");
                        }}
                        className="h-11 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        {createWorkScheduleEndMinuteOptions(startMinuteDraft).map(
                          (minute) => (
                            <option key={minute} value={minute}>
                              {formatMinuteLabel(minute)}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <textarea
                  aria-label="업무 내용"
                  data-modal-plain-body="true"
                  value={scheduleDraft}
                  disabled={pendingScheduleAction}
                  onChange={(event) => {
                    if (actionLock.current || !alive.current) return;
                    setScheduleDraft(event.currentTarget.value);
                    setFormError("");
                  }}
                  onKeyDown={saveSelectedScheduleWithKeyboard}
                  autoFocus
                  placeholder="업무 내용을 입력하세요."
                  rows={7}
                  className="mt-4 block min-h-[10rem] w-full resize-y border-0 bg-transparent px-0 py-0 text-base leading-7 text-[#16181d] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 placeholder:text-[#a5afbd] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#eef1f5] bg-white px-5 py-4">
              <div>
                {selectedSchedule ? (
                  <button
                    type="button"
                    disabled={pendingScheduleAction || requiresScheduleReview}
                    onClick={removeSelectedSchedule}
                    className="h-11 rounded-md border border-[#f0c6c6] bg-white px-4 text-sm font-semibold text-[#a23a3a] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pendingScheduleAction}
                  onClick={closeScheduleModal}
                  className="h-11 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={pendingScheduleAction || requiresScheduleReview}
                  onClick={saveSelectedSchedule}
                  className="h-11 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#0f5553] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingScheduleAction ? "저장 중" : requiresScheduleReview ? "결과 확인 필요" : "저장"}
                </button>
              </div>
            </footer>
            </>
          )}
        </AppModal>
      ) : null}
    </section>
  );
}

export function WorkScheduleReadOnlyDetail({
  onClose,
  schedule,
}: {
  onClose: () => void;
  schedule: WorkSchedule;
}) {
  const presentation = getReadOnlySchedulePresentation(schedule);
  const timeLabel = presentation.isHospitalAppointment
    ? schedule.timeLabel
    : (schedule.timeLabel ?? "휴가");

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 pb-6 pt-6">
          <p
            className={`text-xs font-semibold ${presentation.eyebrowClassName}`}
          >
            {presentation.eyebrow}
          </p>
          <h3
            id="work-schedule-modal-title"
            className="mt-2 break-words text-2xl font-semibold leading-tight text-[var(--foreground)]"
          >
            {formatWorkScheduleDateLabel(schedule.scheduleDate)}{" "}
            {presentation.title}
          </h3>
          <dl className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
            <div className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr]">
              <dt className="font-medium text-[var(--text-muted)]">
                {presentation.contentLabel}
              </dt>
              <dd className="break-words font-semibold text-[var(--foreground)] [overflow-wrap:anywhere]">
                {schedule.content}
              </dd>
            </div>
            {schedule.detailLabel ? (
              <div className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr]">
                <dt className="font-medium text-[var(--text-muted)]">
                  {presentation.detailLabel}
                </dt>
                <dd className="break-words text-[var(--foreground)] [overflow-wrap:anywhere]">
                  {schedule.detailLabel}
                </dd>
              </div>
            ) : null}
            {timeLabel ? (
              <div className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr] sm:items-center">
                <dt className="font-medium text-[var(--text-muted)]">
                  {presentation.timeLabel}
                </dt>
                <dd>
                  <span
                    className={`inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${presentation.detailBadgeClassName}`}
                  >
                    {timeLabel}
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <button
          type="button"
          data-modal-initial-focus="true"
          onClick={onClose}
          className="h-11 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1"
        >
          닫기
        </button>
      </footer>
    </>
  );
}

function getWorkScheduleCardClassName(schedule: WorkSchedule) {
  if (!schedule.readOnly) {
    return "border-[#d6e6e4] bg-[#f5fbfa] text-[#1f3f3d] hover:border-[#7fb5ae] hover:bg-[#eaf6f4]";
  }

  return getReadOnlySchedulePresentation(schedule).cardClassName;
}

function createWorkScheduleCardAriaLabel(schedule: WorkSchedule) {
  const timeLabel =
    schedule.timeLabel ??
    formatScheduleRangeLabel(schedule.startMinute, schedule.endMinute);
  const detailLabel = schedule.detailLabel ? ` · ${schedule.detailLabel}` : "";

  if (!schedule.readOnly) {
    return `${timeLabel} · ${schedule.content}${detailLabel} 업무 일정 수정`;
  }

  const presentation = getReadOnlySchedulePresentation(schedule);

  return `${presentation.accessibleLabel}: ${timeLabel} · ${schedule.content}${detailLabel} 상세 보기`;
}

function getReadOnlySchedulePresentation(schedule: WorkSchedule) {
  const isHospitalAppointment = schedule.sourceType === "hospitalAppointment";

  if (isHospitalAppointment) {
    return {
      accessibleLabel: "병원 진료 예약",
      cardBadgeClassName:
        "border border-[#b9d8e4] bg-[#dff1f6] text-[#1d5f78] dark:border-[#4a8bc2] dark:bg-[#20384a] dark:text-[#a8d5f5]",
      cardBadgeLabel: "병원",
      cardClassName:
        "border-[#b9d8e4] bg-[#edf8fb] text-[#17475a] hover:border-[#94c4d5] hover:bg-[#dff1f6] dark:border-[#4a8bc2] dark:bg-[#172b3b] dark:text-[#a8d5f5] dark:hover:border-[#79c0ff] dark:hover:bg-[#20384a]",
      contentLabel: "일정",
      detailBadgeClassName:
        "border-[#b9d8e4] bg-[#edf8fb] text-[#1d5f78] dark:border-[#4a8bc2] dark:bg-[#172b3b] dark:text-[#a8d5f5]",
      detailLabel: "상세",
      eyebrow: "청소년 개인일정 연동",
      eyebrowClassName: "text-[#1d5f78] dark:text-[#79c0ff]",
      isHospitalAppointment: true,
      timeLabel: "진료 시간",
      title: "병원 진료 예약",
    } as const;
  }

  return {
    accessibleLabel: "승인된 휴가",
    cardBadgeClassName:
      "border border-[#f0d28a] bg-[#fff3d0] text-[#72512a] dark:border-[#8a6b26] dark:bg-[#3a301a] dark:text-[#f0cb6d]",
    cardBadgeLabel: "승인 휴가",
    cardClassName:
      "border-[#f0d28a] bg-[#fff8e8] text-[#72512a] hover:border-[#e8bc5f] hover:bg-[#fff3d0] dark:border-[#8a6b26] dark:bg-[#302817] dark:text-[#f0cb6d] dark:hover:border-[#d29922] dark:hover:bg-[#3a301a]",
    contentLabel: "직원",
    detailBadgeClassName:
      "border-[#f0d28a] bg-[#fff8e8] text-[#72512a] dark:border-[#8a6b26] dark:bg-[#302817] dark:text-[#f0cb6d]",
    detailLabel: "소속",
    eyebrow: "전자결재 연동",
    eyebrowClassName: "text-[#72512a] dark:text-[#e3b341]",
    isHospitalAppointment: false,
    timeLabel: "휴가 구분",
    title: "승인된 휴가",
  } as const;
}

function WorkScheduleChangeLogSection({
  actors,
  error,
  filterControls,
  filters,
  isPending,
  logs,
  onPageChange,
  pendingPage,
  selectedMonth,
}: {
  actors: WorkScheduleChangeLogActor[];
  error: string;
  filterControls?: React.ReactNode;
  filters: WorkScheduleChangeLogFilters;
  isPending: boolean;
  logs: WorkScheduleChangeLog[];
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
  selectedMonth: string;
}) {
  return (
    <section aria-label="업무 일정 변경내역">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#16181d]">변경내역</h2>
          <ChangeLogListSummary filters={filters} />
        </div>
        {filterControls ?? (
          <WorkScheduleChangeLogFilterControls
            actors={actors}
            filters={filters}
            selectedMonth={selectedMonth}
          />
        )}
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}

      {logs.length > 0 ? (
        <ol
          className={[
            "mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white",
            isPending ? "opacity-60" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {logs.map((log) => {
            const detail = getChangeLogDetail(log.metadata);

            return (
              <li
                key={log.id}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[12rem_1fr]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#394150]">
                    {formatDateTime(log.createdAt)}
                  </p>
                  <UserIdentity
                    user={log.actor}
                    meta={log.actor.email ?? ""}
                    className="mt-2"
                  />
                </div>
                <div className="min-w-0 text-sm text-[#394150]">
                  <p className="break-words leading-6 [overflow-wrap:anywhere]">
                    {log.message ?? "업무 일정 변경내역이 기록되었습니다."}
                  </p>
                  {detail ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {detail.scheduleDate ? (
                        <ChangeLogValue
                          label="날짜"
                          value={formatWorkScheduleDateLabel(
                            detail.scheduleDate,
                          )}
                        />
                      ) : null}
                      {detail.timeLabel ? (
                        <ChangeLogValue label="시간" value={detail.timeLabel} />
                      ) : null}
                      {detail.previousContent !== undefined ? (
                        <ChangeLogValue
                          label="이전 내용"
                          value={detail.previousContent ?? "없음"}
                        />
                      ) : null}
                      {detail.nextContent !== undefined ? (
                        <ChangeLogValue
                          label="변경 후"
                          value={detail.nextContent ?? "없음"}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 border-y border-[#d9dee7] bg-white px-4 py-8 text-center text-sm text-[#697386]">
          조건에 맞는 변경내역이 없습니다.
        </p>
      )}

      <ChangeLogPagination
        filters={filters}
        isPending={isPending}
        onPageChange={onPageChange}
        pendingPage={pendingPage}
        selectedMonth={selectedMonth}
      />
    </section>
  );
}

function WorkScheduleChangeLogFilterControls({
  actors,
  filters,
  selectedMonth,
}: {
  actors: WorkScheduleChangeLogActor[];
  filters: WorkScheduleChangeLogFilters;
  selectedMonth: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <WorkScheduleChangeLogFilterControlsContent
      actors={actors}
      filters={filters}
      isPending={isPending}
      navigate={navigate}
      selectedMonth={selectedMonth}
    />
  );
}

export function WorkScheduleChangeLogFilterControlsContent({
  actors,
  filters,
  isPending = false,
  navigate,
  selectedMonth,
}: {
  actors: WorkScheduleChangeLogActor[];
  filters: WorkScheduleChangeLogFilters;
  isPending?: boolean;
  navigate: (href: string) => void;
  selectedMonth: string;
}) {
  const hasFilters = filters.actorId !== "all" || filters.scheduleDate !== "";

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    navigate(
      createChangeLogHref({
        actorId: String(formData.get("logStaff") ?? "all"),
        page: 1,
        scheduleDate: String(formData.get("logDate") ?? ""),
        selectedMonth,
      }),
    );
  }

  function submitFilter(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      className="flex min-w-0 flex-wrap items-end gap-2"
      key={`${filters.actorId}:${filters.scheduleDate}`}
      onSubmit={submitFilters}
    >
      <label>
        <span className="block text-xs font-semibold text-[#697386]">직원</span>
        <select
          aria-label="업무 일정 변경내역 직원 필터"
          name="logStaff"
          defaultValue={filters.actorId}
          disabled={isPending}
          onChange={submitFilter}
          className="mt-2 block h-10 w-40 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        >
          <option value="all">전체 직원</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="block text-xs font-semibold text-[#697386]">날짜</span>
        <DatePickerInput
          aria-label="업무 일정 변경내역 날짜 필터"
          name="logDate"
          defaultValue={filters.scheduleDate}
          disabled={isPending}
          onChange={submitFilter}
          className="mt-2 block h-10 w-40 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="h-10 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
      >
        {isPending ? "적용 중" : "적용"}
      </button>
      {hasFilters ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            navigate(
              createChangeLogHref({
                actorId: "all",
                page: 1,
                scheduleDate: "",
                selectedMonth,
              }),
            )
          }
          className="inline-flex h-10 items-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
        >
          초기화
        </button>
      ) : null}
    </form>
  );
}

function ChangeLogPagination({
  filters,
  isPending,
  onPageChange,
  pendingPage,
  selectedMonth,
}: {
  filters: WorkScheduleChangeLogFilters;
  isPending: boolean;
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
  selectedMonth: string;
}) {
  if (filters.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="업무 일정 변경내역 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9dee7] border-t border-[#eef1f5] bg-white px-4 py-3"
    >
      <p className="text-sm text-[#697386]">
        {filters.page} / {filters.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <ChangeLogPaginationLink
          disabled={filters.page <= 1 || isPending}
          href={createChangeLogHref({
            actorId: filters.actorId,
            page: filters.page - 1,
            scheduleDate: filters.scheduleDate,
            selectedMonth,
          })}
          onPageChange={onPageChange}
          page={filters.page - 1}
          pending={pendingPage === filters.page - 1}
        >
          이전
        </ChangeLogPaginationLink>
        <ChangeLogPaginationLink
          disabled={filters.page >= filters.totalPages || isPending}
          href={createChangeLogHref({
            actorId: filters.actorId,
            page: filters.page + 1,
            scheduleDate: filters.scheduleDate,
            selectedMonth,
          })}
          onPageChange={onPageChange}
          page={filters.page + 1}
          pending={pendingPage === filters.page + 1}
        >
          다음
        </ChangeLogPaginationLink>
      </div>
    </nav>
  );
}

function ChangeLogPaginationLink({
  children,
  disabled,
  href,
  onPageChange,
  page,
  pending,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
  onPageChange?: (page: number) => void;
  page: number;
  pending: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {pending ? "..." : children}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-busy={pending || undefined}
      className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
      onClick={(event) => {
        if (!onPageChange || shouldUseNativeNavigation(event)) {
          return;
        }

        event.preventDefault();
        onPageChange(page);
      }}
    >
      {pending ? "..." : children}
    </a>
  );
}

function ChangeLogListSummary({
  filters,
}: {
  filters: WorkScheduleChangeLogFilters;
}) {
  if (filters.total === 0) {
    return (
      <p className="mt-1 text-sm text-[#697386]">
        표시할 변경내역이 없습니다.
      </p>
    );
  }

  const firstItem = (filters.page - 1) * filters.pageSize + 1;
  const lastItem = Math.min(filters.page * filters.pageSize, filters.total);

  return (
    <p className="mt-1 text-sm text-[#697386]">
      {filters.total}건 중 {firstItem}-{lastItem}건 표시
    </p>
  );
}

function ChangeLogValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-2">
      <p className="font-semibold text-[#394150]">{label}</p>
      <p className="mt-1 whitespace-pre-line break-words leading-5 [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function createChangeLogHref({
  actorId,
  page,
  scheduleDate,
  selectedMonth,
}: {
  actorId: string;
  page: number;
  scheduleDate: string;
  selectedMonth: string;
}) {
  const params = new URLSearchParams();

  params.set("month", selectedMonth);

  if (actorId !== "all") {
    params.set("logStaff", actorId);
  }

  if (isWorkScheduleDate(scheduleDate)) {
    params.set("logDate", scheduleDate);
  }

  if (page > 1) {
    params.set("logPage", String(page));
  }

  return `/work-schedule?${params.toString()}`;
}

function getWorkScheduleChangeLogFiltersFromLocation(): Pick<
  WorkScheduleChangeLogFilters,
  "actorId" | "page" | "scheduleDate"
> {
  const params = new URLSearchParams(window.location.search);
  const actorId = String(params.get("logStaff") ?? "all").trim();

  return {
    actorId: actorId || "all",
    page: normalizePositivePage(params.get("logPage")),
    scheduleDate: getWorkScheduleLogDateFromLocation(params),
  };
}

function getWorkScheduleLogDateFromLocation(params: URLSearchParams) {
  const date = params.get("logDate");

  return date && isWorkScheduleDate(date) ? date : "";
}

function normalizePositivePage(value: string | null | undefined) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function getChangeLogDetail(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const previousContent = getNullableStringValue(metadata, "previousContent");
  const nextContent = getNullableStringValue(metadata, "nextContent");
  const scheduleDate = getScheduleDateValue(metadata);
  const timeLabel = getOptionalStringValue(metadata, "timeLabel");

  if (
    previousContent === undefined &&
    nextContent === undefined &&
    !scheduleDate &&
    !timeLabel
  ) {
    return null;
  }

  return {
    nextContent,
    previousContent,
    scheduleDate,
    timeLabel,
  };
}

function getNullableStringValue(
  value: object,
  key: "previousContent" | "nextContent",
) {
  const item = (value as Record<string, unknown>)[key];

  if (typeof item === "string") {
    return item;
  }

  if (item === null) {
    return null;
  }

  return undefined;
}

function getOptionalStringValue(value: object, key: "timeLabel") {
  const item = (value as Record<string, unknown>)[key];

  return typeof item === "string" ? item : "";
}

function getScheduleDateValue(value: object) {
  const record = value as Record<string, unknown>;
  const candidates = [
    record.scheduleDate,
    record.nextScheduleDate,
    record.sourceScheduleDate,
    record.previousScheduleDate,
  ];
  const scheduleDate = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && isWorkScheduleDate(candidate),
  );

  return scheduleDate ?? "";
}

function createWorkScheduleMonthHref(month: string) {
  return `/work-schedule?month=${month}`;
}

function getDefaultStartMinuteForDate(
  scheduleDate: string,
  schedules: WorkSchedule[],
) {
  const daySchedules = schedules
    .filter(
      (schedule) => schedule.scheduleDate === scheduleDate && !schedule.readOnly,
    )
    .sort(sortWorkScheduleItems);
  let candidateStartMinute = defaultWorkStartMinute;

  for (const schedule of daySchedules) {
    if (candidateStartMinute + 60 <= schedule.startMinute) {
      return candidateStartMinute;
    }

    candidateStartMinute = Math.max(candidateStartMinute, schedule.endMinute);
  }

  const latestStartMinute = getYouthLearningScheduleEndMinute() - 60;

  return Math.min(candidateStartMinute, latestStartMinute);
}

export function createEditableWorkScheduleMap(schedules: WorkSchedule[]) {
  const scheduleMap = new Map<string, WorkSchedule>();

  for (const schedule of schedules) {
    if (schedule.readOnly) {
      continue;
    }

    scheduleMap.set(
      createScheduleKey(schedule.scheduleDate, schedule.startMinute),
      schedule,
    );
  }

  return scheduleMap;
}

export function shouldOpenWorkScheduleCellWithKeyboard(
  key: string,
  isDirectCellTarget: boolean,
) {
  return isDirectCellTarget && (key === "Enter" || key === " ");
}

function createScheduleKey(scheduleDate: string, startMinute: number) {
  return `${scheduleDate}:${startMinute}`;
}

function sortWorkScheduleItems(first: WorkSchedule, second: WorkSchedule) {
  return (
    first.scheduleDate.localeCompare(second.scheduleDate) ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute ||
    first.content.localeCompare(second.content, "ko-KR")
  );
}

export function createWorkScheduleStartMinuteOptions() {
  return createMinuteOptions(
    getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour),
    getYouthLearningScheduleEndMinute(),
  );
}

export function createWorkScheduleEndMinuteOptions(startMinute: number) {
  return createMinuteOptions(
    startMinute + youthLearningScheduleMinuteStep,
    getYouthLearningScheduleEndMinute() + youthLearningScheduleMinuteStep,
  );
}

function createMinuteOptions(startMinute: number, endMinute: number) {
  return Array.from(
    {
      length: (endMinute - startMinute) / youthLearningScheduleMinuteStep,
    },
    (_, index) => startMinute + index * youthLearningScheduleMinuteStep,
  );
}

function formatScheduleRangeLabel(startMinute: number, endMinute: number) {
  return `${formatMinuteLabel(startMinute)} - ${formatMinuteLabel(endMinute)}`;
}

function formatMinuteLabel(minute: number) {
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;

  return minutePart === 0
    ? formatHourLabel(hour)
    : `${formatHourLabel(hour)} ${minutePart}분`;
}

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour <= 12 ? hour : hour - 12;

  return `${period} ${displayHour}시`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function WorkScheduleCalendarSkeleton() {
  const monthLabel = formatWorkScheduleMonthLabel(getWorkScheduleCurrentMonth());

  return (
    <section aria-label={`${monthLabel} 업무 일정 로딩`} className="space-y-6">
      <div className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#eef1f5] px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#16181d]">
              {monthLabel}
            </h2>
            <WorkScheduleSkeletonBlock className="mt-2 h-4 w-32" />
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-[5rem_5rem_5rem_10rem] lg:w-auto">
            <WorkScheduleSkeletonBlock className="h-10 w-full" />
            <WorkScheduleSkeletonBlock className="h-10 w-full" />
            <WorkScheduleSkeletonBlock className="h-10 w-full" />
            <WorkScheduleSkeletonBlock className="h-10 w-full" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 text-sm">
            {workScheduleCalendarWeekdays.map((weekday) => (
              <div
                key={`skeleton-weekday-${weekday.value}`}
                className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3"
              >
                <WorkScheduleSkeletonBlock className="mx-auto h-3 w-6" />
              </div>
            ))}
            {Array.from({ length: 42 }, (_, index) => (
              <div
                key={`skeleton-day-${index}`}
                className="min-h-[9.5rem] border-b border-r border-[#eef1f5] bg-white px-2.5 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <WorkScheduleSkeletonBlock className="size-8 rounded-full" />
                  <WorkScheduleSkeletonBlock className="h-8 w-12" />
                </div>
                {index % 3 === 0 ? (
                  <div className="mt-2 space-y-1.5">
                    <WorkScheduleSkeletonBlock className="h-12 w-full" />
                    <WorkScheduleSkeletonBlock className="h-10 w-4/5" />
                  </div>
                ) : (
                  <WorkScheduleSkeletonBlock className="mt-3 h-3 w-16" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section aria-label="업무 일정 변경내역 로딩">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">변경내역</h2>
            <WorkScheduleSkeletonBlock className="mt-2 h-4 w-44 max-w-full" />
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[9rem_9rem_auto]">
            <WorkScheduleSkeletonBlock className="h-10 w-full" />
            <WorkScheduleSkeletonBlock className="h-10 w-full" />
            <WorkScheduleSkeletonBlock className="h-10 w-full sm:w-20" />
          </div>
        </div>
        <ol className="mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white">
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              className="grid gap-3 px-4 py-3 lg:grid-cols-[12rem_1fr]"
            >
              <div className="min-w-0">
                <WorkScheduleSkeletonBlock className="h-4 w-24" />
                <WorkScheduleSkeletonBlock className="mt-2 h-8 w-32" />
              </div>
              <div className="min-w-0">
                <WorkScheduleSkeletonBlock className="h-4 w-3/5 max-w-full" />
                <WorkScheduleSkeletonBlock className="mt-2 h-3 w-48 max-w-full" />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <WorkScheduleSkeletonBlock className="h-12 w-full" />
                  <WorkScheduleSkeletonBlock className="h-12 w-full" />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function WorkScheduleSkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-[#edf1f5] ${className}`}
    />
  );
}

function isWorkScheduleBaselineToken(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function WorkScheduleRefreshButton({ disabled, canRefresh }: { disabled: boolean; canRefresh: () => boolean }) {
  const router = useRouter();
  return <button type="button" disabled={disabled} onClick={() => { if (canRefresh()) router.refresh(); }} className="mt-2 h-11 rounded-md border border-[var(--border-strong)] px-3 text-sm font-semibold text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">최신 목록 확인</button>;
}
