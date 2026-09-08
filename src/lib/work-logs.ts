import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatWorkLogDateValue,
  getWorkLogContributionRange,
  getWorkLogToday,
  parseWorkLogDateValue,
  type WorkLogEntry,
} from "@/lib/work-log-core";
import type { WorkLogLinkedScheduleLoadState } from "@/lib/work-log-linked-schedule-core";
import { getWorkLogLinkedScheduleLoadState } from "@/lib/work-log-linked-schedules";
import { combineWorkLogEntry } from "@/lib/work-log-linked-tasks-core";
import {
  getWorkLogCompletedTaskDates,
  getWorkLogCompletedTaskRecords,
  mapWorkLogCompletedTask,
  type WorkLogCompletedTaskRecord,
  type WorkLogReadClient,
} from "@/lib/work-log-linked-tasks";

export type { WorkLogReadClient } from "@/lib/work-log-linked-tasks";

const recentWorkLogDayCount = 12;

export const workLogSelect = {
  author: {
    select: {
      name: true,
    },
  },
  content: true,
  createdAt: true,
  id: true,
  keyword: true,
  updatedAt: true,
  updatedBy: {
    select: {
      name: true,
    },
  },
  workDate: true,
} as const satisfies Prisma.WorkLogSelect;

export type WorkLogRecord = Prisma.WorkLogGetPayload<{
  select: typeof workLogSelect;
}>;

export type WorkLogPageData = {
  contributionDates: string[];
  linkedScheduleState: WorkLogLinkedScheduleLoadState;
  recentLogs: WorkLogEntry[];
  selectedLog: WorkLogEntry | null;
};

export async function getWorkLogPageData(
  {
    authorId,
    selectedDate,
    today,
  }: {
    authorId: string;
    selectedDate: string;
    today: string;
  },
  db: WorkLogReadClient = prisma,
): Promise<WorkLogPageData> {
  const { startDate } = getWorkLogContributionRange(today);
  const [
    selectedRecord,
    linkedScheduleState,
    contributionRecords,
    recentRecords,
    contributionTaskDates,
    recentTaskDates,
  ] = await Promise.all([
    db.workLog.findUnique({
      where: {
        authorId_workDate: {
          authorId,
          workDate: parseWorkLogDateValue(selectedDate),
        },
      },
      select: workLogSelect,
    }),
    getWorkLogLinkedScheduleLoadState(selectedDate),
    db.workLog.findMany({
      where: {
        authorId,
        workDate: {
          gte: parseWorkLogDateValue(startDate),
          lte: parseWorkLogDateValue(today),
        },
      },
      orderBy: [{ workDate: "asc" }],
      select: {
        workDate: true,
      },
    }),
    db.workLog.findMany({
      where: {
        authorId,
        workDate: { lte: parseWorkLogDateValue(today) },
      },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: recentWorkLogDayCount,
      select: workLogSelect,
    }),
    getWorkLogCompletedTaskDates({ authorId, endDate: today, startDate }, db),
    getWorkLogCompletedTaskDates(
      { authorId, endDate: today, limit: recentWorkLogDayCount },
      db,
    ),
  ]);

  const recentDates = [
    ...new Set([
      ...recentRecords.map((record) => formatWorkLogDateValue(record.workDate)),
      ...recentTaskDates,
    ]),
  ].sort().reverse().slice(0, recentWorkLogDayCount);
  const taskRecords = await getWorkLogCompletedTaskRecords(
    { authorId, workDates: [...recentDates, selectedDate] },
    db,
  );
  const tasksByDate = new Map<string, WorkLogCompletedTaskRecord[]>();

  for (const record of taskRecords) {
    if (!record.completedAt) {
      continue;
    }

    const date = getWorkLogToday(record.completedAt);
    const records = tasksByDate.get(date) ?? [];
    records.push(record);
    tasksByDate.set(date, records);
  }

  const manualByDate = new Map(
    recentRecords.map((record) => [
      formatWorkLogDateValue(record.workDate),
      record,
    ]),
  );
  const recentLogs = recentDates
    .map((workDate) => combineWorkLogRecords({
      authorId,
      record: manualByDate.get(workDate) ?? null,
      taskRecords: tasksByDate.get(workDate) ?? [],
      workDate,
    }))
    .filter((entry): entry is WorkLogEntry => entry !== null);
  const selectedLog = combineWorkLogRecords({
    authorId,
    record: selectedRecord,
    taskRecords: tasksByDate.get(selectedDate) ?? [],
    workDate: selectedDate,
  });

  return {
    contributionDates: [
      ...new Set([
        ...contributionRecords.map((record) => formatWorkLogDateValue(record.workDate)),
        ...contributionTaskDates,
      ]),
    ].sort(),
    linkedScheduleState,
    recentLogs,
    selectedLog,
  };
}

export async function getWorkLogEntry(
  {
    authorId,
    workDate,
  }: {
    authorId: string;
    workDate: string;
  },
  db: WorkLogReadClient = prisma,
): Promise<WorkLogEntry | null> {
  const [record, taskRecords] = await Promise.all([
    db.workLog.findUnique({
      where: {
        authorId_workDate: {
          authorId,
          workDate: parseWorkLogDateValue(workDate),
        },
      },
      select: workLogSelect,
    }),
    getWorkLogCompletedTaskRecords({ authorId, workDates: [workDate] }, db),
  ]);

  return combineWorkLogRecords({ authorId, record, taskRecords, workDate });
}

export function mapWorkLogRecord(record: WorkLogRecord): WorkLogEntry {
  return {
    authorName: record.author.name,
    completedTasks: [],
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    keyword: record.keyword,
    manualLogId: record.id,
    manualUpdatedAt: record.updatedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    updatedByName: record.updatedBy?.name ?? null,
    workDate: formatWorkLogDateValue(record.workDate),
  };
}

function combineWorkLogRecords({
  authorId,
  record,
  taskRecords,
  workDate,
}: {
  authorId: string;
  record: WorkLogRecord | null;
  taskRecords: readonly WorkLogCompletedTaskRecord[];
  workDate: string;
}) {
  return combineWorkLogEntry({
    authorId,
    authorName: record?.author.name ?? taskRecords[0]?.assignee.name ?? "",
    completedTasks: taskRecords.map(mapWorkLogCompletedTask),
    manualEntry: record ? mapWorkLogRecord(record) : null,
    workDate,
  });
}
