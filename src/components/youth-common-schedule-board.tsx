"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  PointerEvent,
} from "react";
import { AppModal } from "@/components/app-modal";
import { UserIdentity } from "@/components/user-identity";
import type {
  YouthActionResult,
  YouthCommonSchedule,
  YouthCommonScheduleChangeLog,
  YouthCommonScheduleChangeLogActor,
  YouthCommonScheduleChangeLogFilters,
  YouthCommonScheduleWeekdayFilter,
  YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";
import type { YouthCommonScheduleChangeLogsResult } from "@/lib/youth-common-schedules";
import {
  getYouthLearningScheduleEndHourFromMinute,
  getYouthLearningScheduleEndMinute,
  getYouthLearningScheduleStartHourFromMinute,
  getYouthLearningScheduleStartMinute,
  isYouthCommonScheduleWeekday,
  normalizeYouthCommonScheduleWeekdays,
  youthCommonScheduleWeekdays,
  youthLearningScheduleEndHour,
  youthLearningScheduleMinuteStep,
  youthLearningScheduleStartHour,
} from "@/lib/youth-management-core";

type YouthCommonScheduleBoardProps = {
  changeLogActors: YouthCommonScheduleChangeLogActor[];
  changeLogFilterControls?: React.ReactNode;
  changeLogFilters: YouthCommonScheduleChangeLogFilters;
  changeLogs: YouthCommonScheduleChangeLog[];
  deleteSchedule: (
    weekday: number,
    startMinute: number,
  ) => Promise<
    YouthActionResult<{
      weekday: YouthLearningScheduleWeekday;
      startMinute: number;
    }>
  >;
  loadChangeLogs?: (
    filters: Pick<
      YouthCommonScheduleChangeLogFilters,
      "actorId" | "page" | "weekday"
    >,
  ) => Promise<
    YouthActionResult<{ changeLogResult: YouthCommonScheduleChangeLogsResult }>
  >;
  saveSchedule: (
    weekday: number,
    startMinute: number,
    endMinute: number,
    content: string,
    recurrenceWeekdays: number[],
    sourceStartMinute?: number,
  ) => Promise<
    YouthActionResult<{
      schedules: YouthCommonSchedule[];
      sourceStartMinute: number;
      targetWeekdays: YouthLearningScheduleWeekday[];
    }>
  >;
  labels?: Partial<CommonScheduleBoardLabels>;
  schedules: YouthCommonSchedule[];
};

type CommonScheduleBoardLabels = {
  basePath: string;
  boardAriaLabel: string;
  changeLogAriaLabel: string;
  changeLogFallbackMessage: string;
  description: string;
  loadingLabel: string;
  noMatchingChangeLogsMessage: string;
  paginationAriaLabel: string;
  scheduleTitle: string;
  staffFilterAriaLabel: string;
  weekdayFilterAriaLabel: string;
};

type CommonTimeSlot = {
  endHour: number;
  endMinute: number;
  label: string;
  startHour: number;
  startMinute: number;
};

type SelectedCell = {
  startMinute: number;
  weekday: YouthLearningScheduleWeekday;
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

const commonScheduleSlotHeight = 88;
const commonScheduleMinuteHeight = commonScheduleSlotHeight / 60;
const commonScheduleTimelineHeight =
  (youthLearningScheduleEndHour - youthLearningScheduleStartHour) *
  commonScheduleSlotHeight;

const defaultCommonScheduleBoardLabels: CommonScheduleBoardLabels = {
  basePath: "/youth/common-schedule",
  boardAriaLabel: "청소년 공통 일정표",
  changeLogAriaLabel: "공통 일정표 변경내역",
  changeLogFallbackMessage: "공통 일정표 변경내역을 기록했습니다.",
  description: "오전 9시부터 오후 6시까지 요일별 공통 일정을 관리합니다.",
  loadingLabel: "공통 일정표 불러오는 중",
  noMatchingChangeLogsMessage: "조건에 맞는 변경내역이 없습니다.",
  paginationAriaLabel: "공통 일정표 변경내역 페이지",
  scheduleTitle: "공통 일정표",
  staffFilterAriaLabel: "공통 일정표 변경내역 직원 필터",
  weekdayFilterAriaLabel: "공통 일정표 변경내역 요일 필터",
};

function resolveCommonScheduleBoardLabels(
  labels: Partial<CommonScheduleBoardLabels> | undefined,
): CommonScheduleBoardLabels {
  return {
    ...defaultCommonScheduleBoardLabels,
    ...labels,
  };
}

const commonTimeSlots: CommonTimeSlot[] = Array.from(
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

export function YouthCommonScheduleBoard({
  changeLogActors,
  changeLogFilterControls,
  changeLogFilters,
  changeLogs,
  deleteSchedule,
  labels,
  loadChangeLogs,
  saveSchedule,
  schedules,
}: YouthCommonScheduleBoardProps) {
  const resolvedLabels = resolveCommonScheduleBoardLabels(labels);
  const [scheduleItems, setScheduleItems] = useState(schedules);
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
  const [pendingScheduleAction, startPendingScheduleAction] = useTransition();
  const [changeLogState, setChangeLogState] = useState({
    filters: changeLogFilters,
    logs: changeLogs,
  });
  const [changeLogError, setChangeLogError] = useState("");
  const [pendingChangeLogPage, setPendingChangeLogPage] = useState<
    number | null
  >(null);
  const [isChangeLogPending, startChangeLogTransition] = useTransition();
  const pendingBoardAction = pendingScheduleAction;

  const scheduleMap = useMemo(() => {
    const nextMap = new Map<string, YouthCommonSchedule>();

    for (const schedule of scheduleItems) {
      nextMap.set(
        createCommonScheduleKey(schedule.weekday, schedule.startMinute),
        schedule,
      );
    }

    return nextMap;
  }, [scheduleItems]);

  const schedulesByWeekday = useMemo(() => {
    const nextMap = new Map<YouthLearningScheduleWeekday, YouthCommonSchedule[]>();

    for (const schedule of scheduleItems) {
      const currentSchedules = nextMap.get(schedule.weekday) ?? [];
      currentSchedules.push(schedule);
      nextMap.set(schedule.weekday, currentSchedules);
    }

    for (const currentSchedules of nextMap.values()) {
      currentSchedules.sort(sortCommonScheduleItems);
    }

    return nextMap;
  }, [scheduleItems]);

  const selectedWeekday = selectedCell
    ? youthCommonScheduleWeekdays.find(
        (weekday) => weekday.value === selectedCell.weekday,
      )
    : null;
  const selectedSlot = selectedCell
    ? commonTimeSlots.find(
        (slot) =>
          slot.startMinute <= selectedCell.startMinute &&
          selectedCell.startMinute < slot.endMinute,
      )
    : null;
  const selectedSchedule = selectedCell
    ? scheduleMap.get(
        createCommonScheduleKey(selectedCell.weekday, selectedCell.startMinute),
      )
    : undefined;
  const selectedTimeLabel = selectedCell
    ? formatScheduleRangeLabel(startMinuteDraft, endMinuteDraft)
    : "";
  const currentChangeLogFilters = changeLogState.filters;
  const currentChangeLogs = changeLogState.logs;

  const loadChangeLogPage = useCallback(
    (
      page: number,
      options?: {
        filters?: Pick<
          YouthCommonScheduleChangeLogFilters,
          "actorId" | "page" | "weekday"
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
        weekday: options?.filters?.weekday ?? changeLogState.filters.weekday,
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
              total: changeLogResult.total,
              totalPages: changeLogResult.totalPages,
              weekday: changeLogResult.weekday,
            },
            logs: changeLogResult.logs,
          });
          setChangeLogError("");

          if (updateHistory) {
            window.history.pushState(
              { commonScheduleLogPage: changeLogResult.page },
              "",
              createCommonScheduleChangeLogHref({
                actorId: changeLogResult.actorId,
                basePath: resolvedLabels.basePath,
                page: changeLogResult.page,
                weekday: changeLogResult.weekday,
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
      changeLogState.filters.weekday,
      loadChangeLogs,
      resolvedLabels.basePath,
    ],
  );

  useEffect(() => {
    if (!loadChangeLogs) {
      return;
    }

    function loadFromHistory() {
      const filters = getCommonScheduleChangeLogFiltersFromLocation();

      loadChangeLogPage(filters.page, {
        filters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [loadChangeLogPage, loadChangeLogs]);

  function openScheduleModal(
    weekday: YouthLearningScheduleWeekday,
    startMinute: number,
  ) {
    const schedule = scheduleMap.get(createCommonScheduleKey(weekday, startMinute));

    setSelectedCell({ weekday, startMinute });
    setStartMinuteDraft(schedule?.startMinute ?? startMinute);
    setEndMinuteDraft(schedule?.endMinute ?? startMinute + 60);
    setScheduleDraft(schedule?.content ?? "");
    setRecurrenceWeekdayDraft([weekday]);
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
    if (!selectedCell || pendingScheduleAction) {
      return;
    }

    const sourceStartMinute = selectedCell.startMinute;

    startPendingScheduleAction(async () => {
      const result = await saveSchedule(
        selectedCell.weekday,
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
        mergeCommonScheduleResultItems(
          current,
          result.data.targetWeekdays,
          result.data.sourceStartMinute,
          result.data.schedules,
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
        selectedCell.weekday,
        selectedCell.startMinute,
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeCommonScheduleItems(
          current,
          result.data.weekday,
          result.data.startMinute,
          null,
        ),
      );
      closeScheduleModal();
    });
  }

  function saveSelectedScheduleWithKeyboard(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if ((!event.metaKey && !event.ctrlKey) || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    saveSelectedSchedule();
  }

  function startScheduleDrag(
    event: PointerEvent<HTMLButtonElement>,
    schedule: YouthCommonSchedule,
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
          (commonScheduleMinuteHeight * youthLearningScheduleMinuteStep),
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
    schedule: YouthCommonSchedule,
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
      openScheduleModal(schedule.weekday, schedule.startMinute);
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
      endMinute: nextEndMinute,
      startHour: getYouthLearningScheduleStartHourFromMinute(nextStartMinute),
      startMinute: nextStartMinute,
    };

    setScheduleItems((current) =>
      mergeCommonScheduleItems(
        current,
        schedule.weekday,
        schedule.startMinute,
        optimisticSchedule,
      ),
    );
    setFormError("");

    startPendingScheduleAction(async () => {
      const result = await saveSchedule(
        schedule.weekday,
        nextStartMinute,
        nextEndMinute,
        schedule.content,
        [schedule.weekday],
        schedule.startMinute,
      );

      if (!result.ok) {
        setScheduleItems((current) =>
          mergeCommonScheduleItems(
            current,
            schedule.weekday,
            nextStartMinute,
            schedule,
          ),
        );
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeCommonScheduleResultItems(
          current,
          [schedule.weekday],
          nextStartMinute,
          result.data.schedules,
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
    setRecurrenceWeekdayDraft((current) => {
      if (selectedCell?.weekday === weekday) {
        return normalizeYouthCommonScheduleWeekdays([...current, weekday]);
      }

      return current.includes(weekday)
        ? normalizeYouthCommonScheduleWeekdays(
            current.filter((currentWeekday) => currentWeekday !== weekday),
          )
        : normalizeYouthCommonScheduleWeekdays([...current, weekday]);
    });
    setFormError("");
  }

  return (
    <section aria-label={resolvedLabels.boardAriaLabel} className="space-y-6">
      <div className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#eef1f5] px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#16181d]">
              {resolvedLabels.scheduleTitle}
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              {resolvedLabels.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link
              href={`${resolvedLabels.basePath}/print`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
            >
              세로 인쇄
            </Link>
            <Link
              href={`${resolvedLabels.basePath}/print?orientation=landscape`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
            >
              가로 인쇄
            </Link>
          </div>
        </div>

        {formError ? (
          <p className="border-b border-[#f0c6c6] bg-[#fff1f1] px-4 py-2 text-sm text-[#8a1f1f]">
            {formError}
          </p>
        ) : null}

        <div className="relative">
          <div
            aria-hidden={pendingBoardAction}
            inert={pendingBoardAction ? true : undefined}
            className={["overflow-x-auto", pendingBoardAction ? "invisible" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              className="grid min-w-[820px] text-sm"
              style={{
                gridTemplateColumns: `6.5rem repeat(${youthCommonScheduleWeekdays.length}, minmax(10rem, 1fr))`,
              }}
            >
              <div className="sticky left-0 z-30 border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-left text-xs font-semibold text-[#394150]">
                시간
              </div>
              {youthCommonScheduleWeekdays.map((weekday) => (
                <div
                  key={weekday.value}
                  className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-left text-xs font-semibold text-[#394150]"
                >
                  <span className="flex h-8 min-w-0 items-center">
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                      {weekday.label}
                    </span>
                  </span>
                </div>
              ))}

              <div
                className="sticky left-0 z-20 border-r border-[#d9dee7] bg-white"
                style={{ height: commonScheduleTimelineHeight }}
              >
                {commonTimeSlots.map((slot) => (
                  <div
                    key={slot.startHour}
                    className="flex h-[88px] items-start border-b border-[#eef1f5] px-3 py-3 text-xs font-semibold leading-4 text-[#394150]"
                  >
                    <TimeSlotLabel slot={slot} />
                  </div>
                ))}
              </div>

              {youthCommonScheduleWeekdays.map((weekday) => {
                const weekdaySchedules =
                  schedulesByWeekday.get(weekday.value) ?? [];

                return (
                  <div
                    key={weekday.value}
                    className="relative border-r border-[#eef1f5] bg-white"
                    style={{ height: commonScheduleTimelineHeight }}
                  >
                    <div className="absolute inset-0">
                      {commonTimeSlots.map((slot) => (
                        <button
                          key={slot.startHour}
                          type="button"
                          aria-label={`${weekday.label} ${slot.label} 일정 입력`}
                          onClick={() =>
                            openScheduleModal(weekday.value, slot.startMinute)
                          }
                          className="block h-[88px] w-full border-b border-[#eef1f5] px-3 py-3 text-left text-xs text-[#9aa4b2] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#d7eceb]"
                        >
                          미입력
                        </button>
                      ))}
                    </div>

                    {weekdaySchedules.map((schedule) => {
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
                          commonScheduleMinuteHeight +
                        4;
                      const scheduleHeight = Math.max(
                        48,
                        (previewEndMinute - previewStartMinute) *
                          commonScheduleMinuteHeight -
                          8,
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
                              startScheduleDrag(event, schedule, "resize-start")
                            }
                            onPointerMove={moveScheduleDrag}
                            onPointerUp={(event) =>
                              finishScheduleDrag(event, schedule)
                            }
                            onPointerCancel={cancelScheduleDrag}
                            className="absolute inset-x-0 top-0 z-20 flex h-3.5 cursor-ns-resize touch-none items-center justify-center bg-[#d7eceb]/80 transition hover:bg-[#c7e2e0] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
                          >
                            <span
                              aria-hidden="true"
                              className="h-1 w-8 rounded-full bg-[#196b69]"
                            />
                          </button>
                          <button
                            type="button"
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openScheduleModal(
                                  schedule.weekday,
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
                            className="relative z-10 block h-full w-full cursor-move touch-none px-3 pb-5 pt-5 text-left transition hover:bg-[#ecf7f6] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
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
                          </button>
                          <button
                            type="button"
                            aria-label={`${formatScheduleRangeLabel(
                              previewStartMinute,
                              previewEndMinute,
                            )} 종료 시간 조절`}
                            title="종료 시간 조절"
                            onPointerDown={(event) =>
                              startScheduleDrag(event, schedule, "resize-end")
                            }
                            onPointerMove={moveScheduleDrag}
                            onPointerUp={(event) =>
                              finishScheduleDrag(event, schedule)
                            }
                            onPointerCancel={cancelScheduleDrag}
                            className="absolute inset-x-0 bottom-0 z-20 flex h-3.5 cursor-ns-resize touch-none items-center justify-center bg-[#d7eceb]/80 transition hover:bg-[#c7e2e0] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
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
          {pendingBoardAction ? (
            <CommonTimetableSkeleton overlay labels={resolvedLabels} />
          ) : null}
        </div>
      </div>

      <section
        aria-busy={isChangeLogPending || undefined}
        aria-label={resolvedLabels.changeLogAriaLabel}
      >
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              변경내역
            </h2>
            <CommonScheduleChangeLogListSummary
              filters={currentChangeLogFilters}
            />
          </div>
          {changeLogFilterControls ?? (
            <CommonScheduleChangeLogFilterControls
              actors={changeLogActors}
              filters={currentChangeLogFilters}
              labels={resolvedLabels}
            />
          )}
        </div>
        {changeLogError ? (
          <p className="mt-3 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]">
            {changeLogError}
          </p>
        ) : null}
        {currentChangeLogs.length > 0 ? (
          <ol
            className={[
              "mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white",
              isChangeLogPending ? "opacity-60" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {currentChangeLogs.map((log) => {
              const detail = getCommonScheduleChangeLogDetail(log.metadata);

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
                      {log.message ?? resolvedLabels.changeLogFallbackMessage}
                    </p>
                    {detail ? (
                      <>
                        <p className="mt-1 text-xs font-medium text-[#697386]">
                          {detail.weekdayLabel}
                          {detail.timeLabel ? ` · ${detail.timeLabel}` : ""}
                        </p>
                        {detail.previousContent !== null ||
                        detail.nextContent !== null ? (
                          <div className="mt-2 grid gap-2 text-xs text-[#697386] sm:grid-cols-2">
                            {detail.previousContent !== null ? (
                              <CommonScheduleChangeLogValue
                                label="변경 전"
                                value={detail.previousContent}
                              />
                            ) : null}
                            {detail.nextContent !== null ? (
                              <CommonScheduleChangeLogValue
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
            {resolvedLabels.noMatchingChangeLogsMessage}
          </p>
        )}
        <CommonScheduleChangeLogPagination
          filters={currentChangeLogFilters}
          isPending={isChangeLogPending}
          labels={resolvedLabels}
          onPageChange={loadChangeLogs ? loadChangeLogPage : undefined}
          pendingPage={pendingChangeLogPage}
        />
      </section>

      {selectedCell && selectedWeekday && selectedSlot ? (
        <AppModal
          className="max-w-2xl"
          labelledBy="common-schedule-modal-title"
          onClose={closeScheduleModal}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveSelectedSchedule();
            }}
          >
            <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
              <div className="px-6 pb-6 pt-6">
                <p className="text-xs font-semibold text-[#697386]">
                  일정 입력
                </p>
                <h2
                  id="common-schedule-modal-title"
                  className="mt-2 break-words text-2xl font-semibold leading-tight text-[#16181d]"
                >
                  {selectedWeekday.label} · {selectedTimeLabel}
                </h2>

                {formError ? (
                  <p className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                    {formError}
                  </p>
                ) : null}

                <div className="mt-5 divide-y divide-[#eef1f5] border-y border-[#eef1f5]">
                  <div className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <span className="text-sm font-medium text-[#697386]">
                      시간
                    </span>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <select
                        aria-label="시작 시간"
                        value={startMinuteDraft}
                        onChange={(event) => {
                          updateStartMinuteDraft(Number(event.target.value));
                        }}
                        className="h-9 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        {createCommonScheduleStartMinuteOptions().map(
                          (minute) => (
                            <option key={minute} value={minute}>
                              {formatMinuteLabel(minute)}
                            </option>
                          ),
                        )}
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
                        onChange={(event) => {
                          setEndMinuteDraft(Number(event.target.value));
                          setFormError("");
                        }}
                        className="h-9 w-full rounded-md border border-transparent bg-white px-2 text-sm text-[#16181d] outline-none transition hover:border-[#d9dee7] hover:bg-[#f7f9fc] focus:border-[#196b69] focus:bg-white focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        {createCommonScheduleEndMinuteOptions(
                          startMinuteDraft,
                        ).map((minute) => (
                          <option key={minute} value={minute}>
                            {formatMinuteLabel(minute)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <fieldset className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <legend className="sr-only">반복 요일</legend>
                    <span className="text-sm font-medium text-[#697386]">
                      반복
                    </span>
                    <div className="grid grid-cols-7 gap-2">
                      {youthCommonScheduleWeekdays.map((weekday) => {
                        const selected = recurrenceWeekdayDraft.includes(
                          weekday.value,
                        );

                        return (
                          <button
                            key={weekday.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              toggleRecurrenceWeekday(weekday.value)
                            }
                            className={[
                              "h-9 rounded-md border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#d7eceb]",
                              selected
                                ? "border-[#196b69] bg-[#196b69] text-white"
                                : "border-transparent bg-white text-[#394150] hover:border-[#d9dee7] hover:bg-[#f7f9fc]",
                            ].join(" ")}
                          >
                            {weekday.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>

                <textarea
                  aria-label="일정 내용"
                  data-modal-plain-body="true"
                  value={scheduleDraft}
                  onChange={(event) => {
                    setScheduleDraft(event.target.value);
                    setFormError("");
                  }}
                  onKeyDown={saveSelectedScheduleWithKeyboard}
                  autoFocus
                  placeholder="일정 내용을 입력하세요."
                  rows={10}
                  className="mt-6 block min-h-[16rem] w-full resize-y border-0 bg-transparent px-0 py-0 text-base leading-7 text-[#16181d] outline-none placeholder:text-[#a5afbd]"
                />
              </div>
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
        </AppModal>
      ) : null}
    </section>
  );
}

function CommonScheduleChangeLogListSummary({
  filters,
}: {
  filters: YouthCommonScheduleChangeLogFilters;
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

type CommonScheduleChangeLogFilterControlsProps = {
  actors: YouthCommonScheduleChangeLogActor[];
  filters: YouthCommonScheduleChangeLogFilters;
  labels?: Partial<CommonScheduleBoardLabels>;
};

function CommonScheduleChangeLogFilterControls(
  props: CommonScheduleChangeLogFilterControlsProps,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <CommonScheduleChangeLogFilterControlsContent
      {...props}
      isPending={isPending}
      navigate={navigate}
    />
  );
}

export function CommonScheduleChangeLogFilterControlsContent({
  actors,
  filters,
  isPending = false,
  labels,
  navigate,
}: CommonScheduleChangeLogFilterControlsProps & {
  isPending?: boolean;
  navigate: (href: string) => void;
}) {
  const resolvedLabels = resolveCommonScheduleBoardLabels(labels);
  const hasFilters = filters.actorId !== "all" || filters.weekday !== "all";

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    navigate(
      createCommonScheduleChangeLogHref({
        actorId: String(formData.get("logStaff") ?? "all"),
        basePath: resolvedLabels.basePath,
        page: 1,
        weekday: getWeekdayFilterFromFormValue(
          String(formData.get("logWeekday") ?? "all"),
        ),
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
      key={`${filters.actorId}:${filters.weekday}`}
      onSubmit={submitFilters}
    >
      <label>
        <span className="block text-xs font-semibold text-[#697386]">직원</span>
        <select
          aria-label={resolvedLabels.staffFilterAriaLabel}
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
        <span className="block text-xs font-semibold text-[#697386]">요일</span>
        <select
          aria-label={resolvedLabels.weekdayFilterAriaLabel}
          name="logWeekday"
          defaultValue={String(filters.weekday)}
          disabled={isPending}
          onChange={submitFilter}
          className="mt-2 block h-10 w-36 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        >
          <option value="all">전체 요일</option>
          {youthCommonScheduleWeekdays.map((weekday) => (
            <option key={weekday.value} value={weekday.value}>
              {weekday.label}
            </option>
          ))}
        </select>
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
              createCommonScheduleChangeLogHref({
                actorId: "all",
                basePath: resolvedLabels.basePath,
                page: 1,
                weekday: "all",
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

function CommonScheduleChangeLogPagination({
  filters,
  isPending,
  labels,
  onPageChange,
  pendingPage,
}: {
  filters: YouthCommonScheduleChangeLogFilters;
  isPending: boolean;
  labels?: Partial<CommonScheduleBoardLabels>;
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
}) {
  if (filters.totalPages <= 1) {
    return null;
  }

  const resolvedLabels = resolveCommonScheduleBoardLabels(labels);

  return (
    <nav
      aria-label={resolvedLabels.paginationAriaLabel}
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9dee7] border-t border-[#eef1f5] bg-white px-4 py-3"
    >
      <p className="text-sm text-[#697386]">
        {filters.page} / {filters.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <CommonScheduleChangeLogPaginationLink
          disabled={filters.page <= 1 || isPending}
          href={createCommonScheduleChangeLogHref({
            actorId: filters.actorId,
            basePath: resolvedLabels.basePath,
            page: filters.page - 1,
            weekday: filters.weekday,
          })}
          onPageChange={onPageChange}
          page={filters.page - 1}
          pending={pendingPage === filters.page - 1}
        >
          이전
        </CommonScheduleChangeLogPaginationLink>
        <CommonScheduleChangeLogPaginationLink
          disabled={filters.page >= filters.totalPages || isPending}
          href={createCommonScheduleChangeLogHref({
            actorId: filters.actorId,
            basePath: resolvedLabels.basePath,
            page: filters.page + 1,
            weekday: filters.weekday,
          })}
          onPageChange={onPageChange}
          page={filters.page + 1}
          pending={pendingPage === filters.page + 1}
        >
          다음
        </CommonScheduleChangeLogPaginationLink>
      </div>
    </nav>
  );
}

function CommonScheduleChangeLogPaginationLink({
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

function createCommonScheduleChangeLogHref({
  actorId,
  basePath = defaultCommonScheduleBoardLabels.basePath,
  page,
  weekday,
}: {
  actorId: string;
  basePath?: string;
  page: number;
  weekday: YouthCommonScheduleWeekdayFilter;
}) {
  const params = new URLSearchParams();

  if (actorId !== "all") {
    params.set("logStaff", actorId);
  }

  if (weekday !== "all") {
    params.set("logWeekday", String(weekday));
  }

  if (page > 1) {
    params.set("logPage", String(page));
  }

  const queryString = params.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

function getCommonScheduleChangeLogFiltersFromLocation(): Pick<
  YouthCommonScheduleChangeLogFilters,
  "actorId" | "page" | "weekday"
> {
  const params = new URLSearchParams(window.location.search);
  const actorId = String(params.get("logStaff") ?? "all").trim();

  return {
    actorId: actorId || "all",
    page: normalizePositivePage(params.get("logPage")),
    weekday: getCommonScheduleWeekdayFromLocation(params),
  };
}

function getCommonScheduleWeekdayFromLocation(
  params: URLSearchParams,
): YouthCommonScheduleWeekdayFilter {
  const weekday = Number(params.get("logWeekday"));

  return isYouthCommonScheduleWeekday(weekday) ? weekday : "all";
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

function CommonScheduleChangeLogValue({
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

function getCommonScheduleChangeLogDetail(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const previousContent = getNullableStringValue(metadata, "previousContent");
  const nextContent = getNullableStringValue(metadata, "nextContent");
  const weekday = getWeekdayValue(metadata);
  const timeLabel = getOptionalStringValue(metadata, "timeLabel");

  if (
    previousContent === undefined &&
    nextContent === undefined &&
    weekday === null &&
    !timeLabel
  ) {
    return null;
  }

  return {
    nextContent: nextContent ?? null,
    previousContent: previousContent ?? null,
    timeLabel,
    weekdayLabel: weekday === null ? "요일 미확인" : formatWeekdayLabel(weekday),
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

function getWeekdayValue(value: object) {
  const item = (value as Record<string, unknown>).weekday;
  const weekday = typeof item === "number" ? item : Number(item);

  return isCommonScheduleWeekday(weekday) ? weekday : null;
}

function getWeekdayFilterFromFormValue(
  value: string,
): YouthCommonScheduleWeekdayFilter {
  const weekday = Number(value);

  return isCommonScheduleWeekday(weekday) ? weekday : "all";
}

function isCommonScheduleWeekday(
  value: number,
): value is YouthLearningScheduleWeekday {
  return youthCommonScheduleWeekdays.some((weekday) => weekday.value === value);
}

function formatWeekdayLabel(weekday: YouthLearningScheduleWeekday) {
  return (
    youthCommonScheduleWeekdays.find((item) => item.value === weekday)?.label ??
    `${weekday}`
  );
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

export function CommonTimetableSkeleton({
  labels,
  overlay = false,
}: {
  labels?: Partial<CommonScheduleBoardLabels>;
  overlay?: boolean;
}) {
  const resolvedLabels = resolveCommonScheduleBoardLabels(labels);
  const skeletonBlocks = [0, 3, 6].map((slotIndex) => ({
    height: slotIndex === 3 ? 104 : 72,
    top: slotIndex * commonScheduleSlotHeight + 8,
  }));

  return (
    <div
      aria-busy="true"
      aria-label={resolvedLabels.loadingLabel}
      className={
        overlay
          ? "pointer-events-none absolute inset-0 z-40 overflow-hidden"
          : "overflow-x-auto"
      }
      role="status"
    >
      <div
        className="grid min-w-[820px] text-sm"
        style={{
          gridTemplateColumns: `6.5rem repeat(${youthCommonScheduleWeekdays.length}, minmax(10rem, 1fr))`,
        }}
      >
        <div className="sticky left-0 z-30 border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3">
          <span className="flex h-8 items-center">
            <span className="block h-3 w-10 animate-pulse rounded bg-[#dce3ec] dark:bg-[#30363d]" />
          </span>
        </div>
        {youthCommonScheduleWeekdays.map((weekday) => (
          <div
            key={`skeleton-header-${weekday.value}`}
            className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3"
          >
            <span className="flex h-8 items-center">
              <span className="block h-3 w-16 animate-pulse rounded bg-[#dce3ec] dark:bg-[#30363d]" />
            </span>
          </div>
        ))}

        <div
          className="sticky left-0 z-20 border-r border-[#d9dee7] bg-white"
          style={{ height: commonScheduleTimelineHeight }}
        >
          {commonTimeSlots.map((slot) => (
            <div
              key={`skeleton-time-${slot.startHour}`}
              className="flex h-[88px] items-start border-b border-[#eef1f5] px-3 py-3 text-xs font-semibold leading-4 text-[#9aa4b2] dark:text-[#8b949e]"
            >
              <TimeSlotLabel slot={slot} />
            </div>
          ))}
        </div>

        {youthCommonScheduleWeekdays.map((weekday) => (
          <div
            key={`skeleton-column-${weekday.value}`}
            className="relative border-r border-[#eef1f5] bg-white"
            style={{ height: commonScheduleTimelineHeight }}
          >
            <div className="absolute inset-0">
              {commonTimeSlots.map((slot) => (
                <div
                  key={`skeleton-cell-${weekday.value}-${slot.startHour}`}
                  className="h-[88px] border-b border-[#eef1f5]"
                />
              ))}
            </div>
            {skeletonBlocks.map((block, blockIndex) => (
              <div
                key={`skeleton-block-${weekday.value}-${blockIndex}`}
                className="absolute left-2 right-2 overflow-hidden rounded-md border border-[#d6e6e4] bg-[#f5fbfa] shadow-sm dark:border-[#30363d] dark:bg-[#161b22]"
                style={{
                  height: block.height,
                  top: block.top,
                }}
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 flex h-3.5 items-center justify-center bg-[#e4f0ef]/90 dark:bg-[#1f6feb]/15"
                >
                  <span className="block h-1 w-9 animate-pulse rounded-full bg-[#b7d3d0] dark:bg-[#58a6ff]/35" />
                </div>
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 flex h-3.5 items-center justify-center bg-[#e4f0ef]/90 dark:bg-[#1f6feb]/15"
                >
                  <span className="block h-1 w-9 animate-pulse rounded-full bg-[#b7d3d0] dark:bg-[#58a6ff]/35" />
                </div>
                <div className="animate-pulse px-3 pb-6 pt-6">
                  <span className="block h-2.5 w-20 rounded bg-[#cddfdd] dark:bg-[#30363d]" />
                  <span className="mt-3 block h-3 w-28 rounded bg-[#d7e6e4] dark:bg-[#21262d]" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommonScheduleBoardSkeleton({
  labels,
}: {
  labels?: Partial<CommonScheduleBoardLabels>;
}) {
  const resolvedLabels = resolveCommonScheduleBoardLabels(labels);

  return (
    <section aria-label={resolvedLabels.boardAriaLabel} className="space-y-6">
      <div className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#eef1f5] px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#16181d]">
              {resolvedLabels.scheduleTitle}
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              {resolvedLabels.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <CommonScheduleSkeletonBlock className="h-10 w-full sm:w-24" />
            <CommonScheduleSkeletonBlock className="h-10 w-full sm:w-24" />
          </div>
        </div>

        <CommonTimetableSkeleton labels={resolvedLabels} />
      </div>

      <section aria-label={resolvedLabels.changeLogAriaLabel}>
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              변경내역
            </h2>
            <CommonScheduleSkeletonBlock className="mt-2 h-4 w-44 max-w-full" />
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[9rem_9rem_auto]">
            <CommonScheduleSkeletonBlock className="h-10 w-full" />
            <CommonScheduleSkeletonBlock className="h-10 w-full" />
            <CommonScheduleSkeletonBlock className="h-10 w-full sm:w-20" />
          </div>
        </div>
        <ol className="mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white">
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              className="grid gap-3 px-4 py-3 lg:grid-cols-[12rem_1fr]"
            >
              <div className="min-w-0">
                <CommonScheduleSkeletonBlock className="h-4 w-24" />
                <CommonScheduleSkeletonBlock className="mt-2 h-8 w-32" />
              </div>
              <div className="min-w-0">
                <CommonScheduleSkeletonBlock className="h-4 w-3/5 max-w-full" />
                <CommonScheduleSkeletonBlock className="mt-2 h-3 w-40 max-w-full" />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <CommonScheduleSkeletonBlock className="h-12 w-full" />
                  <CommonScheduleSkeletonBlock className="h-12 w-full" />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function CommonScheduleSkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-[#edf1f5] ${className}`}
    />
  );
}

export function createCommonScheduleStartMinuteOptions() {
  return createMinuteOptions(
    getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour),
    getYouthLearningScheduleEndMinute(),
  );
}

export function createCommonScheduleEndMinuteOptions(startMinute: number) {
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

function mergeCommonScheduleItems(
  current: YouthCommonSchedule[],
  weekday: YouthLearningScheduleWeekday,
  startMinute: number,
  schedule: YouthCommonSchedule | null,
) {
  const key = createCommonScheduleKey(weekday, startMinute);
  const withoutCurrent = current.filter(
    (item) => createCommonScheduleKey(item.weekday, item.startMinute) !== key,
  );

  return schedule
    ? [...withoutCurrent, schedule].sort(sortCommonScheduleItems)
    : withoutCurrent;
}

function mergeCommonScheduleResultItems(
  current: YouthCommonSchedule[],
  weekdays: YouthLearningScheduleWeekday[],
  sourceStartMinute: number,
  schedules: YouthCommonSchedule[],
) {
  const weekdaySet = new Set(weekdays);
  const withoutCurrent = current.filter(
    (item) =>
      !weekdaySet.has(item.weekday) || item.startMinute !== sourceStartMinute,
  );

  return [...withoutCurrent, ...schedules].sort(sortCommonScheduleItems);
}

function sortCommonScheduleItems(
  first: YouthCommonSchedule,
  second: YouthCommonSchedule,
) {
  return (
    first.weekday - second.weekday ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute
  );
}

function getScheduleDragBounds(
  schedule: YouthCommonSchedule,
  schedules: YouthCommonSchedule[],
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
  schedule: YouthCommonSchedule,
  schedules: YouthCommonSchedule[],
) {
  const dayStartMinute = getYouthLearningScheduleStartMinute(
    youthLearningScheduleStartHour,
  );
  let previousEndMinute = dayStartMinute;
  let nextStartMinute = getYouthLearningScheduleEndMinute();

  for (const item of schedules) {
    if (item.id === schedule.id || item.weekday !== schedule.weekday) {
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

function createCommonScheduleKey(
  weekday: YouthLearningScheduleWeekday,
  startMinute: number,
) {
  return `${weekday}:${startMinute}`;
}

function TimeSlotLabel({ slot }: { slot: CommonTimeSlot }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{formatHourLabel(slot.startHour)} -</span>
      <span>{formatHourLabel(slot.endHour)}</span>
    </span>
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
