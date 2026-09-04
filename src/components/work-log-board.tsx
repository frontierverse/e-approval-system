"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { AppModal } from "@/components/app-modal";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { formatKoreanDateTime } from "@/lib/korean-date";
import {
  buildWorkLogContributionWeeks,
  formatWorkLogDateLabel,
  getWorkLogContributionRange,
  getWorkLogMonthLabels,
  isWorkLogDate,
  workLogContentMaxLength,
  workLogKeywordMaxLength,
  type WorkLogDeleteFormState,
  type WorkLogEntry,
  type WorkLogFormState,
} from "@/lib/work-log-core";
import {
  formatWorkLogLinkedScheduleCount,
  formatWorkLogLinkedScheduleMergeFeedback,
  formatWorkLogLinkedScheduleTimeRange,
  mergeWorkLogLinkedSchedulesIntoContent,
  normalizeWorkLogLinkedScheduleText,
  type WorkLogLinkedSchedule,
  type WorkLogLinkedScheduleLoadState,
  type WorkLogLinkedScheduleMergeResult,
} from "@/lib/work-log-linked-schedule-core";

const initialWorkLogFormState: WorkLogFormState = {};
const initialWorkLogDeleteFormState: WorkLogDeleteFormState = {};
const workLogUnsavedChangesMessage =
  "작성 중인 키워드와 내용이 사라집니다. 다른 날짜로 이동할까요?";
const workLogModalUnsavedChangesMessage =
  "모달에서 수정 중인 내용이 사라집니다. 닫을까요?";
const workLogUnderlyingDraftMessage =
  "아래 작성 폼에 저장하지 않은 내용이 있습니다. 계속하면 해당 내용이 사라질 수 있습니다. 계속할까요?";
const workLogContributionTooltipOffset = 12;
const workLogContributionTooltipWidth = 208;
const workLogContributionTooltipHeight = 52;
const workLogContributionTooltipViewportMargin = 8;

type WorkLogContributionTooltip = {
  date: string;
  dateLabel: string;
  recorded: boolean;
  x: number;
  y: number;
};

type WorkLogContributionTooltipTarget = Omit<
  WorkLogContributionTooltip,
  "x" | "y"
>;

type SaveWorkLogAction = (
  previousState: WorkLogFormState,
  formData: FormData,
) => Promise<WorkLogFormState>;

type DeleteWorkLogAction = (
  previousState: WorkLogDeleteFormState,
  formData: FormData,
) => Promise<WorkLogDeleteFormState>;

type WorkLogDetailRequest = {
  date: string;
  initialEntry: WorkLogEntry | null;
  returnFocusTo: HTMLElement;
};

export function WorkLogBoard({
  contributionDates,
  deleteAction,
  linkedScheduleState,
  recentLogs,
  saveAction,
  selectedDate,
  selectedLog,
  today,
}: {
  contributionDates: string[];
  deleteAction: DeleteWorkLogAction;
  linkedScheduleState: WorkLogLinkedScheduleLoadState;
  recentLogs: WorkLogEntry[];
  saveAction: SaveWorkLogAction;
  selectedDate: string;
  selectedLog: WorkLogEntry | null;
  today: string;
}) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [detailRequest, setDetailRequest] =
    useState<WorkLogDetailRequest | null>(null);

  const openWorkLogDetail = useCallback(
    (date: string, returnFocusTo: HTMLElement) => {
      const initialEntry =
        (selectedLog?.workDate === date ? selectedLog : null) ??
        recentLogs.find((entry) => entry.workDate === date) ??
        null;

      setDetailRequest({ date, initialEntry, returnFocusTo });
    },
    [recentLogs, selectedLog],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return (
    <div className="space-y-4">
      <WorkLogContributionGraph
        key={today}
        onOpenLog={openWorkLogDetail}
        recordedDates={contributionDates}
        today={today}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]">
        <WorkLogEntryForm
          key={`${selectedDate}:${selectedLog?.updatedAt ?? "new"}`}
          existingLog={selectedLog}
          linkedScheduleState={linkedScheduleState}
          saveAction={saveAction}
          selectedDate={selectedDate}
          today={today}
          hasUnsavedChanges={hasUnsavedChanges}
          onUnsavedChangesChange={setHasUnsavedChanges}
        />
        <WorkLogRecentList
          entries={recentLogs}
          hasUnsavedChanges={hasUnsavedChanges}
          selectedDate={selectedDate}
        />
      </div>

      {detailRequest ? (
        <WorkLogDetailModal
          key={`${detailRequest.date}:${detailRequest.initialEntry?.updatedAt ?? "load"}`}
          date={detailRequest.date}
          deleteAction={deleteAction}
          hasUnderlyingDraft={
            hasUnsavedChanges && detailRequest.date === selectedDate
          }
          initialEntry={detailRequest.initialEntry}
          initialLinkedScheduleState={
            detailRequest.date === selectedDate ? linkedScheduleState : null
          }
          onClose={() => setDetailRequest(null)}
          onDeleted={() => {
            const deletedDate = detailRequest.date;

            if (detailRequest.date === selectedDate) {
              setHasUnsavedChanges(false);
            }

            setDetailRequest(null);

            window.requestAnimationFrame(() => {
              document
                .querySelector<HTMLElement>(
                  `[data-work-log-grass-cell="${deletedDate}"]`,
                )
                ?.focus({ preventScroll: true });
            });
          }}
          onSaved={(entry) => {
            if (entry.workDate === selectedDate) {
              setHasUnsavedChanges(false);
            }
          }}
          returnFocusTo={detailRequest.returnFocusTo}
          saveAction={saveAction}
        />
      ) : null}
    </div>
  );
}

