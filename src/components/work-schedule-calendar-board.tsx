"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";
import { UserIdentity } from "@/components/user-identity";
import type {
  WorkSchedule,
  WorkScheduleChangeLog,
  WorkScheduleChangeLogActor,
  WorkScheduleChangeLogFilters,
} from "@/lib/work-schedules";
import {
  createWorkScheduleCalendarDays,
  formatWorkScheduleDateLabel,
  formatWorkScheduleMonthLabel,
  getWorkScheduleCurrentMonth,
  getWorkScheduleMonthFromDate,
  shiftWorkScheduleMonth,
  workScheduleCalendarWeekdays,
} from "@/lib/work-schedule-calendar";
import type { YouthActionResult } from "@/lib/youth-management-core";
import {
  getYouthLearningScheduleEndMinute,
  getYouthLearningScheduleStartMinute,
  isYouthLearningScheduleDate,
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
  ) => Promise<YouthActionResult<{ scheduleDate: string; startMinute: number }>>;
  saveSchedule: (
    scheduleDate: string,
    startMinute: number,
    endMinute: number,
    content: string,
    sourceScheduleDate?: string,
    sourceStartMinute?: number,
  ) => Promise<YouthActionResult<{ schedule: WorkSchedule | null }>>;
  schedules: WorkSchedule[];
  selectedMonth: string;
};

