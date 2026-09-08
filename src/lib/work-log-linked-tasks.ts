import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { WorkLogCompletedTask } from "@/lib/work-log-core";
import { getWorkLogTaskDateRange } from "@/lib/work-log-linked-tasks-core";

export type WorkLogReadClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "approvalDocument" | "staffTask" | "workLog"
>;

export const workLogCompletedTaskSelect = {
  assignee: { select: { name: true } },
  completedAt: true,
  description: true,
  id: true,
  meetingTitle: true,
  title: true,
} as const satisfies Prisma.StaffTaskSelect;

export type WorkLogCompletedTaskRecord = Prisma.StaffTaskGetPayload<{
  select: typeof workLogCompletedTaskSelect;
}>;

export async function getWorkLogCompletedTaskRecords(
  {
    authorId,
    workDates,
  }: {
    authorId: string;
    workDates: readonly string[];
  },
  db: WorkLogReadClient = prisma,
): Promise<WorkLogCompletedTaskRecord[]> {
  const dates = [...new Set(workDates)];

  if (dates.length === 0) {
    return [];
  }

  return db.staffTask.findMany({
    where: {
      assigneeId: authorId,
      deletedAt: null,
      OR: dates.map((date) => ({
        completedAt: getWorkLogTaskDateRange(date),
      })),
    },
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    select: workLogCompletedTaskSelect,
  });
}

/** Group in PostgreSQL so a busy day cannot crowd older days out of the list. */
export async function getWorkLogCompletedTaskDates(
  {
    authorId,
    endDate,
    startDate,
    limit,
  }: {
    authorId: string;
    endDate: string;
    startDate?: string;
    limit?: number;
  },
  db: WorkLogReadClient = prisma,
): Promise<string[]> {
  const end = getWorkLogTaskDateRange(endDate).lt;
  const start = startDate ? getWorkLogTaskDateRange(startDate).gte : null;

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("Invalid work-log date limit.");
  }

  const records = await db.$queryRaw<{ workDate: string }[]>(Prisma.sql`
    SELECT to_char(
      ("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul',
      'YYYY-MM-DD'
    ) AS "workDate"
    FROM "StaffTask"
    WHERE "assigneeId" = ${authorId}
      AND "deletedAt" IS NULL
      AND "completedAt" IS NOT NULL
      AND "completedAt" < ${end}
      ${start ? Prisma.sql`AND "completedAt" >= ${start}` : Prisma.empty}
    GROUP BY 1
    ORDER BY "workDate" DESC
    ${limit !== undefined ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `);

  return records.map((record) => record.workDate);
}

export function mapWorkLogCompletedTask(
  record: WorkLogCompletedTaskRecord,
): WorkLogCompletedTask {
  if (!record.completedAt) {
    throw new Error("A linked work-log task must be completed.");
  }

  return {
    completedAt: record.completedAt.toISOString(),
    description: record.description,
    id: record.id,
    meetingTitle: record.meetingTitle,
    title: record.title,
  };
}
