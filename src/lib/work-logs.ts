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
import {
  getWorkLogMeetingAuthorName,
  getWorkLogMeetingDateIndex,
  getWorkLogMeetingRecords,
  mapWorkLogMeetingDocument,
  type WorkLogMeetingDocumentRecord,
} from "@/lib/work-log-linked-meetings";
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
    meetingIndex,
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
    getWorkLogMeetingDateIndex({ authorId, endDate: today }, db),
  ]);

  const recentDates = [
    ...new Set([
      ...recentRecords.map((record) => formatWorkLogDateValue(record.workDate)),
      ...recentTaskDates,
      ...meetingIndex.map((meeting) => meeting.meetingDate),
    ]),
  ].sort().reverse().slice(0, recentWorkLogDayCount);
  const displayedDates = new Set([...recentDates, selectedDate]);
  const [taskRecords, meetingRecords] = await Promise.all([
    getWorkLogCompletedTaskRecords(
      { authorId, workDates: [...displayedDates] },
      db,
    ),
    getWorkLogMeetingRecords({
      authorId,
      documentIds: meetingIndex
        .filter((meeting) => displayedDates.has(meeting.meetingDate))
        .map((meeting) => meeting.documentId),
      workDates: [...displayedDates],
    }, db),
  ]);
  const tasksByDate = new Map<string, WorkLogCompletedTaskRecord[]>();
  const meetingsByDate = new Map<string, WorkLogMeetingDocumentRecord[]>();

  for (const record of meetingRecords) {
    const date = mapWorkLogMeetingDocument(record).meetingDate;
    const records = meetingsByDate.get(date) ?? [];
    records.push(record);
    meetingsByDate.set(date, records);
  }

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
      meetingRecords: meetingsByDate.get(workDate) ?? [],
      workDate,
    }))
    .filter((entry): entry is WorkLogEntry => entry !== null);
  const selectedLog = combineWorkLogRecords({
    authorId,
    record: selectedRecord,
    taskRecords: tasksByDate.get(selectedDate) ?? [],
    meetingRecords: meetingsByDate.get(selectedDate) ?? [],
    workDate: selectedDate,
  });

  return {
    contributionDates: [
      ...new Set([
        ...contributionRecords.map((record) => formatWorkLogDateValue(record.workDate)),
        ...contributionTaskDates,
        ...meetingIndex
          .filter((meeting) => meeting.meetingDate >= startDate)
          .map((meeting) => meeting.meetingDate),
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
  const [record, taskRecords, meetingIndex] = await Promise.all([
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
    getWorkLogMeetingDateIndex({ authorId, endDate: workDate }, db),
  ]);
  const meetingRecords = await getWorkLogMeetingRecords({
    authorId,
    documentIds: meetingIndex
      .filter((meeting) => meeting.meetingDate === workDate)
      .map((meeting) => meeting.documentId),
    workDates: [workDate],
  }, db);

  return combineWorkLogRecords({ authorId, record, taskRecords, meetingRecords, workDate });
}

export function mapWorkLogRecord(record: WorkLogRecord): WorkLogEntry {
  return {
    authorName: record.author.name,
    completedTasks: [],
    meetingDocuments: [],
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
  meetingRecords,
  workDate,
}: {
  authorId: string;
  record: WorkLogRecord | null;
  taskRecords: readonly WorkLogCompletedTaskRecord[];
  meetingRecords: readonly WorkLogMeetingDocumentRecord[];
  workDate: string;
}) {
  return combineWorkLogEntry({
    authorId,
    authorName: record?.author.name ?? taskRecords[0]?.assignee.name ?? (
      meetingRecords[0] ? getWorkLogMeetingAuthorName(meetingRecords[0], authorId) : ""
    ),
    completedTasks: taskRecords.map(mapWorkLogCompletedTask),
    meetingDocuments: meetingRecords.map(mapWorkLogMeetingDocument),
    meetingRecordedAt: meetingRecords.map((meeting) =>
      (meeting.completedAt ?? meeting.createdAt).toISOString(),
    ),
    manualEntry: record ? mapWorkLogRecord(record) : null,
    workDate,
  });
}