export function WorkLogContributionGraph({
  onOpenLog,
  recordedDates,
  today,
}: {
  onOpenLog?: (date: string, returnFocusTo: HTMLElement) => void;
  recordedDates: string[];
  today: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const grassCellRefs = useRef(new Map<string, HTMLElement>());
  const focusedGrassCellRef =
    useRef<WorkLogContributionTooltipTarget | null>(null);
  const descriptionId = useId();
  const tooltipId = useId();
  const [activeDate, setActiveDate] = useState(today);
  const [focusedTooltip, setFocusedTooltip] =
    useState<WorkLogContributionTooltip | null>(null);
  const [pointerTooltip, setPointerTooltip] =
    useState<WorkLogContributionTooltip | null>(null);
  const weeks = useMemo(
    () => buildWorkLogContributionWeeks({ recordedDates, today }),
    [recordedDates, today],
  );
  const monthLabels = useMemo(() => getWorkLogMonthLabels(weeks), [weeks]);
  const recordedDateSet = useMemo(
    () => new Set(recordedDates.filter((date) => date <= today)),
    [recordedDates, today],
  );
  const navigableDates = useMemo(
    () =>
      weeks.flatMap((week) =>
        week.days.filter((day) => !day.future).map((day) => day.date),
      ),
    [weeks],
  );
  const activeTooltip = pointerTooltip ?? focusedTooltip;
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

  useEffect(() => {
    function updateTooltipForViewportChange() {
      setPointerTooltip(null);

      const focusedCell = focusedGrassCellRef.current;

      if (!focusedCell) {
        return;
      }

      const element = grassCellRefs.current.get(focusedCell.date);

      if (!element || document.activeElement !== element) {
        focusedGrassCellRef.current = null;
        setFocusedTooltip(null);
        return;
      }

      const bounds = element.getBoundingClientRect();
      const { x, y } = getWorkLogContributionTooltipPosition(
        bounds.right,
        bounds.bottom,
        window.innerWidth,
        window.innerHeight,
      );

      setFocusedTooltip({ ...focusedCell, x, y });
    }

    window.addEventListener("resize", updateTooltipForViewportChange);
    window.addEventListener("scroll", updateTooltipForViewportChange, true);

    return () => {
      window.removeEventListener("resize", updateTooltipForViewportChange);
      window.removeEventListener("scroll", updateTooltipForViewportChange, true);
    };
  }, []);

  function updateActiveTooltip(
    event: ReactPointerEvent<HTMLElement>,
    date: string,
    recorded: boolean,
  ) {
    if (event.pointerType === "touch") {
      return;
    }

    const { x, y } = getWorkLogContributionTooltipPosition(
      event.clientX,
      event.clientY,
      window.innerWidth,
      window.innerHeight,
    );

    setPointerTooltip({
      date,
      dateLabel: formatWorkLogDateLabel(date),
      recorded,
      x,
      y,
    });
  }

  function showFocusedTooltip(
    event: ReactFocusEvent<HTMLElement>,
    date: string,
    recorded: boolean,
  ) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const { x, y } = getWorkLogContributionTooltipPosition(
      bounds.right,
      bounds.bottom,
      window.innerWidth,
      window.innerHeight,
    );
    const focusedCell = {
      date,
      dateLabel: formatWorkLogDateLabel(date),
      recorded,
    };

    focusedGrassCellRef.current = focusedCell;
    setActiveDate(date);
    setFocusedTooltip({ ...focusedCell, x, y });
  }

  function moveGrassCellFocus(
    event: ReactKeyboardEvent<HTMLElement>,
    date: string,
  ) {
    const dateIndex = navigableDates.indexOf(date);
    const offsetByKey: Partial<Record<string, number>> = {
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
    };
    const offset = offsetByKey[event.key];

    if (event.key === "Escape") {
      event.preventDefault();
      focusedGrassCellRef.current = null;
      setFocusedTooltip(null);
      setPointerTooltip(null);
      return;
    }

    if (offset === undefined || dateIndex < 0) {
      return;
    }

    event.preventDefault();

    const weekday = dateIndex % 7;

    if (
      (event.key === "ArrowDown" && weekday === 6) ||
      (event.key === "ArrowUp" && weekday === 0)
    ) {
      return;
    }

    const nextDate = navigableDates[dateIndex + offset];

    if (!nextDate) {
      return;
    }

    setActiveDate(nextDate);
    grassCellRefs.current.get(nextDate)?.focus();
  }

  return (
    <>
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
          aria-describedby={descriptionId}
          aria-label={`${formatWorkLogDateLabel(startDate)}부터 ${formatWorkLogDateLabel(
            today,
          )}까지 업무일지 잔디 가로 스크롤 영역. ${recordedDateSet.size}일 기록.`}
          onScroll={() => {
            setPointerTooltip(null);
          }}
          role="group"
          className="scrollbar-stable overflow-x-auto rounded-sm pb-2 focus-within:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--focus-ring)]"
        >
          <div
            className="grid w-max"
            style={{
              gridTemplateColumns: "1.5rem repeat(53, 2.75rem)",
              gridTemplateRows: "1rem repeat(7, 2.75rem)",
            }}
          >
            {monthLabels.map((month) => (
              <span
                aria-hidden="true"
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
                aria-hidden="true"
                key={item.label}
                className="flex h-11 items-center text-[10px] text-[var(--text-muted)]"
                style={{ gridColumn: 1, gridRow: item.weekday + 2 }}
              >
                {item.label}
              </span>
            ))}

            {weeks.flatMap((week) =>
              week.days.map((day) => {
                if (day.future) {
                  return (
                    <span
                      aria-hidden="true"
                      className="size-11"
                      key={day.date}
                      style={{
                        gridColumn: week.weekIndex + 2,
                        gridRow: day.weekday + 2,
                      }}
                    />
                  );
                }

                return (
                  <WorkLogGrassCell
                    active={day.date === activeDate}
                    date={day.date}
                    describedBy={
                      activeTooltip?.date === day.date ? tooltipId : undefined
                    }
                    key={day.date}
                    onBlur={() => {
                      focusedGrassCellRef.current = null;
                      setFocusedTooltip(null);
                    }}
                    onFocus={(event) =>
                      showFocusedTooltip(event, day.date, day.recorded)
                    }
                    onKeyDown={(event) =>
                      moveGrassCellFocus(event, day.date)
                    }
                    onOpen={
                      day.recorded && onOpenLog
                        ? (returnFocusTo) => {
                            focusedGrassCellRef.current = null;
                            setFocusedTooltip(null);
                            setPointerTooltip(null);
                            onOpenLog(day.date, returnFocusTo);
                          }
                        : undefined
                    }
                    onPointerCancel={() => setPointerTooltip(null)}
                    onPointerEnter={(event) =>
                      updateActiveTooltip(event, day.date, day.recorded)
                    }
                    onPointerLeave={() => setPointerTooltip(null)}
                    onPointerMove={(event) =>
                      updateActiveTooltip(event, day.date, day.recorded)
                    }
                    recorded={day.recorded}
                    registerCell={(element) => {
                      if (element) {
                        grassCellRefs.current.set(day.date, element);
                      } else {
                        grassCellRefs.current.delete(day.date);
                      }
                    }}
                    weekIndex={week.weekIndex}
                    weekday={day.weekday}
                  />
                );
              }),
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          최근 날짜부터 표시됩니다. 좌우로 스크롤해 이전 날짜를 확인할 수 있습니다.
        </p>
        <p id={descriptionId} className="sr-only">
          표시 범위는 {formatWorkLogDateLabel(startDate)}부터 {formatWorkLogDateLabel(endDate)}까지이며,
          기록된 날짜는 {recordedDateLabels.length > 0 ? recordedDateLabels.join(", ") : "없습니다"}.
        </p>
      </div>
      </section>

      {activeTooltip
        ? createPortal(
            <div
              id={tooltipId}
              aria-label={`${activeTooltip.dateLabel} · ${
                activeTooltip.recorded
                  ? "업무일지 작성 · 클릭하여 보기"
                  : "기록 없음"
              }`}
              data-work-log-tooltip="true"
              role="tooltip"
              className="pointer-events-none fixed z-[1000] w-52 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground)] shadow-lg"
              style={{ left: activeTooltip.x, top: activeTooltip.y }}
            >
              <p className="font-semibold tabular-nums">
                {activeTooltip.dateLabel}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[var(--text-muted)]">
                <span
                  aria-hidden="true"
                  className={[
                    "size-2.5 shrink-0 rounded-[2px] border",
                    activeTooltip.recorded
                      ? "border-[var(--brand)] bg-[var(--brand)]"
                      : "border-[var(--border)] bg-[var(--surface-muted)]",
                  ].join(" ")}
                />
                <span>
                  {activeTooltip.recorded
                    ? "작성됨 · 클릭하여 보기"
                    : "기록 없음"}
                </span>
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function WorkLogGrassCell({
  active,
  date,
  describedBy,
  onBlur,
  onFocus,
  onKeyDown,
  onOpen,
  onPointerCancel,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  recorded,
  registerCell,
  weekIndex,
  weekday,
}: {
  active: boolean;
  date: string;
  describedBy?: string;
  onBlur: () => void;
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onOpen?: (returnFocusTo: HTMLElement) => void;
  onPointerCancel: () => void;
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  recorded: boolean;
  registerCell: (element: HTMLElement | null) => void;
  weekIndex: number;
  weekday: number;
}) {
  const opensDialog = recorded && Boolean(onOpen);
  const commonProps = {
    "aria-describedby": describedBy,
    "aria-label": `${formatWorkLogDateLabel(date)} · ${
      recorded
        ? opensDialog
          ? "업무일지 보기"
          : "업무일지 작성"
        : "기록 없음"
    }`,
    className: [
      "group grid size-11 appearance-none place-items-center rounded-md border-0 bg-transparent p-0 outline-none",
      "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)]",
      opensDialog ? "hover:bg-[var(--surface-hover)]" : "",
    ]
      .filter(Boolean)
      .join(" "),
    "data-work-log-grass-cell": date,
    onBlur,
    onFocus,
    onKeyDown,
    onPointerCancel,
    onPointerEnter,
    onPointerLeave,
    onPointerMove,
    style: {
      cursor: opensDialog ? "pointer" : "default",
      gridColumn: weekIndex + 2,
      gridRow: weekday + 2,
    },
    tabIndex: active ? 0 : -1,
  };

  return (
    <button
      {...commonProps}
      aria-disabled={opensDialog ? undefined : true}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      onClick={
        opensDialog && onOpen
          ? (event) => onOpen(event.currentTarget)
          : undefined
      }
      ref={registerCell}
      type="button"
    >
      <span
        aria-hidden="true"
        className={[
          "size-8 rounded-[3px] border",
          recorded
            ? "border-[var(--brand)] bg-[var(--brand)]"
            : "border-[var(--border)] bg-[var(--surface-muted)]",
          opensDialog
            ? "group-hover:ring-1 group-hover:ring-[var(--brand-strong)]"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </button>
  );
}

export function getWorkLogContributionTooltipPosition(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const preferredX = clientX + workLogContributionTooltipOffset;
  const preferredY = clientY + workLogContributionTooltipOffset;
  const flippedX =
    clientX -
    workLogContributionTooltipWidth -
    workLogContributionTooltipOffset;
  const flippedY =
    clientY -
    workLogContributionTooltipHeight -
    workLogContributionTooltipOffset;
  const maximumX = Math.max(
    workLogContributionTooltipViewportMargin,
    viewportWidth -
      workLogContributionTooltipWidth -
      workLogContributionTooltipViewportMargin,
  );
  const maximumY = Math.max(
    workLogContributionTooltipViewportMargin,
    viewportHeight -
      workLogContributionTooltipHeight -
      workLogContributionTooltipViewportMargin,
  );
  const x =
    preferredX + workLogContributionTooltipWidth <=
    viewportWidth - workLogContributionTooltipViewportMargin
      ? preferredX
      : flippedX;
  const y =
    preferredY + workLogContributionTooltipHeight <=
    viewportHeight - workLogContributionTooltipViewportMargin
      ? preferredY
      : flippedY;

  return {
    x: Math.min(
      maximumX,
      Math.max(workLogContributionTooltipViewportMargin, x),
    ),
    y: Math.min(
      maximumY,
      Math.max(workLogContributionTooltipViewportMargin, y),
    ),
  };
}

type WorkLogDetailLoadState =
  | { status: "error"; message: string }
  | { status: "loading" }
  | { status: "ready"; entry: WorkLogEntry };

type WorkLogDetailMode = "delete" | "edit" | "view";

type WorkLogDetailLoadRequest = {
  id: number;
  mode: "all" | "schedules";
};

export function WorkLogDetailModal({
  date,
  deleteAction,
  hasUnderlyingDraft,
  initialEntry,
  initialLinkedScheduleState,
  onClose,
  onDeleted,
  onSaved,
  returnFocusTo,
  saveAction,
}: {
  date: string;
  deleteAction: DeleteWorkLogAction;
  hasUnderlyingDraft: boolean;
  initialEntry: WorkLogEntry | null;
  initialLinkedScheduleState: WorkLogLinkedScheduleLoadState | null;
  onClose: () => void;
  onDeleted: () => void;
  onSaved: (entry: WorkLogEntry) => void;
  returnFocusTo: HTMLElement | null;
  saveAction: SaveWorkLogAction;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const loadErrorRef = useRef<HTMLDivElement>(null);
  const previousModeRef = useRef<WorkLogDetailMode>("view");
  const [detailState, setDetailState] = useState<WorkLogDetailLoadState>(
    initialEntry
      ? { entry: initialEntry, status: "ready" }
      : { status: "loading" },
  );
  const [linkedScheduleState, setLinkedScheduleState] =
    useState<WorkLogLinkedScheduleLoadState>(
      initialLinkedScheduleState === null
        ? { status: "loading" }
        : initialLinkedScheduleState,
    );
  const [mode, setMode] = useState<WorkLogDetailMode>("view");
  const nextLoadRequestIdRef = useRef(1);
  const [loadRequest, setLoadRequest] =
    useState<WorkLogDetailLoadRequest | null>(() => {
      if (!initialEntry) {
        return { id: 0, mode: "all" };
      }

      if (initialLinkedScheduleState === null) {
        return { id: 0, mode: "schedules" };
      }

      return null;
    });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);

  useEffect(() => {
    if (!loadRequest) {
      return;
    }

    const controller = new AbortController();
    const shouldLoadEntry = loadRequest.mode === "all";
    const requestId = loadRequest.id;

    async function loadEntry() {
      const fallbackMessage = "업무일지를 불러오지 못했습니다.";

      if (shouldLoadEntry) {
        setDetailState({ status: "loading" });
      }

      setLinkedScheduleState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/work-logs/${encodeURIComponent(date)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          entry?: WorkLogEntry;
          error?: string;
          linkedScheduleState?: WorkLogLinkedScheduleLoadState;
        } | null;

        if (!response.ok || !payload?.entry) {
          if (shouldLoadEntry) {
            setDetailState({
              message: payload?.error ?? fallbackMessage,
              status: "error",
            });
          }

          setLinkedScheduleState({ status: "error" });

          return;
        }

        if (shouldLoadEntry) {
          setDetailState({ entry: payload.entry, status: "ready" });
        }

        const nextLinkedScheduleState = payload.linkedScheduleState;

        setLinkedScheduleState(
          nextLinkedScheduleState?.status === "ready" &&
            Array.isArray(nextLinkedScheduleState.schedules)
            ? nextLinkedScheduleState
            : { status: "error" },
        );
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        if (shouldLoadEntry) {
          setDetailState({
            message: fallbackMessage,
            status: "error",
          });
        }

        setLinkedScheduleState({ status: "error" });
      } finally {
        if (!controller.signal.aborted) {
          setLoadRequest((current) =>
            current?.id === requestId ? null : current,
          );
        }
      }
    }

    void loadEntry();

    return () => controller.abort();
  }, [date, loadRequest]);

  useEffect(() => {
    if (detailState.status === "error") {
      loadErrorRef.current?.focus();
    }
  }, [detailState]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;

    if (mode !== "view" || previousMode === "view") {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [mode]);

  const handleSaved = useCallback(
    (entry: WorkLogEntry, message: string) => {
      setDetailState({ entry, status: "ready" });
      setMode("view");
      setFeedback(message);
      setEditDirty(false);
      setMutationPending(false);
      onSaved(entry);
    },
    [onSaved],
  );

  const handleDeleted = useCallback(() => {
    setMutationPending(false);
    onDeleted();
  }, [onDeleted]);

  function requestDetailLoad(mode: WorkLogDetailLoadRequest["mode"]) {
    const requestId = nextLoadRequestIdRef.current;
    nextLoadRequestIdRef.current += 1;
    setLoadRequest({ id: requestId, mode });
  }

  function requestClose() {
    if (mutationPending) {
      return;
    }

    if (
      mode === "edit" &&
      editDirty &&
      !window.confirm(workLogModalUnsavedChangesMessage)
    ) {
      return;
    }

    onClose();
  }

  function beginEdit() {
    if (
      hasUnderlyingDraft &&
      !window.confirm(workLogUnderlyingDraftMessage)
    ) {
      return;
    }

    setFeedback(null);
    setEditDirty(false);
    setMode("edit");
  }

  function cancelEdit() {
    if (editDirty && !window.confirm(workLogModalUnsavedChangesMessage)) {
      return;
    }

    setEditDirty(false);
    setMode("view");
  }

  function returnFromDelete(reload: boolean) {
    setMode("view");

    if (reload) {
      setFeedback(null);
      requestDetailLoad("all");
    }
  }

  const entry = detailState.status === "ready" ? detailState.entry : null;
  const modeLabel =
    mode === "edit"
      ? "업무일지 수정"
      : mode === "delete"
        ? "업무일지 삭제"
        : "업무일지 상세";

  return (
    <AppModal
      className="flex max-w-2xl flex-col"
      describedBy={descriptionId}
      labelledBy={titleId}
      mobileFullscreen
      onClose={requestClose}
      returnFocusTo={returnFocusTo}
    >
      <header className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--brand)]">
            {modeLabel}
          </p>
          <h2
            className="mt-1 break-words text-lg font-semibold tabular-nums text-[var(--foreground)] outline-none sm:text-xl"
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
          >
            {formatWorkLogDateLabel(date)}
          </h2>
          <p className="sr-only" id={descriptionId}>
            업무일지 내용을 확인하고 수정하거나 삭제할 수 있습니다.
          </p>
        </div>
        <button
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-11 shrink-0 px-3 text-sm",
          )}
          data-modal-initial-focus
          disabled={mutationPending}
          onClick={requestClose}
          type="button"
        >
          닫기
        </button>
      </header>

      {detailState.status === "loading" ? (
        <div
          aria-live="polite"
          className="grid min-h-32 flex-1 place-items-center px-5 py-6 text-sm font-medium text-[var(--text-muted)]"
          role="status"
        >
          업무일지를 불러오는 중입니다.
        </div>
      ) : detailState.status === "error" ? (
        <div className="grid min-h-32 flex-1 content-center gap-3 px-4 py-5 sm:px-5">
          <div
            className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f] outline-none dark:border-[#f851498c] dark:bg-[#da363329] dark:text-[#ff7b72]"
            ref={loadErrorRef}
            role="alert"
            tabIndex={-1}
          >
            {detailState.message}
          </div>
          <div className="flex justify-end gap-2">
            <button
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-11 px-4 text-sm",
              )}
              onClick={requestClose}
              type="button"
            >
              닫기
            </button>
            <button
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.primary,
                "h-11 px-4 text-sm",
              )}
              onClick={() => {
                titleRef.current?.focus({ preventScroll: true });
                requestDetailLoad("all");
              }}
              type="button"
            >
              다시 불러오기
            </button>
          </div>
        </div>
      ) : mode === "edit" && entry ? (
        <WorkLogModalEditForm
          entry={entry}
          hasUnderlyingDraft={hasUnderlyingDraft}
          linkedScheduleState={linkedScheduleState}
          onCancel={cancelEdit}
          onDirtyChange={setEditDirty}
          onPendingChange={setMutationPending}
          onRetryLinkedSchedules={() => requestDetailLoad("schedules")}
          onSaved={handleSaved}
          saveAction={saveAction}
        />
      ) : mode === "delete" && entry ? (
        <WorkLogDeleteConfirmation
          deleteAction={deleteAction}
          entry={entry}
          hasUnderlyingDraft={hasUnderlyingDraft}
          onCancel={returnFromDelete}
          onDeleted={handleDeleted}
          onPendingChange={setMutationPending}
        />
      ) : entry ? (
        <WorkLogDetailView
          entry={entry}
          feedback={feedback}
          onClose={requestClose}
          onDelete={() => {
            setFeedback(null);
            setMode("delete");
          }}
          onEdit={beginEdit}
        />
      ) : null}
    </AppModal>
  );
}

