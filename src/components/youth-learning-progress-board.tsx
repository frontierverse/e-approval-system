"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EmptyState } from "@/components/empty-state";
import { UserIdentity } from "@/components/user-identity";
import type {
  YouthActionResult,
  YouthLearningProgressChangeLog,
  YouthLearningSchedule,
  YouthProfile,
  YouthSpecialNote,
} from "@/lib/youth-management-core";
import {
  getYouthLearningScheduleToday,
  shiftYouthLearningScheduleDate,
  youthLearningScheduleEndHour,
  youthLearningScheduleStartHour,
} from "@/lib/youth-management-core";

type YouthLearningProgressBoardProps = {
  createYouth: (
    name: string,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
  changeLogs: YouthLearningProgressChangeLog[];
  deleteSchedule: (
    youthId: string,
    scheduleDate: string,
    startHour: number,
  ) => Promise<
    YouthActionResult<{ youthId: string; scheduleDate: string; startHour: number }>
  >;
  deleteYouth: (
    youthId: string,
  ) => Promise<YouthActionResult<{ youthId: string }>>;
  saveSchedule: (
    youthId: string,
    scheduleDate: string,
    startHour: number,
    content: string,
  ) => Promise<YouthActionResult<{ schedule: YouthLearningSchedule | null }>>;
  schedules: YouthLearningSchedule[];
  selectedDate: string;
  youths: YouthProfile[];
};

type YouthLearningProgressBoardContentProps =
  YouthLearningProgressBoardProps & {
    refresh?: () => void;
  };

type LearningProgressNote = {
  note: YouthSpecialNote;
  youth: YouthProfile;
};

type LearningTimeSlot = {
  endHour: number;
  label: string;
  startHour: number;
};

type SelectedCell = {
  youthId: string;
  startHour: number;
};

const learningProgressPattern =
  /학습|학원|진도|과제|수학|국어|영어|독서|검정고시|문제|학교|수업/;

function noop() {}

const learningTimeSlots: LearningTimeSlot[] = Array.from(
  { length: youthLearningScheduleEndHour - youthLearningScheduleStartHour },
  (_, index) => {
    const startHour = youthLearningScheduleStartHour + index;
    const endHour = startHour + 1;

    return {
      endHour,
      label: `${formatHourLabel(startHour)} - ${formatHourLabel(endHour)}`,
      startHour,
    };
  },
);

export function YouthLearningProgressBoard(
  props: YouthLearningProgressBoardProps,
) {
  const router = useRouter();

  return (
    <YouthLearningProgressBoardContent
      key={props.selectedDate}
      {...props}
      refresh={router.refresh}
    />
  );
}

export function YouthLearningProgressBoardContent({
  createYouth,
  changeLogs,
  deleteSchedule,
  deleteYouth,
  refresh = noop,
  saveSchedule,
  schedules,
  selectedDate,
  youths: initialYouths,
}: YouthLearningProgressBoardContentProps) {
  const [youths, setYouths] = useState(initialYouths);
  const [scheduleItems, setScheduleItems] = useState(schedules);
  const [dateDraft, setDateDraft] = useState(selectedDate);
  const [newYouthName, setNewYouthName] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingAction, startPendingAction] = useTransition();

  const scheduleMap = useMemo(() => {
    const nextMap = new Map<string, YouthLearningSchedule>();

    for (const schedule of scheduleItems) {
      nextMap.set(
        createScheduleKey(
          schedule.youthId,
          schedule.scheduleDate,
          schedule.startHour,
        ),
        schedule,
      );
    }

    return nextMap;
  }, [scheduleItems]);

  const previousDate = shiftYouthLearningScheduleDate(selectedDate, -1);
  const nextDate = shiftYouthLearningScheduleDate(selectedDate, 1);
  const today = getYouthLearningScheduleToday();
  const selectedDateLabel = formatDateWithWeekday(selectedDate);

  const selectedYouth = selectedCell
    ? youths.find((youth) => youth.id === selectedCell.youthId)
    : null;
  const selectedSlot = selectedCell
    ? learningTimeSlots.find((slot) => slot.startHour === selectedCell.startHour)
    : null;
  const selectedSchedule = selectedCell
    ? scheduleMap.get(
        createScheduleKey(
          selectedCell.youthId,
          selectedDate,
          selectedCell.startHour,
        ),
      )
    : undefined;
  const recentLearningNotes = useMemo(
    () => getRecentLearningNotes(youths),
    [youths],
  );

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
      refresh();
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
      refresh();
    });
  }

  function openScheduleModal(youthId: string, startHour: number) {
    const schedule = scheduleMap.get(
      createScheduleKey(youthId, selectedDate, startHour),
    );

    setSelectedCell({ youthId, startHour });
    setScheduleDraft(schedule?.content ?? "");
    setFormError("");
  }

  function closeScheduleModal() {
    setSelectedCell(null);
    setScheduleDraft("");
    setFormError("");
  }

  function saveSelectedSchedule() {
    if (!selectedCell) {
      return;
    }

    startPendingAction(async () => {
      const result = await saveSchedule(
        selectedCell.youthId,
        selectedDate,
        selectedCell.startHour,
        scheduleDraft,
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setScheduleItems((current) =>
        mergeScheduleItems(
          current,
          selectedCell.youthId,
          selectedDate,
          selectedCell.startHour,
          result.data.schedule,
        ),
      );
      closeScheduleModal();
      refresh();
    });
  }

  function removeSelectedSchedule() {
    if (!selectedCell) {
      return;
    }

    startPendingAction(async () => {
      const result = await deleteSchedule(
        selectedCell.youthId,
        selectedDate,
        selectedCell.startHour,
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
          result.data.startHour,
          null,
        ),
      );
      closeScheduleModal();
      refresh();
    });
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
              {selectedDateLabel} 기록을 오전 9시부터 오후 6시까지 1시간 단위로 관리합니다.
            </p>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-3 lg:max-w-2xl">
            <form
              action="/youth/learning-progress"
              className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
              method="get"
            >
              <a
                href={createLearningProgressDateHref(previousDate)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                이전 날
              </a>
              <label className="min-w-0 sm:w-44">
                <span className="sr-only">날짜 선택</span>
                <input
                  type="date"
                  name="date"
                  value={dateDraft}
                  onChange={(event) => setDateDraft(event.target.value)}
                  className="h-10 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </label>
              <button
                type="submit"
                className="h-10 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                이동
              </button>
              <a
                href={createLearningProgressDateHref(today)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                오늘
              </a>
              <a
                href={createLearningProgressDateHref(nextDate)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                다음 날
              </a>
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
                disabled={pendingAction}
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

        {youths.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
              <thead className="bg-[#f7f9fc] text-[#394150]">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 w-40 border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-left text-xs font-semibold"
                  >
                    시간
                  </th>
                  {youths.map((youth) => (
                    <th
                      key={youth.id}
                      scope="col"
                      className="min-w-48 border-b border-[#d9dee7] px-3 py-3 text-left text-xs font-semibold"
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                          {youth.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeYouth(youth)}
                          disabled={pendingAction}
                          className="h-8 shrink-0 rounded-md border border-[#efb4b4] bg-white px-2 text-xs font-semibold text-[#a13a3a] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {learningTimeSlots.map((slot) => (
                  <tr key={slot.startHour}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 h-20 border-b border-r border-[#eef1f5] bg-white px-3 py-3 text-left text-xs font-semibold text-[#394150]"
                    >
                      {slot.label}
                    </th>
                    {youths.map((youth) => {
                      const schedule = scheduleMap.get(
                        createScheduleKey(youth.id, selectedDate, slot.startHour),
                      );

                      return (
                        <td
                          key={`${slot.startHour}-${youth.id}`}
                          className="h-20 border-b border-[#eef1f5] p-0 align-top"
                        >
                          <button
                            type="button"
                            onClick={() => openScheduleModal(youth.id, slot.startHour)}
                            className={[
                              "block h-20 w-full px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#d7eceb]",
                              schedule
                                ? "bg-[#f4fbfa] hover:bg-[#ecf7f6]"
                                : "bg-white hover:bg-[#f7f9fc]",
                            ].join(" ")}
                          >
                            {schedule ? (
                              <span className="line-clamp-3 whitespace-pre-line break-words text-sm leading-5 text-[#26333f] [overflow-wrap:anywhere]">
                                {schedule.content}
                              </span>
                            ) : (
                              <span className="text-xs text-[#9aa4b2]">미입력</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              title="등록된 학생이 없습니다."
              description="학생을 추가하면 시간표를 입력할 수 있습니다."
            />
          </div>
        )}
      </div>

      {changeLogs.length > 0 ? (
        <section aria-label="최근 변경 내역">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#16181d]">
              최근 변경 내역
            </h2>
            <p className="text-sm text-[#697386]">
              누가 언제 무엇을 변경했는지 기록합니다.
            </p>
          </div>
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
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

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
                  {formatDate(selectedDate)} · {selectedYouth.name} · {selectedSlot.label}
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
                  disabled={pendingAction || !selectedSchedule}
                  className="h-10 rounded-md border border-[#efb4b4] bg-white px-4 text-sm font-semibold text-[#a13a3a] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  삭제
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeScheduleModal}
                    disabled={pendingAction}
                    className="h-10 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={pendingAction}
                    className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] disabled:cursor-not-allowed disabled:bg-[#cfd6e3] disabled:text-[#697386]"
                  >
                    저장
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

function mergeScheduleItems(
  current: YouthLearningSchedule[],
  youthId: string,
  scheduleDate: string,
  startHour: number,
  schedule: YouthLearningSchedule | null,
) {
  const key = createScheduleKey(youthId, scheduleDate, startHour);
  const withoutCurrent = current.filter(
    (item) =>
      createScheduleKey(item.youthId, item.scheduleDate, item.startHour) !== key,
  );

  return schedule
    ? [...withoutCurrent, schedule].sort(sortScheduleItems)
    : withoutCurrent;
}

function sortScheduleItems(
  first: YouthLearningSchedule,
  second: YouthLearningSchedule,
) {
  return (
    first.scheduleDate.localeCompare(second.scheduleDate) ||
    first.startHour - second.startHour ||
    first.youthId.localeCompare(second.youthId)
  );
}

function createScheduleKey(youthId: string, scheduleDate: string, startHour: number) {
  return `${scheduleDate}:${youthId}:${startHour}`;
}

function createLearningProgressDateHref(scheduleDate: string) {
  return `/youth/learning-progress?date=${encodeURIComponent(scheduleDate)}`;
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

function getChangeLogDetail(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const previousContent = getNullableStringValue(
    metadata,
    "previousContent",
  );
  const nextContent = getNullableStringValue(metadata, "nextContent");

  if (previousContent === undefined && nextContent === undefined) {
    return null;
  }

  return {
    previousContent: previousContent ?? null,
    nextContent: nextContent ?? null,
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
