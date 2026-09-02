"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";
import {
  isYouthPersonalScheduleDate,
  youthPersonalScheduleContentMaxLength as personalScheduleContentMaxLength,
  youthPersonalScheduleDayEndMinute,
  youthPersonalScheduleMinuteStep as personalScheduleMinuteStep,
  type YouthPersonalScheduleInput,
} from "@/lib/youth-personal-schedule-core";
import type { YouthPersonalSchedule } from "@/lib/youth-personal-schedules";
import {
  createWorkScheduleCalendarDays,
  formatWorkScheduleDateLabel,
  formatWorkScheduleMonthLabel,
  getWorkScheduleCurrentMonth,
  getWorkScheduleMonthFromDate,
  shiftWorkScheduleMonth,
  workScheduleCalendarWeekdays,
} from "@/lib/work-schedule-calendar";
import {
  getYouthLearningScheduleWeekday,
  type YouthActionResult,
} from "@/lib/youth-management-core";

type YouthDirectoryItem = {
  id: string;
  name: string;
};

type CreatePersonalSchedule = (
  youthId: string,
  input: YouthPersonalScheduleInput,
) => Promise<YouthActionResult<{ schedule: YouthPersonalSchedule }>>;

type UpdatePersonalSchedule = (
  scheduleId: string,
  input: YouthPersonalScheduleInput,
) => Promise<YouthActionResult<{ schedule: YouthPersonalSchedule }>>;

type DeletePersonalSchedule = (
  scheduleId: string,
) => Promise<YouthActionResult<{ scheduleId: string }>>;

export type YouthPersonalScheduleCalendarBoardProps = {
  canManage: boolean;
  createSchedule: CreatePersonalSchedule;
  deleteSchedule: DeletePersonalSchedule;
  schedules: YouthPersonalSchedule[];
  selectedMonth: string;
  selectedYouthId: string;
  updateSchedule: UpdatePersonalSchedule;
  youths: YouthDirectoryItem[];
};

type PersonalScheduleDraft = YouthPersonalScheduleInput & {
  scheduleId?: string;
};

type PendingAction = "delete" | "save" | null;

const personalScheduleBasePath = "/youth/personal-schedule";
const defaultStartMinute = 9 * 60;
const defaultEndMinute = 10 * 60;

const fieldClassName =
  "h-11 min-w-0 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClassName =
  "inline-flex h-11 min-w-0 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60";

type YouthPersonalScheduleStudentSelectProps = Pick<
  YouthPersonalScheduleCalendarBoardProps,
  "selectedMonth" | "selectedYouthId" | "youths"
>;