export function WorkLogDetailView({
  entry,
  feedback,
  onClose,
  onDelete,
  onEdit,
}: {
  entry: WorkLogEntry;
  feedback: string | null;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {feedback ? (
          <p
            className="mb-3 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm font-semibold text-[#22633a] dark:border-[#2ea04366] dark:bg-[#23863626] dark:text-[#7ee787]"
            role="status"
          >
            {feedback}
          </p>
        ) : null}

        <article className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-muted)]">
            키워드
          </p>
          <h3 className="mt-1 break-words text-base font-semibold leading-6 text-[var(--foreground)] [overflow-wrap:anywhere]">
            {entry.keyword}
          </h3>

          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              업무 내용
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--foreground)] [overflow-wrap:anywhere]">
              {entry.content}
            </p>
          </div>

          <div className="mt-4 border-t border-[var(--border)] pt-2">
            <WorkLogAuditMetadata entry={entry} />
          </div>
        </article>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
        <button
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.dangerOutline,
            "h-11 px-4 text-sm",
          )}
          onClick={onDelete}
          type="button"
        >
          삭제
        </button>
        <div className="flex items-center justify-end gap-2">
          <button
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-11 px-4 text-sm",
            )}
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
          <button
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-11 px-4 text-sm",
            )}
            onClick={onEdit}
            type="button"
          >
            수정
          </button>
        </div>
      </footer>
    </>
  );
}

