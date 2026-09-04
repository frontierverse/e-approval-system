import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatWorkLogDateValue,
  getWorkLogContributionRange,
  parseWorkLogDateValue,
  type WorkLogEntry,
} from "@/lib/work-log-core";
import type { WorkLogLinkedScheduleLoadState } from "@/lib/work-log-linked-schedule-core";
import { getWorkLogLinkedScheduleLoadState } from "@/lib/work-log-linked-schedules";

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

export async function getWorkLogPageData({
  authorId,
  selectedDate,
  today,
}: {
  authorId: string;
  selectedDate: string;
  today: string;
}): Promise<WorkLogPageData> {
  const { startDate } = getWorkLogContributionRange(today);
  const [selectedLog, linkedScheduleState, contributionRecords, recentLogs] =
    await Promise.all([
      getWorkLogEntry({ authorId, workDate: selectedDate }),
      getWorkLogLinkedScheduleLoadState(selectedDate),
      prisma.workLog.findMany({
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
      prisma.workLog.findMany({
        where: {
          authorId,
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 12,
        select: workLogSelect,
      }),
    ]);

  return {
    contributionDates: contributionRecords.map((record) =>
      formatWorkLogDateValue(record.workDate),
    ),
    linkedScheduleState,
    recentLogs: recentLogs.map(mapWorkLogRecord),
    selectedLog,
  };
}

export async function getWorkLogEntry({
  authorId,
  workDate,
}: {
  authorId: string;
  workDate: string;
}) {
  const record = await prisma.workLog.findUnique({
    where: {
      authorId_workDate: {
        authorId,
        workDate: parseWorkLogDateValue(workDate),
      },
    },
    select: workLogSelect,
  });

  return record ? mapWorkLogRecord(record) : null;
}

export function mapWorkLogRecord(record: WorkLogRecord): WorkLogEntry {
  return {
    authorName: record.author.name,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    keyword: record.keyword,
    updatedAt: record.updatedAt.toISOString(),
    updatedByName: record.updatedBy?.name ?? null,
    workDate: formatWorkLogDateValue(record.workDate),
  };
}
