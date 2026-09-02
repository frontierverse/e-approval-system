import "server-only";

import { prisma } from "@/lib/prisma";
import {
  formatWorkLogDateValue,
  getWorkLogContributionRange,
  parseWorkLogDateValue,
  type WorkLogEntry,
} from "@/lib/work-log-core";

const workLogSelect = {
  content: true,
  createdAt: true,
  id: true,
  keyword: true,
  updatedAt: true,
  workDate: true,
} as const;

export type WorkLogPageData = {
  contributionDates: string[];
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
  const [selectedLog, contributionRecords, recentLogs] = await Promise.all([
    prisma.workLog.findUnique({
      where: {
        authorId_workDate: {
          authorId,
          workDate: parseWorkLogDateValue(selectedDate),
        },
      },
      select: workLogSelect,
    }),
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
    recentLogs: recentLogs.map(mapWorkLog),
    selectedLog: selectedLog ? mapWorkLog(selectedLog) : null,
  };
}

function mapWorkLog(record: {
  content: string;
  createdAt: Date;
  id: string;
  keyword: string;
  updatedAt: Date;
  workDate: Date;
}): WorkLogEntry {
  return {
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    keyword: record.keyword,
    updatedAt: record.updatedAt.toISOString(),
    workDate: formatWorkLogDateValue(record.workDate),
  };
}
