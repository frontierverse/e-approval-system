"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { DatePickerInput } from "@/components/date-picker-input";
import { EmptyState } from "@/components/empty-state";
import { UserIdentity } from "@/components/user-identity";
import type {
  YouthActionResult,
  YouthLearningProgressChangeLogActor,
  YouthLearningProgressChangeLogFilters,
  YouthLearningProgressChangeLog,
  YouthLearningSchedule,
  YouthLearningScheduleWeekday,
  YouthProfile,
  YouthSpecialNote,
} from "@/lib/youth-management-core";
import {
  formatYouthLearningScheduleWeekdays,
  getYouthLearningScheduleEndHourFromMinute,
  getYouthLearningScheduleEndMinute,
  getYouthLearningScheduleStartHourFromMinute,
  getYouthLearningScheduleStartMinute,
  getYouthLearningScheduleToday,
  getYouthLearningScheduleWeekday,
  isYouthLearningScheduleDate,
  normalizeYouthLearningScheduleWeekdays,
  shiftYouthLearningScheduleDate,
  youthLearningScheduleEndHour,
  youthLearningScheduleMinuteStep,
  youthLearningScheduleStartHour,
  youthLearningScheduleWeekdays,
} from "@/lib/youth-management-core";

type YouthLearningProgressBoardProps = {
  createYouth: (
    name: string,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
  changeLogActors: YouthLearningProgressChangeLogActor[];
  changeLogFilters: YouthLearningProgressChangeLogFilters;
  changeLogs: YouthLearningProgressChangeLog[];
  deleteSchedule: (
    youthId: string,
    scheduleDate: string,
    startMinute: number,
  ) => Promise<
    YouthActionResult<{ youthId: string; scheduleDate: string; startMinute: number }>
  >;
  deleteYouth: (
    youthId: string,
  ) => Promise<YouthActionResult<{ youthId: string }>>;
  loadSchedules: (
    scheduleDate: string,
  ) => Promise<
    YouthActionResult<{
      scheduleDate: string;
      schedules: YouthLearningSchedule[];
    }>
  >;
  saveSchedule: (
    youthId: string,
    scheduleDate: string,
    startMinute: number,
    endMinute: number,
    content: string,
    recurrenceWeekdays: YouthLearningScheduleWeekday[],
    sourceStartMinute?: number,
  ) => Promise<YouthActionResult<{ schedule: YouthLearningSchedule | null }>>;
  schedules: YouthLearningSchedule[];
  selectedDate: string;
  youths: YouthProfile[];
};

type YouthLearningProgressBoardContentProps = YouthLearningProgressBoardProps;

type LearningProgressNote = {
  note: YouthSpecialNote;
  youth: YouthProfile;
};

type LearningTimeSlot = {
  endHour: number;
  endMinute: number;
  label: string;
  startHour: number;
  startMinute: number;
};

type SelectedCell = {
  youthId: string;
  startMinute: number;
};

type ScheduleDragMode = "move" | "resize-end" | "resize-start";

type ScheduleDragState = {
  hasMoved: boolean;
  initialEndMinute: number;
  initialStartMinute: number;
  maxEndMinute: number;
  maxStartMinute: number;
  minEndMinute: number;
  minStartMinute: number;
  mode: ScheduleDragMode;
  previewEndMinute: number;
  previewStartMinute: number;
  scheduleId: string;
  startY: number;
};

const learningProgressPattern =
  /학습|학원|진도|과제|수학|국어|영어|독서|검정고시|문제|학교|수업/;

const learningScheduleSlotHeight = 80;
const learningScheduleMinuteHeight = learningScheduleSlotHeight / 60;
const learningScheduleTimelineHeight =
  (youthLearningScheduleEndHour - youthLearningScheduleStartHour) *
  learningScheduleSlotHeight;

const learningTimeSlots: LearningTimeSlot[] = Array.from(
  { length: youthLearningScheduleEndHour - youthLearningScheduleStartHour },
  (_, index) => {
    const startHour = youthLearningScheduleStartHour + index;
    const endHour = startHour + 1;
    const startMinute = getYouthLearningScheduleStartMinute(startHour);
    const endMinute = getYouthLearningScheduleStartMinute(endHour);

    return {
      endHour,
      endMinute,
      label: `${formatHourLabel(startHour)} - ${formatHourLabel(endHour)}`,
      startHour,
      startMinute,
    };
  },
);

export function YouthLearningProgressBoard(
  props: YouthLearningProgressBoardProps,
) {
  return <YouthLearningProgressBoardContent key={props.selectedDate} {...props} />;
}

export function YouthLearningProgressBoardContent({
  createYouth,
  changeLogActors,
  changeLogFilters,
  changeLogs,
  deleteSchedule,
  deleteYouth,
  loadSchedules,
  saveSchedule,
  schedules,
  selectedDate: initialSelectedDate,
  youths: initialYouths,
}: YouthLearningProgressBoardContentProps) {
  const [youths, setYouths] = useState(initialYouths);
  const [scheduleItems, setScheduleItems] = useState(schedules);
  const [selectedScheduleDate, setSelectedScheduleDate] =
    useState(initialSelectedDate);
  const [dateDraft, setDateDraft] = useState(initialSelectedDate);
  const [newYouthName, setNewYouthName] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [startMinuteDraft, setStartMinuteDraft] = useState(
    getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour),
  );
  const [endMinuteDraft, setEndMinuteDraft] = useState(
    getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour + 1),
  );
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [recurrenceWeekdayDraft, setRecurrenceWeekdayDraft] = useState<
    YouthLearningScheduleWeekday[]
  >([]);
  const [formError, setFormError] = useState("");
  const [scheduleDragState, setScheduleDragState] =
    useState<ScheduleDragState | null>(null);
  const [pendingAction, startPendingAction] = useTransition();
  const [pendingTimetableAction, startPendingTimetableAction] = useTransition();
  const [pendingScheduleAction, startPendingScheduleAction] = useTransition();
  const pendingTimetable = pendingTimetableAction || pendingScheduleAction;
  const pendingBoardAction = pendingAction || pendingTimetable;

  const scheduleMap = useMemo(() => {
    const nextMap = new Map<string, YouthLearningSchedule>();

    for (const schedule of scheduleItems) {
      nextMap.set(
        createScheduleKey(
          schedule.youthId,
          schedule.scheduleDate,
          schedule.startMinute,
        ),
        schedule,
      );
    }

    return nextMap;
  }, [scheduleItems]);

  const schedulesByYouth = useMemo(() => {
    const nextMap = new Map<string, YouthLearningSchedule[]>();

    for (const schedule of scheduleItems) {
      if (schedule.scheduleDate !== selectedScheduleDate) {
        continue;
      }

      const currentSchedules = nextMap.get(schedule.youthId) ?? [];
      currentSchedules.push(schedule);
      nextMap.set(schedule.youthId, currentSchedules);
    }

    for (const currentSchedules of nextMap.values()) {
      currentSchedules.sort(sortScheduleItems);
    }

    return nextMap;
  }, [scheduleItems, selectedScheduleDate]);

  const previousDate = shiftYouthLearningScheduleDate(selectedScheduleDate, -1);
  const nextDate = shiftYouthLearningScheduleDate(selectedScheduleDate, 1);
  const today = getYouthLearningScheduleToday();
  const selectedDateLabel = formatDateWithWeekday(selectedScheduleDate);

  const selectedYouth = selectedCell
    ? youths.find((youth) => youth.id === selectedCell.youthId)
    : null;
  const selectedSlot = selectedCell
    ? learningTimeSlots.find(
        (slot) =>
          slot.startMinute <= selectedCell.startMinute &&
          selectedCell.startMinute < slot.endMinute,
      )
    : null;
  const selectedTimeLabel = selectedCell
    ? formatScheduleRangeLabel(startMinuteDraft, endMinuteDraft)
    : "";
  const selectedSchedule = selectedCell
    ? scheduleMap.get(
        createScheduleKey(
          selectedCell.youthId,
          selectedScheduleDate,
          selectedCell.startMinute,
        ),
      )
    : undefined;
  const recentLearningNotes = useMemo(
    () => getRecentLearningNotes(youths),
    [youths],
  );
  const loadScheduleDate = useCallback(
    (
      nextScheduleDate: string,
      { updateHistory = true }: { updateHistory?: boolean } = {},
    ) => {
      startPendingTimetableAction(async () => {
        const result = await loadSchedules(nextScheduleDate);

        if (!result.ok) {
          setFormError(result.error);
          setDateDraft(selectedScheduleDate);
          return;
        }

        setSelectedScheduleDate(result.data.scheduleDate);
        setDateDraft(result.data.scheduleDate);
        setScheduleItems(result.data.schedules);
        setSelectedCell(null);
        setScheduleDragState(null);
        setFormError("");

        if (updateHistory) {
          window.history.pushState(
            { learningProgressDate: result.data.scheduleDate },
            "",
            createLearningProgressDateHref(result.data.scheduleDate),
          );
        }
      });
    },
    [loadSchedules, selectedScheduleDate],
  );

  useEffect(() => {
    window.history.replaceState(
      { learningProgressDate: selectedScheduleDate },
      "",
      createLearningProgressDateHref(selectedScheduleDate),
    );

    function loadDateFromHistory() {
      loadScheduleDate(getLearningProgressDateFromLocation(), {
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadDateFromHistory);

    return () => window.removeEventListener("popstate", loadDateFromHistory);
  }, [loadScheduleDate, selectedScheduleDate]);

  useEffect(() => {
    if (!selectedCell) {
      return;
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeScheduleModal();
      }
    }

    window.addEventListener("keydown", closeWithEscape);

    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [selectedCell]);

  function registerYouth() {
    const name = newYouthName.trim();

    if (!name) {
      setFormError("학생 이름을 입력하세요.");
      return;
    }

    if (youths.some((youth) => youth.name === name)) {
      setFormError("이미 등록된 학생 이름입니다.");
      return;
    }

    startPendingAction(async () => {
      const result = await createYouth(name);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setYouths((current) =>
        [...current, result.data.youth].sort((first, second) =>
          first.name.localeCompare(second.name, "ko"),
        ),
      );
      setNewYouthName("");
      setFormError("");
    });
  }

  function removeYouth(youth: YouthProfile) {
    if (!window.confirm(`${youth.name} 학생을 삭제할까요?`)) {
      return;
    }

    startPendingAction(async () => {
      const result = await deleteYouth(youth.id);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setYouths((current) =>
        current.filter((currentYouth) => currentYouth.id !== result.data.youthId),
      );
      setScheduleItems((current) =>
        current.filter((schedule) => schedule.youthId !== result.data.youthId),
      );
      setFormError("");
    });
  }

  function openScheduleModal(youthId: string, startMinute: number) {
    const schedule = scheduleMap.get(
      createScheduleKey(youthId, selectedScheduleDate, startMinute),
    );

    setSelectedCell({ youthId, startMinute });
    setStartMinuteDraft(schedule?.startMinute ?? startMinute);
    setEndMinuteDraft(
      schedule?.endMinute ?? startMinute + 60,
    );
    setScheduleDraft(schedule?.content ?? "");
    setRecurrenceWeekdayDraft(
      schedule
        ? schedule.recurrenceWeekdays
        : [getYouthLearningScheduleWeekday(selectedScheduleDate)],
    );
    setFormError("");
  }

  function closeScheduleModal() {
    setSelectedCell(null);
    setStartMinuteDraft(
      getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour),
    );
    setEndMinuteDraft(
      getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour + 1),
    );
    setScheduleDraft("");
    setRecurrenceWeekdayDraft([]);
    setFormError("");
  }

  function saveSelectedSchedule() {
    if (!selectedCell) {
      return;
    }

    const sourceStartMinute = selectedCell.startMinute;

    startPendingScheduleAction(async () => {
      const result = await saveSchedule(
        selectedCell.youthId,
        selectedScheduleDate,
        startMinuteDraft,
        endMinuteDraft,
        scheduleDraft,
        recurrenceWeekdayDraft,
        sourceStartMinute,
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeScheduleItems(
          current,
          selectedCell.youthId,
          selectedScheduleDate,
          sourceStartMinute,
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
        selectedCell.youthId,
        selectedScheduleDate,
        selectedCell.startMinute,
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeScheduleItems(
          current,
          result.data.youthId,
          result.data.scheduleDate,
          result.data.startMinute,
          null,
        ),
      );
      closeScheduleModal();
    });
  }

  function startScheduleDrag(
    event: PointerEvent<HTMLButtonElement>,
    schedule: YouthLearningSchedule,
    mode: ScheduleDragMode,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (pendingBoardAction) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    const bounds = getScheduleDragBounds(schedule, scheduleItems, mode);

    setScheduleDragState({
      ...bounds,
      hasMoved: false,
      initialEndMinute: schedule.endMinute,
      initialStartMinute: schedule.startMinute,
      mode,
      previewEndMinute: schedule.endMinute,
      previewStartMinute: schedule.startMinute,
      scheduleId: schedule.id,
      startY: event.clientY,
    });
  }

  function moveScheduleDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!scheduleDragState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const minuteDelta =
      Math.round(
        (event.clientY - scheduleDragState.startY) /
          (learningScheduleMinuteHeight * youthLearningScheduleMinuteStep),
      ) * youthLearningScheduleMinuteStep;
    const hasMoved =
      scheduleDragState.hasMoved ||
      Math.abs(event.clientY - scheduleDragState.startY) >= 4;
    let previewStartMinute = scheduleDragState.initialStartMinute;
    let previewEndMinute = scheduleDragState.initialEndMinute;

    if (scheduleDragState.mode === "move") {
      const duration =
        scheduleDragState.initialEndMinute -
        scheduleDragState.initialStartMinute;

      previewStartMinute = clampNumber(
        scheduleDragState.initialStartMinute + minuteDelta,
        scheduleDragState.minStartMinute,
        scheduleDragState.maxStartMinute,
      );
      previewEndMinute = previewStartMinute + duration;
    } else if (scheduleDragState.mode === "resize-start") {
      previewStartMinute = clampNumber(
        scheduleDragState.initialStartMinute + minuteDelta,
        scheduleDragState.minStartMinute,
        scheduleDragState.maxStartMinute,
      );
    } else {
      previewEndMinute = clampNumber(
        scheduleDragState.initialEndMinute + minuteDelta,
        scheduleDragState.minEndMinute,
        scheduleDragState.maxEndMinute,
      );
    }

    if (
      hasMoved !== scheduleDragState.hasMoved ||
      previewStartMinute !== scheduleDragState.previewStartMinute ||
      previewEndMinute !== scheduleDragState.previewEndMinute
    ) {
      setScheduleDragState({
        ...scheduleDragState,
        hasMoved,
        previewEndMinute,
        previewStartMinute,
      });
    }
  }

  function finishScheduleDrag(
    event: PointerEvent<HTMLButtonElement>,
    schedule: YouthLearningSchedule,
  ) {
    if (scheduleDragState?.scheduleId !== schedule.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const nextStartMinute = scheduleDragState.previewStartMinute;
    const nextEndMinute = scheduleDragState.previewEndMinute;
    const shouldOpenModal =
      scheduleDragState.mode === "move" && !scheduleDragState.hasMoved;
    setScheduleDragState(null);

    if (shouldOpenModal) {
      openScheduleModal(schedule.youthId, schedule.startMinute);
      return;
    }

    if (
      nextStartMinute === schedule.startMinute &&
      nextEndMinute === schedule.endMinute
    ) {
      return;
    }

    const optimisticSchedule = {
      ...schedule,
      endHour: getYouthLearningScheduleEndHourFromMinute(nextEndMinute),
      startHour: getYouthLearningScheduleStartHourFromMinute(nextStartMinute),
      startMinute: nextStartMinute,
      endMinute: nextEndMinute,
    };

    setScheduleItems((current) =>
      mergeScheduleItems(
        current,
        schedule.youthId,
        selectedScheduleDate,
        schedule.startMinute,
        optimisticSchedule,
      ),
    );
    setFormError("");

    startPendingScheduleAction(async () => {
      const result = await saveSchedule(
        schedule.youthId,
        selectedScheduleDate,
        nextStartMinute,
        nextEndMinute,
        schedule.content,
        schedule.recurrenceWeekdays,
        schedule.startMinute,
      );

      if (!result.ok) {
        setScheduleItems((current) =>
          mergeScheduleItems(
            current,
            schedule.youthId,
            selectedScheduleDate,
            nextStartMinute,
            schedule,
          ),
        );
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeScheduleItems(
          current,
          schedule.youthId,
          selectedScheduleDate,
          nextStartMinute,
          result.data.schedule,
        ),
      );
      setFormError("");
    });
  }

  function cancelScheduleDrag(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setScheduleDragState(null);
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

  function toggleRecurrenceWeekday(weekday: YouthLearningScheduleWeekday) {
    setRecurrenceWeekdayDraft((current) =>
      current.includes(weekday)
        ? normalizeYouthLearningScheduleWeekdays(
            current.filter((currentWeekday) => currentWeekday !== weekday),
          )
        : normalizeYouthLearningScheduleWeekdays([...current, weekday]),
    );
    setFormError("");
  }

  return (
    <section aria-label="청소년 학습진도" className="space-y-6">
      <div className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#eef1f5] px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#16181d]">
              학습진도 시간표
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              {selectedDateLabel} 기록을 오전 9시부터 오후 6시까지 관리합니다.
            </p>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-3 lg:max-w-2xl">
            <form
              className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
              onSubmit={(event) => {
                event.preventDefault();
                loadScheduleDate(dateDraft);
              }}
            >
              <button
                type="button"
                onClick={() => loadScheduleDate(previousDate)}
                disabled={pendingTimetable}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                이전 날
              </button>
              <label className="min-w-0 sm:w-44">
                <span className="sr-only">날짜 선택</span>
                <DatePickerInput
                  name="date"
                  value={dateDraft}
                  onChange={(event) => setDateDraft(event.target.value)}
                  disabled={pendingTimetable}
                  className="h-10 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
                />
              </label>
              <button
                type="submit"
                disabled={pendingTimetable}
                className="h-10 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                이동
              </button>
              <button
                type="button"
                onClick={() => loadScheduleDate(today)}
                disabled={pendingTimetable}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => loadScheduleDate(nextDate)}
                disabled={pendingTimetable}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                다음 날
              </button>
            </form>

            <form
              className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:justify-end"
              onSubmit={(event) => {
                event.preventDefault();
                registerYouth();
              }}
            >
              <label className="min-w-0 flex-1 sm:max-w-xs">
                <span className="sr-only">학생 이름</span>
                <input
                  value={newYouthName}
                  onChange={(event) => {
                    setNewYouthName(event.target.value);
                    setFormError("");
                  }}
                  placeholder="학생 이름"
                  className="h-10 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </label>
              <button
                type="submit"
                disabled={pendingBoardAction}
                className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] disabled:cursor-not-allowed disabled:bg-[#cfd6e3] disabled:text-[#697386]"
              >
                추가
              </button>
            </form>
          </div>
        </div>

        {formError ? (
          <p className="border-b border-[#f0c6c6] bg-[#fff1f1] px-4 py-2 text-sm text-[#8a1f1f]">
            {formError}
          </p>
        ) : null}

        <div className="relative">
          {youths.length > 0 ? (
            <>
              <div
                aria-hidden={pendingTimetable}
                inert={pendingTimetable ? true : undefined}
                className={[
                  "overflow-x-auto",
                  pendingTimetable ? "invisible" : "",
                ].join(" ")}
              >
                <div
                  className="grid min-w-[680px] text-sm"
                  style={{
                    gridTemplateColumns: `6.5rem repeat(${youths.length}, minmax(12rem, 1fr))`,
                  }}
                >
                  <div className="sticky left-0 z-30 border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-left text-xs font-semibold text-[#394150]">
                    시간
                  </div>
                  {youths.map((youth) => (
                    <div
                      key={youth.id}
                      className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-left text-xs font-semibold text-[#394150]"
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                          {youth.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeYouth(youth)}
                          disabled={pendingBoardAction}
                          className="h-8 shrink-0 rounded-md border border-[#efb4b4] bg-white px-2 text-xs font-semibold text-[#a13a3a] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </span>
                    </div>
                  ))}

                  <div
                    className="sticky left-0 z-20 border-r border-[#d9dee7] bg-white"
                    style={{ height: learningScheduleTimelineHeight }}
                  >
                    {learningTimeSlots.map((slot) => (
                      <div
                        key={slot.startHour}
                        className="flex h-20 items-start border-b border-[#eef1f5] px-3 py-3 text-xs font-semibold leading-4 text-[#394150]"
                      >
                        <TimeSlotLabel slot={slot} />
                      </div>
                    ))}
                  </div>

                  {youths.map((youth) => {
                    const youthSchedules = schedulesByYouth.get(youth.id) ?? [];

                    return (
                      <div
                        key={youth.id}
                        className="relative border-r border-[#eef1f5] bg-white"
                        style={{ height: learningScheduleTimelineHeight }}
                      >
                        <div className="absolute inset-0">
                          {learningTimeSlots.map((slot) => (
                            <button
                              key={slot.startHour}
                              type="button"
                              aria-label={`${youth.name} ${slot.label} 스케줄 입력`}
                              onClick={() =>
                                openScheduleModal(youth.id, slot.startMinute)
                              }
                              className="block h-20 w-full border-b border-[#eef1f5] px-3 py-3 text-left text-xs text-[#9aa4b2] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#d7eceb]"
                            >
                              미입력
                            </button>
                          ))}
                        </div>

                        {youthSchedules.map((schedule) => {
                          const isDragging =
                            scheduleDragState?.scheduleId === schedule.id;
                          const previewStartMinute = isDragging
                            ? scheduleDragState.previewStartMinute
                            : schedule.startMinute;
                          const previewEndMinute = isDragging
                            ? scheduleDragState.previewEndMinute
                            : schedule.endMinute;
                          const scheduleTop =
                            (previewStartMinute -
                              getYouthLearningScheduleStartMinute(
                                youthLearningScheduleStartHour,
                              )) *
                              learningScheduleMinuteHeight +
                            4;
                          const scheduleHeight = Math.max(
                            48,
                            (previewEndMinute - previewStartMinute) *
                              learningScheduleMinuteHeight -
                              8,
                          );
                          const recurrenceWeekdayLabel =
                            formatYouthLearningScheduleWeekdays(
                              schedule.recurrenceWeekdays,
                            );

                          return (
                            <div
                              key={schedule.id}
                              className={[
                                "absolute left-2 right-2 z-10 overflow-hidden rounded-md border shadow-sm transition-colors",
                                isDragging
                                  ? "border-[#196b69] bg-[#e5f4f3] ring-2 ring-[#bfe1df]"
                                  : "border-[#9fc9c5] bg-[#f4fbfa]",
                              ].join(" ")}
                              style={{
                                height: scheduleHeight,
                                top: scheduleTop,
                              }}
                            >
                              <button
                                type="button"
                                aria-label={`${formatScheduleRangeLabel(
                                  previewStartMinute,
                                  previewEndMinute,
                                )} 시작 시간 조절`}
                                title="시작 시간 조절"
                                onPointerDown={(event) =>
                                  startScheduleDrag(
                                    event,
                                    schedule,
                                    "resize-start",
                                  )
                                }
                                onPointerMove={moveScheduleDrag}
                                onPointerUp={(event) =>
                                  finishScheduleDrag(event, schedule)
                                }
                                onPointerCancel={cancelScheduleDrag}
                                className="absolute inset-x-0 top-0 z-20 flex h-5 cursor-ns-resize touch-none items-center justify-center bg-[#d7eceb]/80 transition hover:bg-[#c7e2e0] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
                              >
                                <span
                                  aria-hidden="true"
                                  className="h-1 w-8 rounded-full bg-[#196b69]"
                                />
                              </button>
                              <button
                                type="button"
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    openScheduleModal(
                                      schedule.youthId,
                                      schedule.startMinute,
                                    );
                                  }
                                }}
                                onPointerDown={(event) =>
                                  startScheduleDrag(event, schedule, "move")
                                }
                                onPointerMove={moveScheduleDrag}
                                onPointerUp={(event) =>
                                  finishScheduleDrag(event, schedule)
                                }
                                onPointerCancel={cancelScheduleDrag}
                                className="relative z-10 block h-full w-full cursor-move touch-none px-3 pb-6 pt-6 text-left transition hover:bg-[#ecf7f6] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
                              >
                                <span className="block text-[11px] font-semibold text-[#196b69]">
                                  {formatScheduleRangeLabel(
                                    previewStartMinute,
                                    previewEndMinute,
                                  )}
                                </span>
                                <span className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm font-semibold leading-5 text-[#26333f] [overflow-wrap:anywhere]">
                                  {schedule.content}
                                </span>
                                {recurrenceWeekdayLabel ? (
                                  <span className="mt-1 inline-flex h-5 items-center rounded-full border border-[#b9c9ea] bg-[#f0f5ff] px-2 text-[11px] font-semibold text-[#274f9f]">
                                    매주 {recurrenceWeekdayLabel}
                                  </span>
                                ) : null}
                              </button>
                              <button
                                type="button"
                                aria-label={`${formatScheduleRangeLabel(
                                  previewStartMinute,
                                  previewEndMinute,
                                )} 종료 시간 조절`}
                                title="종료 시간 조절"
                                onPointerDown={(event) =>
                                  startScheduleDrag(
                                    event,
                                    schedule,
                                    "resize-end",
                                  )
                                }
                                onPointerMove={moveScheduleDrag}
                                onPointerUp={(event) =>
                                  finishScheduleDrag(event, schedule)
                                }
                                onPointerCancel={cancelScheduleDrag}
                                className="absolute inset-x-0 bottom-0 z-20 flex h-5 cursor-ns-resize touch-none items-center justify-center bg-[#d7eceb]/80 transition hover:bg-[#c7e2e0] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
                              >
                                <span
                                  aria-hidden="true"
                                  className="h-1 w-8 rounded-full bg-[#196b69]"
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              {pendingTimetable ? (
                <TimetableSkeleton overlay youthCount={youths.length} />
              ) : null}
            </>
          ) : (
            <div className="p-5">
              <EmptyState
                title="등록된 학생이 없습니다."
                description="학생을 추가하면 시간표를 입력할 수 있습니다."
              />
            </div>
          )}
        </div>
      </div>

      <section aria-label="최근 변경 내역">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              최근 변경 내역
            </h2>
            <ChangeLogListSummary filters={changeLogFilters} />
          </div>
          <ChangeLogFilterControls
            actors={changeLogActors}
            filters={changeLogFilters}
            selectedDate={selectedScheduleDate}
          />
        </div>
        {changeLogs.length > 0 ? (
          <ol className="mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white">
            {changeLogs.map((log) => {
            const detail = getChangeLogDetail(log.metadata);

            return (
              <li
                key={log.id}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[12rem_1fr]"
              >
                <div className="min-w-0">
                  <time
                    dateTime={log.createdAt}
                    className="text-sm font-semibold text-[#394150]"
                  >
                    {formatDateTime(log.createdAt)}
                  </time>
                  <UserIdentity
                    user={log.actor}
                    size="xs"
                    meta={log.actor.email ?? "이메일 미등록"}
                    className="mt-2"
                    nameClassName="text-[#394150]"
                  />
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                    {log.message ?? "학습진도 변경 내역이 기록되었습니다."}
                  </p>
                  {detail ? (
                    <>
                      {detail.scheduleDate ? (
                        <p className="mt-1 text-xs font-medium text-[#697386]">
                          시간표 날짜 {formatDateWithWeekday(detail.scheduleDate)}
                        </p>
                      ) : null}
                      {detail.previousContent !== null ||
                      detail.nextContent !== null ? (
                        <div className="mt-2 grid gap-2 text-xs text-[#697386] sm:grid-cols-2">
                          {detail.previousContent !== null ? (
                            <ChangeLogValue
                              label="변경 전"
                              value={detail.previousContent}
                            />
                          ) : null}
                          {detail.nextContent !== null ? (
                            <ChangeLogValue
                              label="변경 후"
                              value={detail.nextContent}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
          </ol>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
            조건에 맞는 변경 내역이 없습니다.
          </p>
        )}
        <ChangeLogPagination
          filters={changeLogFilters}
          selectedDate={selectedScheduleDate}
        />
      </section>

      {recentLearningNotes.length > 0 ? (
        <section aria-label="최근 학습 관련 기록">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#16181d]">
              최근 학습 관련 기록
            </h2>
            <p className="text-sm text-[#697386]">
              특이사항 중 학습 관련 기록만 표시합니다.
            </p>
          </div>
          <ul className="mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white">
            {recentLearningNotes.slice(0, 6).map(({ note, youth }) => (
              <li
                key={note.id}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_1fr]"
              >
                <div>
                  <p className="text-sm font-semibold text-[#16181d]">
                    {youth.name}
                  </p>
                  <p className="mt-1 text-xs text-[#697386]">
                    {formatDate(note.recordedAt)} · {note.category}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-[#394150]">
                    {note.title}
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-[#697386]">
                    {note.summary}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selectedCell && selectedYouth && selectedSlot ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-[#101418]/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeScheduleModal();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="learning-schedule-modal-title"
            className="w-full max-w-lg rounded-md border border-[#d9dee7] bg-white shadow-xl"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveSelectedSchedule();
              }}
            >
              <header className="border-b border-[#eef1f5] px-5 py-4">
                <p className="text-sm font-semibold text-[#697386]">
                  {formatDate(selectedScheduleDate)} · {selectedYouth.name} ·{" "}
                  {selectedTimeLabel}
                </p>
                <h2
                  id="learning-schedule-modal-title"
                  className="mt-1 text-lg font-semibold text-[#16181d]"
                >
                  스케줄 입력
                </h2>
              </header>

              <div className="grid gap-3 px-5 py-5">
                <label>
                  <span className="text-sm font-semibold text-[#394150]">
                    스케줄
                  </span>
                  <textarea
                    value={scheduleDraft}
                    onChange={(event) => {
                      setScheduleDraft(event.target.value);
                      setFormError("");
                    }}
                    autoFocus
                    rows={6}
                    className="mt-2 w-full resize-y rounded-md border border-[#cfd6e3] px-3 py-3 text-sm leading-6 outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-[#394150]">
                    시작 시간
                  </span>
                  <select
                    value={startMinuteDraft}
                    onChange={(event) => {
                      updateStartMinuteDraft(Number(event.target.value));
                    }}
                    className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                  >
                    {createLearningScheduleStartMinuteOptions().map((minute) => (
                      <option key={minute} value={minute}>
                        {formatMinuteLabel(minute)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold text-[#394150]">
                    종료 시간
                  </span>
                  <select
                    value={endMinuteDraft}
                    onChange={(event) => {
                      setEndMinuteDraft(Number(event.target.value));
                      setFormError("");
                    }}
                    className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                  >
                    {createLearningScheduleEndMinuteOptions(startMinuteDraft).map(
                      (minute) => (
                        <option key={minute} value={minute}>
                          {formatMinuteLabel(minute)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <fieldset className="rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 pb-3 pt-2">
                  <legend className="px-1 text-sm font-semibold text-[#394150]">
                    반복 요일
                  </legend>
                  <div className="mt-2 grid grid-cols-7 gap-2">
                    {youthLearningScheduleWeekdays.map((weekday) => {
                      const selected = recurrenceWeekdayDraft.includes(
                        weekday.value,
                      );

                      return (
                        <button
                          key={weekday.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleRecurrenceWeekday(weekday.value)}
                          className={[
                            "h-9 rounded-md border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#d7eceb]",
                            selected
                              ? "border-[#196b69] bg-[#196b69] text-white"
                              : "border-[#cfd6e3] bg-white text-[#394150] hover:bg-[#f7f9fc]",
                          ].join(" ")}
                        >
                          {weekday.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                {formError ? (
                  <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                    {formError}
                  </p>
                ) : null}
              </div>

              <footer className="flex flex-col gap-2 border-t border-[#eef1f5] bg-white px-5 py-4 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={removeSelectedSchedule}
                  disabled={pendingBoardAction || !selectedSchedule}
                  className="h-10 rounded-md border border-[#efb4b4] bg-white px-4 text-sm font-semibold text-[#a13a3a] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  삭제
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeScheduleModal}
                    disabled={pendingBoardAction}
                    className="h-10 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={pendingBoardAction}
                    className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] disabled:cursor-not-allowed disabled:bg-[#cfd6e3] disabled:text-[#697386]"
                  >
                    {pendingScheduleAction ? "저장 중" : "저장"}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

    </section>
  );
}

export function TimetableSkeleton({
  overlay = false,
  youthCount,
}: {
  overlay?: boolean;
  youthCount: number;
}) {
  const columnCount = Math.max(1, youthCount);
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const skeletonBlocks = [0, 2, 5].map((slotIndex) => ({
    height: slotIndex === 2 ? 104 : 72,
    top: slotIndex * learningScheduleSlotHeight + 8,
  }));

  return (
    <div
      aria-busy="true"
      aria-label="시간표 불러오는 중"
      className={
        overlay
          ? "pointer-events-none absolute inset-0 z-40 overflow-hidden"
          : "overflow-x-auto"
      }
      role="status"
    >
      <div
        className="grid min-w-[680px] text-sm"
        style={{
          gridTemplateColumns: `6.5rem repeat(${columnCount}, minmax(12rem, 1fr))`,
        }}
      >
        <div className="sticky left-0 z-30 border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3">
          <span className="flex h-8 items-center">
            <span className="block h-3 w-10 animate-pulse rounded bg-[#dce3ec] dark:bg-[#30363d]" />
          </span>
        </div>
        {columns.map((column) => (
          <div
            key={`skeleton-header-${column}`}
            className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3"
          >
            <span className="flex h-8 items-center justify-between gap-2">
              <span className="block h-3 w-20 animate-pulse rounded bg-[#dce3ec] dark:bg-[#30363d]" />
              <span className="block h-8 w-10 animate-pulse rounded-md bg-white dark:bg-[#21262d]" />
            </span>
          </div>
        ))}

        <div
          className="sticky left-0 z-20 border-r border-[#d9dee7] bg-white"
          style={{ height: learningScheduleTimelineHeight }}
        >
          {learningTimeSlots.map((slot) => (
            <div
              key={`skeleton-time-${slot.startHour}`}
              className="flex h-20 items-start border-b border-[#eef1f5] px-3 py-3 text-xs font-semibold leading-4 text-[#9aa4b2] dark:text-[#8b949e]"
            >
              <TimeSlotLabel slot={slot} />
            </div>
          ))}
        </div>

        {columns.map((column) => (
          <div
            key={`skeleton-column-${column}`}
            className="relative border-r border-[#eef1f5] bg-white"
            style={{ height: learningScheduleTimelineHeight }}
          >
            <div className="absolute inset-0">
              {learningTimeSlots.map((slot) => (
                <div
                  key={`skeleton-cell-${column}-${slot.startHour}`}
                  className="h-20 border-b border-[#eef1f5]"
                />
              ))}
            </div>
            {skeletonBlocks.map((block, blockIndex) => (
              <div
                key={`skeleton-block-${column}-${blockIndex}`}
                className="absolute left-2 right-2 overflow-hidden rounded-md border border-[#d6e6e4] bg-[#f5fbfa] shadow-sm dark:border-[#30363d] dark:bg-[#161b22]"
                style={{
                  height: block.height,
                  top: block.top,
                }}
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 flex h-5 items-center justify-center bg-[#e4f0ef]/90 dark:bg-[#1f6feb]/15"
                >
                  <span className="block h-1 w-9 animate-pulse rounded-full bg-[#b7d3d0] dark:bg-[#58a6ff]/35" />
                </div>
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center bg-[#e4f0ef]/90 dark:bg-[#1f6feb]/15"
                >
                  <span className="block h-1 w-9 animate-pulse rounded-full bg-[#b7d3d0] dark:bg-[#58a6ff]/35" />
                </div>
                <div className="animate-pulse px-3 pb-7 pt-7">
                  <span className="block h-2.5 w-20 rounded bg-[#cddfdd] dark:bg-[#30363d]" />
                  <span className="mt-3 block h-3 w-28 rounded bg-[#d7e6e4] dark:bg-[#21262d]" />
                  <span className="mt-2 block h-3 w-16 rounded bg-[#d7e6e4] dark:bg-[#21262d]" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangeLogListSummary({
  filters,
}: {
  filters: YouthLearningProgressChangeLogFilters;
}) {
  if (filters.total === 0) {
    return (
      <p className="mt-1 text-sm text-[#697386]">
        표시할 변경 내역이 없습니다.
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

function ChangeLogFilterControls({
  actors,
  filters,
  selectedDate,
}: {
  actors: YouthLearningProgressChangeLogActor[];
  filters: YouthLearningProgressChangeLogFilters;
  selectedDate: string;
}) {
  const hasFilters = filters.actorId !== "all" || filters.scheduleDate !== "";

  function submitFilter(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      action="/youth/learning-progress"
      className="flex min-w-0 flex-wrap items-end gap-2"
      key={`${filters.actorId}:${filters.scheduleDate}`}
      method="get"
    >
      <input name="date" type="hidden" value={selectedDate} />
      <label>
        <span className="block text-xs font-semibold text-[#697386]">직원</span>
        <select
          aria-label="변경내역 직원 필터"
          name="logStaff"
          defaultValue={filters.actorId}
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
          aria-label="변경내역 날짜 필터"
          name="logDate"
          defaultValue={filters.scheduleDate}
          onChange={submitFilter}
          className="mt-2 block h-10 w-40 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      </label>
      <button
        type="submit"
        className="h-10 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
      >
        적용
      </button>
      {hasFilters ? (
        <Link
          href={createChangeLogHref({
            actorId: "all",
            page: 1,
            scheduleDate: "",
            selectedDate,
          })}
          className="inline-flex h-10 items-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
        >
          초기화
        </Link>
      ) : null}
    </form>
  );
}

function ChangeLogPagination({
  filters,
  selectedDate,
}: {
  filters: YouthLearningProgressChangeLogFilters;
  selectedDate: string;
}) {
  if (filters.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="변경내역 페이지"
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
            selectedDate,
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
            selectedDate,
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

function createChangeLogHref({
  actorId,
  page,
  scheduleDate,
  selectedDate,
}: {
  actorId: string;
  page: number;
  scheduleDate: string;
  selectedDate: string;
}) {
  const params = new URLSearchParams();

  params.set("date", selectedDate);

  if (actorId !== "all") {
    params.set("logStaff", actorId);
  }

  if (scheduleDate) {
    params.set("logDate", scheduleDate);
  }

  if (page > 1) {
    params.set("logPage", String(page));
  }

  return `/youth/learning-progress?${params.toString()}`;
}

function mergeScheduleItems(
  current: YouthLearningSchedule[],
  youthId: string,
  scheduleDate: string,
  startMinute: number,
  schedule: YouthLearningSchedule | null,
) {
  const key = createScheduleKey(youthId, scheduleDate, startMinute);
  const withoutCurrent = current.filter(
    (item) =>
      createScheduleKey(item.youthId, item.scheduleDate, item.startMinute) !==
      key,
  );

  return schedule
    ? [...withoutCurrent, schedule].sort(sortScheduleItems)
    : withoutCurrent;
}

export function createLearningScheduleStartMinuteOptions() {
  return createMinuteOptions(
    getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour),
    getYouthLearningScheduleEndMinute(),
  );
}

export function createLearningScheduleEndMinuteOptions(startMinute: number) {
  return createMinuteOptions(
    startMinute + youthLearningScheduleMinuteStep,
    getYouthLearningScheduleEndMinute() + youthLearningScheduleMinuteStep,
  );
}

function createMinuteOptions(startMinute: number, endMinute: number) {
  return Array.from(
    {
      length:
        (endMinute - startMinute) / youthLearningScheduleMinuteStep,
    },
    (_, index) => startMinute + index * youthLearningScheduleMinuteStep,
  );
}

function sortScheduleItems(
  first: YouthLearningSchedule,
  second: YouthLearningSchedule,
) {
  return (
    first.scheduleDate.localeCompare(second.scheduleDate) ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute ||
    first.youthId.localeCompare(second.youthId)
  );
}

function getScheduleDragBounds(
  schedule: YouthLearningSchedule,
  schedules: YouthLearningSchedule[],
  mode: ScheduleDragMode,
) {
  const { nextStartMinute, previousEndMinute } = getScheduleAdjacentBounds(
    schedule,
    schedules,
  );
  const duration = schedule.endMinute - schedule.startMinute;
  const minStartMinute = previousEndMinute;
  const maxStartMinute =
    mode === "resize-start"
      ? schedule.endMinute - youthLearningScheduleMinuteStep
      : nextStartMinute - duration;
  const minEndMinute = schedule.startMinute + youthLearningScheduleMinuteStep;
  const maxEndMinute = nextStartMinute;

  return {
    maxEndMinute: Math.max(minEndMinute, maxEndMinute),
    maxStartMinute: Math.max(minStartMinute, maxStartMinute),
    minEndMinute,
    minStartMinute,
  };
}

function getScheduleAdjacentBounds(
  schedule: YouthLearningSchedule,
  schedules: YouthLearningSchedule[],
) {
  const dayStartMinute = getYouthLearningScheduleStartMinute(
    youthLearningScheduleStartHour,
  );
  let previousEndMinute = dayStartMinute;
  let nextStartMinute = getYouthLearningScheduleEndMinute();

  for (const item of schedules) {
    if (
      item.id === schedule.id ||
      item.youthId !== schedule.youthId ||
      item.scheduleDate !== schedule.scheduleDate
    ) {
      continue;
    }

    if (item.endMinute <= schedule.startMinute) {
      previousEndMinute = Math.max(previousEndMinute, item.endMinute);
    }

    if (item.startMinute >= schedule.endMinute) {
      nextStartMinute = Math.min(nextStartMinute, item.startMinute);
    }
  }

  return { nextStartMinute, previousEndMinute };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createScheduleKey(
  youthId: string,
  scheduleDate: string,
  startMinute: number,
) {
  return `${scheduleDate}:${youthId}:${startMinute}`;
}

function createLearningProgressDateHref(scheduleDate: string) {
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);

  params.set("date", scheduleDate);

  return `/youth/learning-progress?${params.toString()}`;
}

function getLearningProgressDateFromLocation() {
  const selectedDate = new URL(window.location.href).searchParams.get("date");

  return selectedDate && isYouthLearningScheduleDate(selectedDate)
    ? selectedDate
    : getYouthLearningScheduleToday();
}

function getRecentLearningNotes(youths: YouthProfile[]) {
  return youths
    .flatMap<LearningProgressNote>((youth) =>
      youth.notes
        .filter(isLearningProgressNote)
        .map((note) => ({ note, youth })),
    )
    .sort((a, b) => b.note.recordedAt.localeCompare(a.note.recordedAt));
}

function isLearningProgressNote(note: YouthSpecialNote) {
  return learningProgressPattern.test(
    [note.title, note.summary, note.detail, note.category].join(" "),
  );
}

function ChangeLogValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-2">
      <p className="font-semibold text-[#394150]">{label}</p>
      <p className="mt-1 whitespace-pre-line break-words leading-5 [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function TimeSlotLabel({ slot }: { slot: LearningTimeSlot }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{formatHourLabel(slot.startHour)} -</span>
      <span>{formatHourLabel(slot.endHour)}</span>
    </span>
  );
}

function getChangeLogDetail(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const previousContent = getNullableStringValue(
    metadata,
    "previousContent",
  );
  const nextContent = getNullableStringValue(metadata, "nextContent");
  const scheduleDate = getScheduleDateValue(metadata);

  if (
    previousContent === undefined &&
    nextContent === undefined &&
    !scheduleDate
  ) {
    return null;
  }

  return {
    previousContent: previousContent ?? null,
    nextContent: nextContent ?? null,
    scheduleDate,
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

function getScheduleDateValue(value: object) {
  const record = value as Record<string, unknown>;
  const scheduleDate =
    typeof record.scheduleDate === "string" ? record.scheduleDate : null;
  const sourceScheduleDate =
    typeof record.sourceScheduleDate === "string"
      ? record.sourceScheduleDate
      : null;
  const candidate = scheduleDate ?? sourceScheduleDate;

  return candidate && isYouthLearningScheduleDate(candidate) ? candidate : null;
}

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour <= 12 ? hour : hour - 12;

  return `${period} ${displayHour}시`;
}

function formatMinuteLabel(minute: number) {
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;

  return minutePart === 0
    ? formatHourLabel(hour)
    : `${formatHourLabel(hour)} ${minutePart}분`;
}

function formatScheduleRangeLabel(startMinute: number, endMinute: number) {
  return `${formatMinuteLabel(startMinute)} - ${formatMinuteLabel(endMinute)}`;
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

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${year}. ${month}. ${day}.`;
}

function formatDateWithWeekday(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return value;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);

  return `${formatDate(value)} (${weekday})`;
}