function WorkLogModalEditForm({
  entry,
  hasUnderlyingDraft,
  linkedScheduleState,
  onCancel,
  onDirtyChange,
  onPendingChange,
  onRetryLinkedSchedules,
  onSaved,
  saveAction,
}: {
  entry: WorkLogEntry;
  hasUnderlyingDraft: boolean;
  linkedScheduleState: WorkLogLinkedScheduleLoadState;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onRetryLinkedSchedules: () => void;
  onSaved: (entry: WorkLogEntry, message: string) => void;
  saveAction: SaveWorkLogAction;
}) {
  const keywordErrorId = useId();
  const contentErrorId = useId();
  const keywordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [keyword, setKeyword] = useState(entry.keyword);
  const [content, setContent] = useState(entry.content);
  const [state, formAction, pending] = useActionState(
    saveAction,
    initialWorkLogFormState,
  );
  const dirty =
    keyword.trim() !== entry.keyword || content.trim() !== entry.content;

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      keywordRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);

  useEffect(
    () => () => {
      onDirtyChange(false);
      onPendingChange(false);
    },
    [onDirtyChange, onPendingChange],
  );

  useEffect(() => {
    if (state.error) {
      errorRef.current?.focus();
    }
  }, [state.error]);

  useEffect(() => {
    if (state.success && state.entry) {
      onSaved(state.entry, state.success);
    }
  }, [onSaved, state.entry, state.success]);

  return (
    <form
      action={formAction}
      aria-busy={pending || undefined}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        if (pending || !dirty) {
          event.preventDefault();
          return;
        }

        onPendingChange(true);
      }}
    >
      <input name="workDate" type="hidden" value={entry.workDate} readOnly />
      <input
        name="expectedUpdatedAt"
        type="hidden"
        value={state.conflictUpdatedAt ?? entry.updatedAt}
        readOnly
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {hasUnderlyingDraft ? (
          <p className="mb-3 rounded-md border border-[#ead8a8] bg-[#fff8df] px-3 py-2 text-sm text-[#82620d] dark:border-[#d2992266] dark:bg-[#bb800926] dark:text-[#e3b341]">
            아래 작성 폼의 저장하지 않은 내용은 이 기록을 저장하면 사라집니다.
          </p>
        ) : null}

        <label className="block min-w-0">
          <span className="block text-xs font-semibold text-[var(--text-muted)]">
            키워드 <RequiredMark />
          </span>
          <input
            aria-describedby={
              state.fieldErrors?.keyword ? keywordErrorId : undefined
            }
            aria-invalid={Boolean(state.fieldErrors?.keyword) || undefined}
            className="mt-2 h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[#9aa4b2] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            disabled={pending}
            maxLength={workLogKeywordMaxLength}
            name="keyword"
            onChange={(event) => setKeyword(event.currentTarget.value)}
            ref={keywordRef}
            required
            value={keyword}
          />
          {state.fieldErrors?.keyword ? (
            <FieldError id={keywordErrorId}>
              {state.fieldErrors.keyword}
            </FieldError>
          ) : null}
        </label>

        <div className="mt-4">
          <WorkLogLinkedSchedulePanel
            disabled={pending}
            loadState={linkedScheduleState}
            onMerge={(schedules) => {
              const result = mergeWorkLogLinkedSchedulesIntoContent({
                content,
                schedules,
              });

              if (result.addedCount > 0) {
                setContent(result.content);
              }

              return result;
            }}
            onRetry={onRetryLinkedSchedules}
          />
        </div>

        <label className="mt-4 block min-w-0">
          <span className="block text-xs font-semibold text-[var(--text-muted)]">
            내용 <RequiredMark />
          </span>
          <textarea
            aria-describedby={
              state.fieldErrors?.content ? contentErrorId : undefined
            }
            aria-invalid={Boolean(state.fieldErrors?.content) || undefined}
            className="mt-2 min-h-56 w-full resize-y rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            disabled={pending}
            maxLength={workLogContentMaxLength}
            name="content"
            onChange={(event) => setContent(event.currentTarget.value)}
            required
            value={content}
          />
          {state.fieldErrors?.content ? (
            <FieldError id={contentErrorId}>
              {state.fieldErrors.content}
            </FieldError>
          ) : null}
        </label>

        {state.error ? (
          <div
            className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f] outline-none dark:border-[#f851498c] dark:bg-[#da363329] dark:text-[#ff7b72]"
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            {state.error}
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
        <button
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-11 px-4 text-sm",
          )}
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          취소
        </button>
        <button
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.save,
            "h-11 px-4 text-sm",
          )}
          disabled={pending || !dirty}
          type="submit"
        >
          {pending
            ? "저장 중"
            : state.conflictUpdatedAt
              ? "현재 내용으로 덮어쓰기"
              : "수정 내용 저장"}
        </button>
      </footer>
    </form>
  );
}