export function YouthPersonalScheduleStudentSelect({
  selectedMonth,
  selectedYouthId,
  youths,
}: YouthPersonalScheduleStudentSelectProps) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">학생</span>
      <select
        aria-label="개인 일정표 학생 선택"
        className="h-11 w-36 max-w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-lg font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-40"
        disabled={youths.length === 0}
        value={selectedYouthId}
        onChange={(event) => {
          window.location.assign(
            createPersonalScheduleHref(event.currentTarget.value, selectedMonth),
          );
        }}
      >
        {youths.length === 0 ? (
          <option value="">재원 중인 학생 없음</option>
        ) : null}
        {youths.map((youth) => (
          <option key={youth.id} value={youth.id}>
            {youth.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function YouthPersonalScheduleCalendarBoard(
  props: YouthPersonalScheduleCalendarBoardProps,
) {
  return (
    <YouthPersonalScheduleCalendarBoardContent
      key={createPersonalScheduleBoardRevision(props)}
      {...props}
    />
  );
}

function YouthPersonalScheduleCalendarBoardContent({
  canManage,
  createSchedule,
  deleteSchedule,
  schedules,
  selectedMonth,
  selectedYouthId,
  updateSchedule,
  youths,
}: YouthPersonalScheduleCalendarBoardProps) {
  const [scheduleItems, setScheduleItems] = useState(schedules);
  const [draft, setDraft] = useState<PersonalScheduleDraft | null>(null);
  const [formError, setFormError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selectedYouth = youths.find((youth) => youth.id === selectedYouthId);
  const days = useMemo(
    () => createWorkScheduleCalendarDays(selectedMonth),
    [selectedMonth],
  );
  const schedulesByDate = useMemo(
    () => createSchedulesByDate(scheduleItems, days.map((day) => day.date)),
    [days, scheduleItems],
  );
  const previousMonth = shiftWorkScheduleMonth(selectedMonth, -1);
  const nextMonth = shiftWorkScheduleMonth(selectedMonth, 1);
  const currentMonth = getWorkScheduleCurrentMonth();
  const isPending = pendingAction !== null;

  useEffect(() => {
    if (formError) {
      errorRef.current?.focus({ preventScroll: true });
    }
  }, [formError]);

  function openCreateModal(scheduleDate: string) {
    if (!canManage || isPending || !selectedYouth) {
      return;
    }

    setDraft(createPersonalScheduleDraft(scheduleDate));
    setFormError("");
  }

  function openEditModal(
    event: MouseEvent<HTMLButtonElement>,
    schedule: YouthPersonalSchedule,
    fallbackDate: string,
  ) {
    event.stopPropagation();

    if (!canManage || isPending) {
      return;
    }

    setDraft(createPersonalScheduleEditDraft(schedule, fallbackDate));
    setFormError("");
  }

  function closeModal() {
    if (isPending) {
      return;
    }

    setDraft(null);
    setFormError("");
  }

  function updateDraft(patch: Partial<PersonalScheduleDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setFormError("");
  }

  function changeSelectionMode(selectionMode: "DATES" | "WEEKDAYS") {
    setDraft((current) => {
      if (!current || current.selectionMode === selectionMode) {
        return current;
      }

      const seedDate =
        current.occurrenceDates.find(isYouthPersonalScheduleDate) ??
        (isYouthPersonalScheduleDate(current.recurrenceStartDate)
          ? current.recurrenceStartDate
          : `${selectedMonth}-01`);

      return selectionMode === "DATES"
        ? {
            ...current,
            occurrenceDates: [seedDate],
            recurrenceEndDate: "",
            recurrenceStartDate: "",
            recurrenceWeekdays: [],
            selectionMode,
          }
        : {
            ...current,
            occurrenceDates: [],
            recurrenceEndDate: seedDate,
            recurrenceStartDate: seedDate,
            recurrenceWeekdays: [getYouthLearningScheduleWeekday(seedDate)],
            selectionMode,
          };
    });
    setFormError("");
  }

  function updateOccurrenceDate(index: number, value: string) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        occurrenceDates: current.occurrenceDates.map((date, dateIndex) =>
          dateIndex === index ? value : date,
        ),
      };
    });
    setFormError("");
  }

  function addOccurrenceDate() {
    setDraft((current) =>
      current
        ? { ...current, occurrenceDates: [...current.occurrenceDates, ""] }
        : current,
    );
    setFormError("");
  }

  function removeOccurrenceDate(index: number) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const occurrenceDates = current.occurrenceDates.filter(
        (_, dateIndex) => dateIndex !== index,
      );

      return {
        ...current,
        occurrenceDates: occurrenceDates.length > 0 ? occurrenceDates : [""],
      };
    });
    setFormError("");
  }

  function toggleRecurrenceWeekday(weekday: number) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        recurrenceWeekdays: current.recurrenceWeekdays.includes(weekday)
          ? current.recurrenceWeekdays.filter((value) => value !== weekday)
          : [...current.recurrenceWeekdays, weekday].sort(
              (first, second) => first - second,
            ),
      };
    });
    setFormError("");
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || isPending || !canManage || !selectedYouthId) {
      return;
    }

    const error = getPersonalScheduleDraftError(draft);

    if (error) {
      setFormError(error);
      return;
    }

    setPendingAction("save");
    setFormError("");

    try {
      const input = normalizePersonalScheduleDraft(draft);
      const result = draft.scheduleId
        ? await updateSchedule(draft.scheduleId, input)
        : await createSchedule(selectedYouthId, input);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergePersonalSchedule(current, result.data.schedule),
      );
      setDraft(null);
    } catch {
      setFormError("일정을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  async function removeSchedule() {
    if (!draft?.scheduleId || isPending || !canManage) {
      return;
    }

    const schedule = scheduleItems.find((item) => item.id === draft.scheduleId);
    const confirmed = window.confirm(
      `"${schedule?.content ?? draft.content}" 일정 전체 묶음을 삭제하시겠습니까? 삭제한 일정은 복구할 수 없습니다.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingAction("delete");
    setFormError("");

    try {
      const result = await deleteSchedule(draft.scheduleId);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        current.filter((item) => item.id !== result.data.scheduleId),
      );
      setDraft(null);
    } catch {
      setFormError("일정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  function navigateToMonth(date: string) {
    if (!isYouthPersonalScheduleDate(date)) {
      return;
    }

    window.location.assign(
      createPersonalScheduleHref(selectedYouthId, getWorkScheduleMonthFromDate(date)),
    );
  }

  return (
    <section
      aria-label={`${selectedYouth?.name ?? "청소년"} 개인 일정표`}
      className="min-w-0 max-w-full space-y-4"
    >
      <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="grid min-w-0 gap-3 border-b border-[var(--border)] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)] sm:items-center sm:px-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                {formatWorkScheduleMonthLabel(selectedMonth)}
              </h2>
              {!canManage ? (
                <span className="inline-flex h-7 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-muted)] px-2 text-xs font-semibold text-[var(--text-muted)]">
                  조회 전용
                </span>
              ) : null}
            </div>
          </div>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
              월 이동
            </span>
            <DatePickerInput
              aria-label="개인 일정표 월 이동"
              className={`${fieldClassName} tabular-nums`}
              value={`${selectedMonth}-01`}
              onChange={(event) => navigateToMonth(event.currentTarget.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-[var(--border)] px-3 py-2 sm:flex sm:justify-end sm:px-4">
          <Link
            href={createPersonalScheduleHref(selectedYouthId, previousMonth)}
            className={secondaryButtonClassName}
          >
            이전 달
          </Link>
          <Link
            href={createPersonalScheduleHref(selectedYouthId, currentMonth)}
            className={secondaryButtonClassName}
          >
            이번 달
          </Link>
          <Link
            href={createPersonalScheduleHref(selectedYouthId, nextMonth)}
            className={secondaryButtonClassName}
          >
            다음 달
          </Link>
        </div>

        {selectedYouth ? (
          <div className="min-w-0 max-w-full overflow-hidden">
            <div className="grid w-full min-w-0 grid-cols-7 text-center text-xs font-semibold text-[var(--text-muted)]">
              {workScheduleCalendarWeekdays.map((weekday) => (
                <div
                  key={weekday.value}
                  className="min-w-0 border-b border-r border-[var(--border)] bg-[var(--surface-muted)] px-0.5 py-2 last:border-r-0 sm:px-2"
                >
                  {weekday.label}
                </div>
              ))}
            </div>

            <div className="grid w-full min-w-0 grid-cols-7">
              {days.map((day) => {
                const daySchedules = schedulesByDate.get(day.date) ?? [];

                return (
                  <div
                    key={day.date}
                    onClick={canManage ? () => openCreateModal(day.date) : undefined}
                    className={[
                      "min-w-0 overflow-hidden border-b border-r border-[var(--border)] p-0.5 align-top sm:min-h-32 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                      canManage
                        ? "cursor-pointer hover:bg-[var(--surface-hover)]"
                        : "cursor-default",
                      day.isCurrentMonth
                        ? "bg-[var(--surface)]"
                        : "bg-[var(--surface-muted)] opacity-75",
                    ].join(" ")}
                  >
                    {canManage ? (
                      <button
                        type="button"
                        aria-label={`${formatWorkScheduleDateLabel(day.date)} 개인 일정 등록`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openCreateModal(day.date);
                        }}
                        className={[
                          "flex size-11 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]",
                          day.isToday
                            ? "bg-[var(--brand)] text-white"
                            : "text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
                        ].join(" ")}
                      >
                        {day.day}
                      </button>
                    ) : (
                      <span
                        className={[
                          "flex size-11 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                          day.isToday
                            ? "bg-[var(--brand)] text-white"
                            : "text-[var(--foreground)]",
                        ].join(" ")}
                      >
                        {day.day}
                      </span>
                    )}

                    <div className="min-w-0 space-y-1 pb-0.5">
                      {daySchedules.map((schedule) => {
                        const scheduleLabel = `${formatPersonalScheduleTimeRange(
                          schedule.startMinute,
                          schedule.endMinute,
                        )} ${schedule.content}`;

                        return canManage ? (
                          <button
                            key={schedule.id}
                            type="button"
                            aria-label={`${scheduleLabel} 전체 일정 묶음 수정`}
                            title={scheduleLabel}
                            onClick={(event) =>
                              openEditModal(event, schedule, day.date)
                            }
                            className="block min-h-11 w-full min-w-0 overflow-hidden rounded border border-[#9fc9c5] bg-[#f4fbfa] px-1 py-1 text-left text-[10px] text-[#1f5552] transition hover:border-[#196b69] hover:bg-[#eaf6f4] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] dark:border-[#2f6f6b] dark:bg-[#123331] dark:text-[#b7e4df]"
                          >
                            <span className="block truncate font-semibold tabular-nums">
                              {formatPersonalScheduleTimeRange(
                                schedule.startMinute,
                                schedule.endMinute,
                              )}
                            </span>
                            <span className="mt-0.5 block truncate">
                              {schedule.content}
                            </span>
                          </button>
                        ) : (
                          <div
                            key={schedule.id}
                            aria-label={scheduleLabel}
                            title={scheduleLabel}
                            className="min-h-11 min-w-0 overflow-hidden rounded border border-[#9fc9c5] bg-[#f4fbfa] px-1 py-1 text-left text-[10px] text-[#1f5552] dark:border-[#2f6f6b] dark:bg-[#123331] dark:text-[#b7e4df]"
                          >
                            <span className="block truncate font-semibold tabular-nums">
                              {formatPersonalScheduleTimeRange(
                                schedule.startMinute,
                                schedule.endMinute,
                              )}
                            </span>
                            <span className="mt-0.5 block truncate">
                              {schedule.content}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              재원 중인 학생이 없습니다.
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              청소년 명단에서 재원 중인 학생을 확인해 주세요.
            </p>
          </div>
        )}
      </div>

      {draft && selectedYouth ? (
        <AppModal
          className="max-w-2xl"
          labelledBy="youth-personal-schedule-modal-title"
          describedBy="youth-personal-schedule-modal-description"
          mobileFullscreen
          onClose={closeModal}
        >
          <form
            className="flex h-dvh max-h-dvh min-w-0 flex-col sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onSubmit={submitSchedule}
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                {draft.scheduleId ? "개인 일정 전체 묶음 수정" : "개인 일정 등록"}
              </p>
              <h2
                id="youth-personal-schedule-modal-title"
                className="mt-1 break-words text-xl font-semibold text-[var(--foreground)] sm:text-2xl"
              >
                {selectedYouth.name} 개인 일정
              </h2>
              <p
                id="youth-personal-schedule-modal-description"
                className="mt-1 text-sm text-[var(--text-muted)]"
              >
                {draft.scheduleId
                  ? "수정 내용은 이 일정에 포함된 날짜 전체에 반영됩니다."
                  : "날짜를 여러 개 선택하거나 기간·요일 반복으로 일정을 등록할 수 있습니다."}
              </p>

              {formError ? (
                <p
                  ref={errorRef}
                  role="alert"
                  tabIndex={-1}
                  className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm font-semibold text-[#8a1f1f] outline-none focus:ring-2 focus:ring-[#f0c6c6] dark:border-[#7f3b3b] dark:bg-[#3b1f1f] dark:text-[#ffb4b4]"
                >
                  {formError}
                </p>
              ) : null}

              <label className="mt-5 block min-w-0">
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-[var(--foreground)]">
                  <span>일정 내용</span>
                  <span className="text-xs font-medium tabular-nums text-[var(--text-muted)]">
                    {draft.content.length}/{personalScheduleContentMaxLength}
                  </span>
                </span>
                <textarea
                  data-modal-initial-focus
                  aria-label="개인 일정 내용"
                  className="mt-2 min-h-24 w-full min-w-0 resize-y rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending}
                  maxLength={personalScheduleContentMaxLength}
                  onChange={(event) => updateDraft({ content: event.currentTarget.value })}
                  placeholder="예: 영어 학원, 병원 진료, 상담"
                  rows={3}
                  value={draft.content}
                />
              </label>

              <fieldset className="mt-5 min-w-0">
                <legend className="text-sm font-semibold text-[var(--foreground)]">
                  날짜 선택 방식
                </legend>
                <div className="mt-2 grid min-w-0 grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={draft.selectionMode === "DATES"}
                    disabled={isPending}
                    onClick={() => changeSelectionMode("DATES")}
                    className={createModeButtonClassName(
                      draft.selectionMode === "DATES",
                    )}
                  >
                    날짜 직접 선택
                  </button>
                  <button
                    type="button"
                    aria-pressed={draft.selectionMode === "WEEKDAYS"}
                    disabled={isPending}
                    onClick={() => changeSelectionMode("WEEKDAYS")}
                    className={createModeButtonClassName(
                      draft.selectionMode === "WEEKDAYS",
                    )}
                  >
                    기간·요일 반복
                  </button>
                </div>
              </fieldset>

              {draft.selectionMode === "DATES" ? (
                <fieldset className="mt-5 min-w-0">
                  <legend className="text-sm font-semibold text-[var(--foreground)]">
                    적용 날짜
                  </legend>
                  <div className="mt-2 min-w-0 space-y-2">
                    {draft.occurrenceDates.map((date, index) => (
                      <div
                        key={`${index}:${date}`}
                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] gap-2"
                      >
                        <DatePickerInput
                          aria-label={`적용 날짜 ${index + 1}`}
                          className={`${fieldClassName} tabular-nums`}
                          disabled={isPending}
                          value={date}
                          onChange={(event) =>
                            updateOccurrenceDate(index, event.currentTarget.value)
                          }
                        />
                        <button
                          type="button"
                          aria-label={`적용 날짜 ${index + 1} 삭제`}
                          className="inline-flex size-11 items-center justify-center rounded-md border border-[#efb4b4] bg-[var(--surface)] text-sm font-semibold text-[#a13a3a] transition hover:bg-[#fff1f1] focus:outline-none focus:ring-2 focus:ring-[#f0c6c6] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#7f3b3b] dark:text-[#ffb4b4]"
                          disabled={isPending}
                          onClick={() => removeOccurrenceDate(index)}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`${secondaryButtonClassName} mt-2 w-full sm:w-auto`}
                    disabled={isPending}
                    onClick={addOccurrenceDate}
                  >
                    날짜 추가
                  </button>
                </fieldset>
              ) : (
                <fieldset className="mt-5 min-w-0">
                  <legend className="text-sm font-semibold text-[var(--foreground)]">
                    반복 기간과 요일
                  </legend>
                  <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
                    <label className="block min-w-0">
                      <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
                        시작일
                      </span>
                      <DatePickerInput
                        aria-label="반복 시작일"
                        className={`${fieldClassName} tabular-nums`}
                        disabled={isPending}
                        value={draft.recurrenceStartDate}
                        onChange={(event) =>
                          updateDraft({
                            recurrenceStartDate: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
                        종료일
                      </span>
                      <DatePickerInput
                        aria-label="반복 종료일"
                        className={`${fieldClassName} tabular-nums`}
                        disabled={isPending}
                        value={draft.recurrenceEndDate}
                        onChange={(event) =>
                          updateDraft({ recurrenceEndDate: event.currentTarget.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-3 grid min-w-0 grid-cols-4 gap-2 sm:grid-cols-7">
                    {workScheduleCalendarWeekdays.map((weekday) => {
                      const selected = draft.recurrenceWeekdays.includes(
                        weekday.value,
                      );

                      return (
                        <button
                          key={weekday.value}
                          type="button"
                          aria-label={`${weekday.label}요일 반복`}
                          aria-pressed={selected}
                          className={createWeekdayButtonClassName(selected)}
                          disabled={isPending}
                          onClick={() => toggleRecurrenceWeekday(weekday.value)}
                        >
                          {weekday.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <fieldset className="mt-5 min-w-0">
                <legend className="text-sm font-semibold text-[var(--foreground)]">
                  시간
                </legend>
                <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                  <select
                    aria-label="시작 시간"
                    className={`${fieldClassName} cursor-pointer tabular-nums`}
                    disabled={isPending}
                    value={draft.startMinute}
                    onChange={(event) => {
                      const startMinute = Number(event.currentTarget.value);
                      const duration = Math.max(
                        personalScheduleMinuteStep,
                        draft.endMinute - draft.startMinute,
                      );

                      updateDraft({
                        startMinute,
                        endMinute: Math.min(
                          youthPersonalScheduleDayEndMinute,
                          startMinute + duration,
                        ),
                      });
                    }}
                  >
                    {createPersonalScheduleStartMinuteOptions().map((minute) => (
                      <option key={minute} value={minute}>
                        {formatPersonalScheduleTime(minute)}
                      </option>
                    ))}
                  </select>
                  <span
                    aria-hidden="true"
                    className="hidden text-[var(--text-muted)] sm:block"
                  >
                    -
                  </span>
                  <select
                    aria-label="종료 시간"
                    className={`${fieldClassName} cursor-pointer tabular-nums`}
                    disabled={isPending}
                    value={draft.endMinute}
                    onChange={(event) =>
                      updateDraft({ endMinute: Number(event.currentTarget.value) })
                    }
                  >
                    {createPersonalScheduleEndMinuteOptions(
                      draft.startMinute,
                    ).map((minute) => (
                      <option key={minute} value={minute}>
                        {formatPersonalScheduleTime(minute)}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            </div>

            <footer className="grid min-w-0 gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:grid-cols-[auto_1fr] sm:px-5">
              <div>
                {draft.scheduleId ? (
                  <button
                    type="button"
                    className="h-11 w-full rounded-md border border-[#efb4b4] bg-[var(--surface)] px-4 text-sm font-semibold text-[#a13a3a] transition hover:bg-[#fff1f1] focus:outline-none focus:ring-2 focus:ring-[#f0c6c6] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#7f3b3b] dark:text-[#ffb4b4] sm:w-auto"
                    disabled={isPending}
                    onClick={removeSchedule}
                  >
                    {pendingAction === "delete" ? "삭제 중" : "전체 일정 삭제"}
                  </button>
                ) : null}
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:justify-end">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={isPending}
                  onClick={closeModal}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="h-11 min-w-0 rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--border-strong)] disabled:text-[var(--text-muted)]"
                  disabled={isPending}
                >
                  {pendingAction === "save" ? "저장 중" : "저장"}
                </button>
              </div>
            </footer>
          </form>
        </AppModal>
      ) : null}
    </section>
  );
}

export function YouthPersonalScheduleCalendarSkeleton() {
  return (
    <section
      aria-label="개인 일정표 로딩"
      className="min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    >
      <div className="grid min-w-0 gap-3 border-b border-[var(--border)] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)] sm:items-center sm:px-4">
        <span className="block h-6 w-28 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
        <span className="block h-11 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-[var(--border)] px-3 py-2 sm:flex sm:justify-end sm:px-4">
        {Array.from({ length: 3 }, (_, index) => (
          <span
            key={index}
            className="block h-11 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none sm:w-20"
          />
        ))}
      </div>
      <div className="grid w-full min-w-0 grid-cols-7">
        {workScheduleCalendarWeekdays.map((weekday) => (
          <span
            key={weekday.value}
            className="block min-w-0 border-b border-r border-[var(--border)] bg-[var(--surface-muted)] px-1 py-2 text-center text-xs font-semibold text-[var(--text-muted)] last:border-r-0"
          >
            {weekday.label}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, index) => (
          <span
            key={index}
            className="block min-h-20 min-w-0 border-b border-r border-[var(--border)] p-1 sm:min-h-32 [&:nth-child(7n)]:border-r-0"
          >
            <span className="block size-8 animate-pulse rounded-full bg-[var(--surface-muted)] motion-reduce:animate-none" />
            {index % 5 === 0 ? (
              <span className="mt-1 block h-11 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}

export function createPersonalScheduleStartMinuteOptions() {
  return Array.from(
    { length: youthPersonalScheduleDayEndMinute / personalScheduleMinuteStep },
    (_, index) => index * personalScheduleMinuteStep,
  );
}

export function createPersonalScheduleEndMinuteOptions(startMinute: number) {
  const normalizedStartMinute = Math.max(
    0,
    Math.min(
      youthPersonalScheduleDayEndMinute - personalScheduleMinuteStep,
      Math.floor(startMinute / personalScheduleMinuteStep) *
        personalScheduleMinuteStep,
    ),
  );

  return Array.from(
    {
      length:
        (youthPersonalScheduleDayEndMinute - normalizedStartMinute) /
        personalScheduleMinuteStep,
    },
    (_, index) =>
      normalizedStartMinute + (index + 1) * personalScheduleMinuteStep,
  );
}

export function formatPersonalScheduleTime(minute: number) {
  if (minute === youthPersonalScheduleDayEndMinute) {
    return "24:00";
  }

  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;

  return `${String(hour).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}`;
}

export function formatPersonalScheduleTimeRange(
  startMinute: number,
  endMinute: number,
) {
  return `${formatPersonalScheduleTime(startMinute)}-${formatPersonalScheduleTime(endMinute)}`;
}

export function occursOnPersonalScheduleDate(
  schedule: YouthPersonalSchedule,
  scheduleDate: string,
) {
  return schedule.occurrenceDates.includes(scheduleDate);
}

function createSchedulesByDate(
  schedules: YouthPersonalSchedule[],
  dates: string[],
) {
  const result = new Map<string, YouthPersonalSchedule[]>();

  for (const date of dates) {
    const matchingSchedules = schedules
      .filter((schedule) => occursOnPersonalScheduleDate(schedule, date))
      .sort(
        (first, second) =>
          first.startMinute - second.startMinute ||
          first.endMinute - second.endMinute ||
          first.content.localeCompare(second.content, "ko-KR"),
      );

    if (matchingSchedules.length > 0) {
      result.set(date, matchingSchedules);
    }
  }

  return result;
}

function createPersonalScheduleDraft(scheduleDate: string): PersonalScheduleDraft {
  return {
    content: "",
    endMinute: defaultEndMinute,
    occurrenceDates: [scheduleDate],
    recurrenceEndDate: "",
    recurrenceStartDate: "",
    recurrenceWeekdays: [],
    selectionMode: "DATES",
    startMinute: defaultStartMinute,
  };
}

function createPersonalScheduleEditDraft(
  schedule: YouthPersonalSchedule,
  fallbackDate: string,
): PersonalScheduleDraft {
  return {
    content: schedule.content,
    endMinute: schedule.endMinute,
    occurrenceDates:
      schedule.selectionMode === "DATES"
        ? schedule.occurrenceDates.length > 0
          ? [...schedule.occurrenceDates]
          : [fallbackDate]
        : [],
    recurrenceEndDate: schedule.recurrenceEndDate ?? fallbackDate,
    recurrenceStartDate: schedule.recurrenceStartDate ?? fallbackDate,
    recurrenceWeekdays: [...schedule.recurrenceWeekdays],
    scheduleId: schedule.id,
    selectionMode: schedule.selectionMode,
    startMinute: schedule.startMinute,
  };
}

function normalizePersonalScheduleDraft(
  draft: PersonalScheduleDraft,
): YouthPersonalScheduleInput {
  const selectionMode = draft.selectionMode;

  return {
    content: draft.content.trim(),
    endMinute: draft.endMinute,
    occurrenceDates:
      selectionMode === "DATES"
        ? [...new Set(draft.occurrenceDates)].sort()
        : [],
    recurrenceEndDate:
      selectionMode === "WEEKDAYS" ? draft.recurrenceEndDate : "",
    recurrenceStartDate:
      selectionMode === "WEEKDAYS" ? draft.recurrenceStartDate : "",
    recurrenceWeekdays:
      selectionMode === "WEEKDAYS"
        ? [...new Set(draft.recurrenceWeekdays)].sort(
            (first, second) => first - second,
          )
        : [],
    selectionMode,
    startMinute: draft.startMinute,
  };
}

export function getPersonalScheduleDraftError(
  draft: YouthPersonalScheduleInput,
) {
  const content = draft.content.trim();

  if (!content) {
    return "일정 내용을 입력하세요.";
  }

  if (content.length > personalScheduleContentMaxLength) {
    return `일정 내용은 ${personalScheduleContentMaxLength}자 이하로 입력하세요.`;
  }

  if (
    !Number.isInteger(draft.startMinute) ||
    draft.startMinute < 0 ||
    draft.startMinute >= youthPersonalScheduleDayEndMinute ||
    draft.startMinute % personalScheduleMinuteStep !== 0 ||
    !Number.isInteger(draft.endMinute) ||
    draft.endMinute <= draft.startMinute ||
    draft.endMinute > youthPersonalScheduleDayEndMinute ||
    draft.endMinute % personalScheduleMinuteStep !== 0
  ) {
    return "종료 시간은 시작 시간보다 늦게 선택하세요.";
  }

  if (draft.selectionMode === "DATES") {
    if (draft.occurrenceDates.length === 0) {
      return "적용 날짜를 하나 이상 선택하세요.";
    }

    if (draft.occurrenceDates.some((date) => !isYouthPersonalScheduleDate(date))) {
      return "적용 날짜를 모두 입력하세요.";
    }

    if (new Set(draft.occurrenceDates).size !== draft.occurrenceDates.length) {
      return "같은 날짜를 중복해서 선택할 수 없습니다.";
    }

    return null;
  }

  if (
    !isYouthPersonalScheduleDate(draft.recurrenceStartDate) ||
    !isYouthPersonalScheduleDate(draft.recurrenceEndDate)
  ) {
    return "반복 시작일과 종료일을 모두 입력하세요.";
  }

  if (draft.recurrenceEndDate < draft.recurrenceStartDate) {
    return "반복 종료일은 시작일과 같거나 늦게 선택하세요.";
  }

  if (draft.recurrenceWeekdays.length === 0) {
    return "반복할 요일을 하나 이상 선택하세요.";
  }

  if (
    draft.recurrenceWeekdays.some(
      (weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6,
    )
  ) {
    return "반복 요일을 다시 선택하세요.";
  }

  return null;
}

function mergePersonalSchedule(
  schedules: YouthPersonalSchedule[],
  schedule: YouthPersonalSchedule,
) {
  const existingIndex = schedules.findIndex((item) => item.id === schedule.id);

  if (existingIndex === -1) {
    return [...schedules, schedule];
  }

  return schedules.map((item) => (item.id === schedule.id ? schedule : item));
}

function createPersonalScheduleHref(youthId: string, month: string) {
  const params = new URLSearchParams();

  if (youthId) {
    params.set("youthId", youthId);
  }

  params.set("month", month);

  return `${personalScheduleBasePath}?${params.toString()}`;
}

function createPersonalScheduleBoardRevision({
  schedules,
  selectedMonth,
  selectedYouthId,
}: YouthPersonalScheduleCalendarBoardProps) {
  const scheduleRevision = schedules
    .map((schedule) =>
      [
        schedule.id,
        schedule.youthId,
        schedule.content,
        schedule.startMinute,
        schedule.endMinute,
        schedule.selectionMode,
        schedule.occurrenceDates.join(","),
        schedule.recurrenceWeekdays.join(","),
        schedule.recurrenceStartDate ?? "",
        schedule.recurrenceEndDate ?? "",
      ].join("\u001f"),
    )
    .join("\u001e");

  return `${selectedYouthId}\u001d${selectedMonth}\u001d${scheduleRevision}`;
}

function createModeButtonClassName(selected: boolean) {
  return [
    "min-h-11 min-w-0 rounded-md border px-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60",
    selected
      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
      : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
  ].join(" ");
}

function createWeekdayButtonClassName(selected: boolean) {
  return [
    "min-h-11 min-w-11 rounded-md border px-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60",
    selected
      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
      : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
  ].join(" ");
}
