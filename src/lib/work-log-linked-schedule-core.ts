import { workLogContentMaxLength } from "@/lib/work-log-core";

export const workLogLinkedScheduleDayEndMinute = 24 * 60;

export type WorkLogLinkedSchedule = {
  id: string;
  youthId: string;
  youthName: string;
  content: string;
  startMinute: number;
  endMinute: number;
};

export type WorkLogLinkedScheduleLoadState =
  | { status: "error" }
  | { status: "loading" }
  | { schedules: WorkLogLinkedSchedule[]; status: "ready" };

export type WorkLogLinkedScheduleMergeResult = {
  addedCount: number;
  content: string;
  skippedCount: number;
};

export function formatWorkLogLinkedScheduleTime(minute: number) {
  if (minute >= workLogLinkedScheduleDayEndMinute) {
    return "24:00";
  }

  const safeMinute = Math.max(0, Math.floor(minute));
  const hour = Math.floor(safeMinute / 60);
  const minutePart = safeMinute % 60;

  return `${String(hour).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}`;
}

export function formatWorkLogLinkedScheduleTimeRange(
  startMinute: number,
  endMinute: number,
) {
  return `${formatWorkLogLinkedScheduleTime(startMinute)}-${formatWorkLogLinkedScheduleTime(endMinute)}`;
}

export function normalizeWorkLogLinkedScheduleText(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export function sortWorkLogLinkedSchedules<T extends WorkLogLinkedSchedule>(
  schedules: readonly T[],
): T[] {
  return [...schedules].sort(
    (first, second) =>
      first.startMinute - second.startMinute ||
      first.endMinute - second.endMinute ||
      first.youthName.localeCompare(second.youthName, "ko") ||
      first.content.localeCompare(second.content, "ko") ||
      first.id.localeCompare(second.id),
  );
}

export function formatWorkLogLinkedScheduleLine(
  schedule: Pick<
    WorkLogLinkedSchedule,
    "content" | "endMinute" | "startMinute" | "youthName"
  >,
) {
  return `${formatWorkLogLinkedScheduleTimeRange(
    schedule.startMinute,
    schedule.endMinute,
  )} ${normalizeWorkLogLinkedScheduleText(
    schedule.youthName,
  )} · ${normalizeWorkLogLinkedScheduleText(schedule.content)}`;
}

export function formatWorkLogLinkedScheduleCount(count: number) {
  return `${count}건`;
}

export function mergeWorkLogLinkedSchedulesIntoContent({
  content,
  maxLength = workLogContentMaxLength,
  schedules,
}: {
  content: string;
  maxLength?: number;
  schedules: readonly WorkLogLinkedSchedule[];
}): WorkLogLinkedScheduleMergeResult {
  const existingLines = new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const pendingLines = sortWorkLogLinkedSchedules(schedules)
    .map(formatWorkLogLinkedScheduleLine)
    .filter((line) => !existingLines.has(line));
  const uniquePendingLines = [...new Set(pendingLines)];
  let nextContent = content.replace(/\s+$/u, "");
  let addedCount = 0;
  let skippedCount = 0;

  for (const line of uniquePendingLines) {
    const candidate = nextContent ? `${nextContent}\n${line}` : line;

    if (candidate.length > maxLength) {
      skippedCount += 1;
      continue;
    }

    nextContent = candidate;
    addedCount += 1;
  }

  return {
    addedCount,
    content: addedCount > 0 ? nextContent : content,
    skippedCount,
  };
}

export function formatWorkLogLinkedScheduleMergeFeedback(
  result: Pick<WorkLogLinkedScheduleMergeResult, "addedCount" | "skippedCount">,
) {
  if (result.addedCount > 0 && result.skippedCount > 0) {
    return `개인 일정 ${result.addedCount}건을 내용에 추가했습니다. 내용 길이 제한으로 ${result.skippedCount}건은 추가하지 못했습니다.`;
  }

  if (result.addedCount > 0) {
    return `개인 일정 ${result.addedCount}건을 내용에 추가했습니다.`;
  }

  if (result.skippedCount > 0) {
    return "내용 길이 제한으로 개인 일정을 추가하지 못했습니다. 내용을 줄인 뒤 다시 시도해 주세요.";
  }

  return "개인 일정이 이미 내용에 모두 들어 있습니다.";
}
