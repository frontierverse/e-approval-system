import {
  getWorkLogToday,
  parseWorkLogDateValue,
  type WorkLogCompletedTask,
  type WorkLogEntry,
  type WorkLogMeetingDocument,
} from "@/lib/work-log-core";

const dayInMs = 24 * 60 * 60 * 1000;
const koreanUtcOffsetInMs = 9 * 60 * 60 * 1000;

/** WorkLog dates are calendar dates; task completion timestamps are UTC. */
export function getWorkLogTaskDateRange(workDate: string) {
  const start = parseWorkLogDateValue(workDate).getTime() - koreanUtcOffsetInMs;

  return {
    gte: new Date(start),
    lt: new Date(start + dayInMs),
  };
}

/** Keep automatic completion records separate from editable, manually saved text. */
export function combineWorkLogEntry({
  authorId,
  authorName,
  completedTasks,
  manualEntry,
  meetingDocuments = [],
  meetingRecordedAt = [],
  workDate,
}: {
  authorId: string;
  authorName: string;
  completedTasks: readonly WorkLogCompletedTask[];
  manualEntry: WorkLogEntry | null;
  meetingDocuments?: readonly WorkLogMeetingDocument[];
  meetingRecordedAt?: readonly string[];
  workDate: string;
}): WorkLogEntry | null {
  const tasksById = new Map<string, WorkLogCompletedTask>();

  for (const task of completedTasks) {
    if (getWorkLogToday(new Date(task.completedAt)) !== workDate) {
      continue;
    }

    const previous = tasksById.get(task.id);

    if (!previous || previous.completedAt < task.completedAt) {
      tasksById.set(task.id, task);
    }
  }

  const tasks = [...tasksById.values()].sort(
    (first, second) =>
      first.completedAt.localeCompare(second.completedAt) ||
      first.id.localeCompare(second.id),
  );
  const meetings = [...new Map(
    meetingDocuments
      .filter((meeting) =>
        meeting.meetingDate === workDate && meeting.attachments.length > 0,
      )
      .map((meeting) => [meeting.id, meeting]),
  ).values()];

  if (manualEntry) {
    return { ...manualEntry, completedTasks: tasks, meetingDocuments: meetings };
  }

  if (tasks.length === 0 && meetings.length === 0) {
    return null;
  }

  const recordedTimes = [
    ...tasks.map((task) => task.completedAt),
    ...(meetings.length > 0 ? meetingRecordedAt : []),
  ].sort();
  const fallbackRecordedAt = getWorkLogTaskDateRange(workDate).gte.toISOString();
  const keyword = [
    ...(tasks.length > 0 ? [`할 일 완료 ${tasks.length}건`] : []),
    ...(meetings.length > 0 ? [`회의록 ${meetings.length}건`] : []),
  ].join(" · ");

  return {
    authorName,
    completedTasks: tasks,
    meetingDocuments: meetings,
    content: "",
    createdAt: recordedTimes[0] ?? fallbackRecordedAt,
    id: `${meetings.length > 0 ? "auto" : "tasks"}:${authorId}:${workDate}`,
    keyword,
    manualLogId: null,
    manualUpdatedAt: null,
    updatedAt: recordedTimes[recordedTimes.length - 1] ?? fallbackRecordedAt,
    updatedByName: null,
    workDate,
  };
}
