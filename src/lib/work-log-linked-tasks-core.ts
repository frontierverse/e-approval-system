import {
  getWorkLogToday,
  parseWorkLogDateValue,
  type WorkLogCompletedTask,
  type WorkLogEntry,
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
  workDate,
}: {
  authorId: string;
  authorName: string;
  completedTasks: readonly WorkLogCompletedTask[];
  manualEntry: WorkLogEntry | null;
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

  if (manualEntry) {
    return { ...manualEntry, completedTasks: tasks };
  }

  if (tasks.length === 0) {
    return null;
  }

  return {
    authorName,
    completedTasks: tasks,
    content: "",
    createdAt: tasks[0].completedAt,
    id: `tasks:${authorId}:${workDate}`,
    keyword: `할 일 완료 ${tasks.length}건`,
    manualLogId: null,
    manualUpdatedAt: null,
    updatedAt: tasks[tasks.length - 1].completedAt,
    updatedByName: null,
    workDate,
  };
}