export function WorkLogLinkedSchedulePanel({
  disabled = false,
  loadState,
  onMerge,
  onRetry,
}: {
  disabled?: boolean;
  loadState: WorkLogLinkedScheduleLoadState;
  onMerge: (
    schedules: readonly WorkLogLinkedSchedule[],
  ) => WorkLogLinkedScheduleMergeResult;
  onRetry?: () => void;
}) {
  const titleId = useId();
  const actionRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previousLoadStatusRef = useRef(loadState.status);
  const restoreFocusAfterRetryRef = useRef(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    warning: boolean;
  } | null>(null);
  const schedules =
    loadState.status === "ready" ? loadState.schedules : [];

  useEffect(() => {
    const previousStatus = previousLoadStatusRef.current;
    previousLoadStatusRef.current = loadState.status;

    if (
      !restoreFocusAfterRetryRef.current ||
      previousStatus !== "loading" ||
      loadState.status === "loading"
    ) {
      return;
    }

    restoreFocusAfterRetryRef.current = false;
    const focusFrame = window.requestAnimationFrame(() => {
      (actionRef.current ?? panelRef.current)?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [loadState.status]);

  function mergeSchedules() {
    if (schedules.length === 0) {
      return;
    }

    const result = onMerge(schedules);

    setFeedback({
      message: formatWorkLogLinkedScheduleMergeFeedback(result),
      warning: result.skippedCount > 0,
    });
  }

  return (
    <section
      aria-busy={loadState.status === "loading" || undefined}
      aria-labelledby={titleId}
      className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      ref={panelRef}
      tabIndex={-1}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3
            className="text-xs font-semibold text-[var(--foreground)]"
            id={titleId}
          >
            개인 일정
          </h3>
          {loadState.status === "ready" ? (
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
              {formatWorkLogLinkedScheduleCount(schedules.length)}
            </span>
          ) : null}
        </div>

        {loadState.status === "ready" && schedules.length > 0 ? (
          <button
            aria-label={`개인 일정 ${formatWorkLogLinkedScheduleCount(
              schedules.length,
            )}을 업무 내용에 추가`}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-11 shrink-0 px-3 text-xs",
            )}
            disabled={disabled}
            onClick={mergeSchedules}
            ref={actionRef}
            type="button"
          >
            내용에 추가
          </button>
        ) : onRetry && loadState.status !== "ready" ? (
          <button
            aria-disabled={
              disabled || loadState.status === "loading" || undefined
            }
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-11 shrink-0 px-3 text-xs",
              loadState.status === "loading" ? "cursor-wait opacity-60" : "",
            )}
            disabled={disabled}
            onClick={() => {
              if (loadState.status === "loading") {
                return;
              }

              restoreFocusAfterRetryRef.current = true;
              setFeedback(null);
              onRetry();
            }}
            ref={actionRef}
            type="button"
          >
            {loadState.status === "loading"
              ? "불러오는 중"
              : "다시 불러오기"}
          </button>
        ) : null}
      </div>

      {loadState.status === "loading" ? (
        <p
          aria-live="polite"
          className="mt-2 text-sm text-[var(--text-muted)]"
          role="status"
        >
          개인 일정을 불러오는 중입니다.
        </p>
      ) : loadState.status === "error" ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]" role="alert">
          개인 일정을 불러오지 못했습니다. 업무일지는 계속 작성할 수
          있습니다.
        </p>
      ) : schedules.length === 0 ? (
        <p
          className="mt-2 text-sm text-[var(--text-muted)]"
          role="status"
        >
          선택한 날짜에 등록된 개인 일정이 없습니다.
        </p>
      ) : (
        <ul
          aria-label="업무 내용에 추가할 수 있는 개인 일정"
          className="mt-2 divide-y divide-[var(--border)] border-t border-[var(--border)]"
        >
          {schedules.map((schedule) => (
            <li
              className="grid min-w-0 gap-x-2 py-2 text-xs leading-5 sm:grid-cols-[6.75rem_minmax(0,1fr)]"
              key={schedule.id}
            >
              <span className="tabular-nums text-[var(--text-muted)]">
                {formatWorkLogLinkedScheduleTimeRange(
                  schedule.startMinute,
                  schedule.endMinute,
                )}
              </span>
              <span className="min-w-0 break-words text-[var(--foreground)] [overflow-wrap:anywhere]">
                <span className="font-semibold">
                  {normalizeWorkLogLinkedScheduleText(schedule.youthName)}
                </span>
                <span aria-hidden="true"> · </span>
                <span>
                  {normalizeWorkLogLinkedScheduleText(schedule.content)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {feedback ? (
        <p
          aria-live={feedback.warning ? "assertive" : "polite"}
          className={
            feedback.warning
              ? "mt-2 text-xs font-medium text-[#82620d] dark:text-[#e3b341]"
              : "mt-2 text-xs font-medium text-[var(--brand)]"
          }
          role={feedback.warning ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}

function WorkLogDeleteConfirmation({
  deleteAction,
  entry,
  hasUnderlyingDraft,
  onCancel,
  onDeleted,
  onPendingChange,
}: {
  deleteAction: DeleteWorkLogAction;
  entry: WorkLogEntry;
  hasUnderlyingDraft: boolean;
  onCancel: (reload: boolean) => void;
  onDeleted: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const warningId = useId();
  const [state, formAction, pending] = useActionState(
    deleteAction,
    initialWorkLogDeleteFormState,
  );

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      cancelRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);

  useEffect(
    () => () => {
      onPendingChange(false);
    },
    [onPendingChange],
  );

  useEffect(() => {
    if (state.error) {
      errorRef.current?.focus();
    }
  }, [state.error]);

  useEffect(() => {
    if (state.deletedId) {
      onDeleted();
    }
  }, [onDeleted, state.deletedId]);

  return (
    <form
      action={formAction}
      aria-busy={pending || undefined}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        if (pending || state.conflict) {
          event.preventDefault();
          return;
        }

        onPendingChange(true);
      }}
    >
      <input name="workLogId" type="hidden" value={entry.id} readOnly />
      <input
        name="expectedUpdatedAt"
        type="hidden"
        value={entry.updatedAt}
        readOnly
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <div
          className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-4 py-4 text-[#8a1f1f] dark:border-[#f851498c] dark:bg-[#da363329] dark:text-[#ff7b72]"
          id={warningId}
        >
          <p className="text-sm font-semibold">업무일지를 삭제할까요?</p>
          <p className="mt-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">
            {formatWorkLogDateLabel(entry.workDate)} · {entry.keyword}
          </p>
          <p className="mt-2 text-sm font-medium">
            삭제한 업무일지는 복구할 수 없습니다.
          </p>
          {hasUnderlyingDraft ? (
            <p className="mt-2 text-sm">
              아래 작성 폼의 저장하지 않은 내용도 함께 사라집니다.
            </p>
          ) : null}
        </div>

        {state.error ? (
          <div
            className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f] outline-none dark:border-[#f851498c] dark:bg-[#da363329] dark:text-[#ff7b72]"
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            {state.error}
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
        <button
          aria-describedby={warningId}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-11 px-4 text-sm",
          )}
          disabled={pending}
          onClick={() => onCancel(Boolean(state.conflict))}
          ref={cancelRef}
          type="button"
        >
          {state.conflict ? "최신 내용 확인" : "취소"}
        </button>
        <button
          aria-describedby={warningId}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.danger,
            "h-11 px-4 text-sm",
          )}
          disabled={pending || Boolean(state.conflict)}
          type="submit"
        >
          {pending ? "삭제 중" : "삭제하기"}
        </button>
      </footer>
    </form>
  );
}

function WorkLogEntryForm({
  existingLog,
  linkedScheduleState,
  saveAction,
  selectedDate,
  today,
  hasUnsavedChanges,
  onUnsavedChangesChange,
}: {
  existingLog: WorkLogEntry | null;
  linkedScheduleState: WorkLogLinkedScheduleLoadState;
  saveAction: SaveWorkLogAction;
  selectedDate: string;
  today: string;
  hasUnsavedChanges: boolean;
  onUnsavedChangesChange: (hasUnsavedChanges: boolean) => void;
}) {
  const router = useRouter();
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isDatePending, startDateTransition] = useTransition();
  const [isScheduleRefreshPending, startScheduleRefresh] = useTransition();
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

  useEffect(() => {
    if (state.success) {
      onUnsavedChangesChange(
        hasWorkLogDraftChanges(
          formRef.current ? new FormData(formRef.current) : null,
          savedKeyword,
          savedContent,
        ),
      );
    }
  }, [onUnsavedChangesChange, savedContent, savedKeyword, state]);

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDate = event.currentTarget.value;

    if (!isWorkLogDate(nextDate) || nextDate > today) {
      return;
    }

    const form = event.currentTarget.form;
    const currentValues = form ? new FormData(form) : null;
    const formHasUnsavedChanges = hasWorkLogDraftChanges(
      currentValues,
      savedKeyword,
      savedContent,
    );

    if (
      !canLeaveWorkLog(formHasUnsavedChanges, () =>
        window.confirm(workLogUnsavedChangesMessage),
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

  function handleDraftChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const form = event.currentTarget.form;
    const currentValues = form ? new FormData(form) : null;

    onUnsavedChangesChange(
      hasWorkLogDraftChanges(currentValues, savedKeyword, savedContent),
    );
  }

  function mergeLinkedSchedules(schedules: readonly WorkLogLinkedSchedule[]) {
    const result = mergeWorkLogLinkedSchedulesIntoContent({
      content: contentRef.current?.value ?? content,
      schedules,
    });

    if (result.addedCount > 0 && contentRef.current) {
      contentRef.current.value = result.content;
      onUnsavedChangesChange(
        hasWorkLogDraftChanges(
          formRef.current ? new FormData(formRef.current) : null,
          savedKeyword,
          savedContent,
        ),
      );
    }

    return result;
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
        {existingLog ? (
          <WorkLogAuditMetadata entry={existingLog} />
        ) : (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            같은 날짜로 저장하면 기존 업무일지가 수정됩니다.
          </p>
        )}
      </header>

      <form
        ref={formRef}
        action={formAction}
        aria-busy={pending || undefined}
        className="p-4 sm:p-5"
      >
        <input
          name="expectedUpdatedAt"
          type="hidden"
          value={state.conflictUpdatedAt ?? existingLog?.updatedAt ?? ""}
          readOnly
        />
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
              disabled={pending || isDatePending}
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
              disabled={pending || isDatePending}
              defaultValue={keyword}
              onChange={handleDraftChange}
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

        <div className="mt-4">
          <WorkLogLinkedSchedulePanel
            disabled={pending || isDatePending}
            loadState={
              isScheduleRefreshPending
                ? { status: "loading" }
                : linkedScheduleState
            }
            onMerge={mergeLinkedSchedules}
            onRetry={() => {
              startScheduleRefresh(() => {
                router.refresh();
              });
            }}
          />
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
            disabled={pending || isDatePending}
            defaultValue={content}
            onChange={handleDraftChange}
            placeholder="진행한 업무, 결과, 다음에 이어서 할 내용을 기록해 주세요."
            ref={contentRef}
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
            ) : hasUnsavedChanges ? (
              <p className="font-medium text-[var(--text-muted)]">
                저장하지 않은 변경사항이 있습니다.
              </p>
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
              : state.conflictUpdatedAt
                ? "현재 내용으로 덮어쓰기"
                : existingLog
                ? "수정 내용 저장"
                : "업무일지 등록"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function WorkLogAuditMetadata({ entry }: { entry: WorkLogEntry }) {
  const createdAt = formatKoreanDateTime(entry.createdAt) ?? entry.createdAt;
  const updatedAt = formatKoreanDateTime(entry.updatedAt) ?? entry.updatedAt;

  return (
    <dl
      aria-label="업무일지 작성 및 수정 정보"
      className="mt-2 grid min-w-0 gap-y-1 text-xs"
    >
      <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-2">
        <dt className="shrink-0 font-semibold text-[var(--text-muted)]">
          작성자
        </dt>
        <dd className="flex min-w-0 flex-wrap gap-x-1.5 text-[var(--foreground)]">
          <span className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">
            {entry.authorName}
          </span>
          <span className="whitespace-nowrap tabular-nums text-[var(--text-muted)]">
            <span aria-hidden="true">· </span>
            <time
              aria-label={`작성일시 ${createdAt}`}
              dateTime={entry.createdAt}
            >
              {createdAt}
            </time>
          </span>
        </dd>
      </div>
      <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-2">
        <dt className="shrink-0 font-semibold text-[var(--text-muted)]">
          최종 수정자
        </dt>
        <dd className="flex min-w-0 flex-wrap gap-x-1.5 text-[var(--foreground)]">
          {entry.updatedByName ? (
            <>
              <span className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">
                {entry.updatedByName}
              </span>
              <span className="whitespace-nowrap tabular-nums text-[var(--text-muted)]">
                <span aria-hidden="true">· </span>
                <time
                  aria-label={`최종 수정일시 ${updatedAt}`}
                  dateTime={entry.updatedAt}
                >
                  {updatedAt}
                </time>
              </span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">수정 이력 없음</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

export function WorkLogRecentList({
  entries,
  hasUnsavedChanges,
  selectedDate,
}: {
  entries: WorkLogEntry[];
  hasUnsavedChanges: boolean;
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
                  onNavigate={(event) => {
                    if (
                      !selected &&
                      !canLeaveWorkLog(hasUnsavedChanges, () =>
                        window.confirm(workLogUnsavedChangesMessage),
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
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

export function canLeaveWorkLog(
  hasUnsavedChanges: boolean,
  confirmDiscard: () => boolean,
) {
  return !hasUnsavedChanges || confirmDiscard();
}

export function hasWorkLogDraftChanges(
  formData: FormData | null,
  savedKeyword: string,
  savedContent: string,
) {
  return (
    String(formData?.get("keyword") ?? "").trim() !== savedKeyword ||
    String(formData?.get("content") ?? "").trim() !== savedContent
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