type SelectedScheduleCell = {
  scheduleDate: string;
  startMinute: number;
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
  saveSchedule,
  schedules,
  selectedMonth,
}: WorkScheduleCalendarBoardProps) {
  const [scheduleItems, setScheduleItems] = useState(schedules);
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
  const scheduleMap = useMemo(() => {
    const nextMap = new Map<string, WorkSchedule>();

    for (const schedule of scheduleItems) {
      nextMap.set(createScheduleKey(schedule.scheduleDate, schedule.startMinute), schedule);
    }

    return nextMap;
  }, [scheduleItems]);
  const selectedSchedule = selectedCell
    ? scheduleMap.get(
        createScheduleKey(selectedCell.scheduleDate, selectedCell.startMinute),
      )
    : undefined;
  const previousMonth = shiftWorkScheduleMonth(selectedMonth, -1);
  const nextMonth = shiftWorkScheduleMonth(selectedMonth, 1);
  const currentMonth = getWorkScheduleCurrentMonth();
  const monthLabel = formatWorkScheduleMonthLabel(selectedMonth);

  function openScheduleModal(scheduleDate: string, startMinute?: number) {
    const selectedStartMinute =
      startMinute ?? getDefaultStartMinuteForDate(scheduleDate, scheduleItems);
    const schedule =
      startMinute === undefined
        ? undefined
        : scheduleMap.get(createScheduleKey(scheduleDate, startMinute));

    setSelectedCell({
      scheduleDate,
      startMinute: schedule?.startMinute ?? selectedStartMinute,
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

  function closeScheduleModal() {
    setSelectedCell(null);
    setScheduleDateDraft(`${selectedMonth}-01`);
    setStartMinuteDraft(defaultWorkStartMinute);
    setEndMinuteDraft(defaultWorkStartMinute + 60);
    setScheduleDraft("");
    setFormError("");
  }

  function updateStartMinuteDraft(nextStartMinute: number) {
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
    if (!selectedCell || pendingScheduleAction) {
      return;
    }

    startPendingScheduleAction(async () => {
      const result = await saveSchedule(
        scheduleDateDraft,
        startMinuteDraft,
        endMinuteDraft,
        scheduleDraft,
        selectedCell.scheduleDate,
        selectedCell.startMinute,
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeWorkScheduleItems(
          current,
          selectedCell.scheduleDate,
          selectedCell.startMinute,
          result.data.schedule,
        ),
      );
      closeScheduleModal();
    });
  }

  function removeSelectedSchedule() {
    if (!selectedCell) {
      return;
    }

    startPendingScheduleAction(async () => {
      const result = await deleteSchedule(
        selectedCell.scheduleDate,
        selectedCell.startMinute,
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeWorkScheduleItems(
          current,
          result.data.scheduleDate,
          result.data.startMinute,
          null,
        ),
      );
      closeScheduleModal();
    });
  }

  function jumpToDate(nextScheduleDate: string) {
    setDateJumpDraft(nextScheduleDate);

    if (!isYouthLearningScheduleDate(nextScheduleDate)) {
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
    if (event.key !== "Enter" && event.key !== " ") {
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
                        onClick={(event) => {
                          event.stopPropagation();
                          openScheduleModal(
                            schedule.scheduleDate,
                            schedule.startMinute,
                          );
                        }}
                        className="block w-full rounded-md border border-[#d6e6e4] bg-[#f5fbfa] px-2 py-1.5 text-left text-xs text-[#1f3f3d] shadow-sm transition hover:border-[#7fb5ae] hover:bg-[#eaf6f4]"
                      >
                        <span className="block font-semibold">
                          {formatScheduleRangeLabel(
                            schedule.startMinute,
                            schedule.endMinute,
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 break-words leading-4 [overflow-wrap:anywhere]">
                          {schedule.content}
                        </span>
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
        filterControls={changeLogFilterControls}
        filters={changeLogFilters}
        logs={changeLogs}
        selectedMonth={selectedMonth}
      />

      {selectedCell ? (
        <AppModal
          className="max-w-2xl"
          labelledBy="work-schedule-modal-title"
          onClose={closeScheduleModal}
        >
            <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
              <div className="px-6 pb-6 pt-6">
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
                  <p className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                    {formError}
                  </p>
                ) : null}

                <div className="mt-5 divide-y divide-[#eef1f5] border-y border-[#eef1f5]">
                  <label className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <span className="text-sm font-medium text-[#697386]">
                      날짜
                    </span>
                    <DatePickerInput
                      value={scheduleDateDraft}
                      disabled={pendingScheduleAction}
                      onChange={(event) => {
                        setScheduleDateDraft(event.currentTarget.value);
                        setFormError("");
                      }}
                      className="block h-9 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
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
                        className="h-9 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
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
                          setEndMinuteDraft(Number(event.currentTarget.value));
                          setFormError("");
                        }}
                        className="h-9 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
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
                    setScheduleDraft(event.currentTarget.value);
                    setFormError("");
                  }}
                  onKeyDown={saveSelectedScheduleWithKeyboard}
                  autoFocus
                  placeholder="업무 내용을 입력하세요."
                  rows={10}
                  className="mt-6 block min-h-[16rem] w-full resize-y border-0 bg-transparent px-0 py-0 text-base leading-7 text-[#16181d] outline-none placeholder:text-[#a5afbd] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1f5] bg-white px-5 py-4">
              <div>
                {selectedSchedule ? (
                  <button
                    type="button"
                    disabled={pendingScheduleAction}
                    onClick={removeSelectedSchedule}
                    className="h-10 rounded-md border border-[#f0c6c6] bg-white px-4 text-sm font-semibold text-[#a23a3a] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="h-10 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={pendingScheduleAction}
                  onClick={saveSelectedSchedule}
                  className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#0f5553] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingScheduleAction ? "저장 중" : "저장"}
                </button>
              </div>
            </footer>
        </AppModal>
      ) : null}
    </section>
  );
}

function WorkScheduleChangeLogSection({
  actors,
  filterControls,
  filters,
  logs,
  selectedMonth,
}: {
  actors: WorkScheduleChangeLogActor[];
  filterControls?: React.ReactNode;
  filters: WorkScheduleChangeLogFilters;
  logs: WorkScheduleChangeLog[];
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

      {logs.length > 0 ? (
        <ol className="mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white">
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

      <ChangeLogPagination filters={filters} selectedMonth={selectedMonth} />
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
  selectedMonth,
}: {
  filters: WorkScheduleChangeLogFilters;
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
          disabled={filters.page <= 1}
          href={createChangeLogHref({
            actorId: filters.actorId,
            page: filters.page - 1,
            scheduleDate: filters.scheduleDate,
            selectedMonth,
          })}
        >
          이전
        </ChangeLogPaginationLink>
        <ChangeLogPaginationLink
          disabled={filters.page >= filters.totalPages}
          href={createChangeLogHref({
            actorId: filters.actorId,
            page: filters.page + 1,
            scheduleDate: filters.scheduleDate,
            selectedMonth,
          })}
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
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
    >
      {children}
    </Link>
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

  if (isYouthLearningScheduleDate(scheduleDate)) {
    params.set("logDate", scheduleDate);
  }

  if (page > 1) {
    params.set("logPage", String(page));
  }

  return `/work-schedule?${params.toString()}`;
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
      typeof candidate === "string" && isYouthLearningScheduleDate(candidate),
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
    .filter((schedule) => schedule.scheduleDate === scheduleDate)
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

function mergeWorkScheduleItems(
  current: WorkSchedule[],
  sourceScheduleDate: string,
  sourceStartMinute: number,
  schedule: WorkSchedule | null,
) {
  const sourceKey = createScheduleKey(sourceScheduleDate, sourceStartMinute);
  const targetKey = schedule
    ? createScheduleKey(schedule.scheduleDate, schedule.startMinute)
    : "";
  const withoutCurrent = current.filter((item) => {
    const key = createScheduleKey(item.scheduleDate, item.startMinute);

    return key !== sourceKey && key !== targetKey;
  });

  return schedule
    ? [...withoutCurrent, schedule].sort(sortWorkScheduleItems)
    : withoutCurrent;
}

function createScheduleKey(scheduleDate: string, startMinute: number) {
  return `${scheduleDate}:${startMinute}`;
}

function sortWorkScheduleItems(first: WorkSchedule, second: WorkSchedule) {
  return (
    first.scheduleDate.localeCompare(second.scheduleDate) ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute
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
