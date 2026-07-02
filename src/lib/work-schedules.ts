import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  getWorkScheduleMonthRange,
  normalizeWorkScheduleMonth,
  shiftWorkScheduleDate,
} from "@/lib/work-schedule-calendar";
import { prisma } from "@/lib/prisma";
import { getApprovedStaffVacationDateEntries } from "@/lib/staff-vacations";
import {
  getYouthLearningScheduleWeekday,
  isYouthLearningScheduleDate,
  type YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";

export type WorkSchedule = {
  id: string;
  scheduleDate: string;
  weekday: YouthLearningScheduleWeekday;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
  detailLabel?: string;
  readOnly?: boolean;
  sourceType?: "approvedVacation" | "manual";
  timeLabel?: string;
};

export type WorkScheduleDateFilter = "" | (string & {});

export type WorkScheduleChangeLog = {
  id: string;
  message: string | null;
  createdAt: string;
  metadata: unknown;
  actor: {
    id: string;
    name: string;
    email: string | null;
    profileImageStorageKey: string | null;
    profileImageUpdatedAt: string | null;
  };
};

export type WorkScheduleChangeLogActor = {
  id: string;
  name: string;
  email: string | null;
};

export type WorkScheduleChangeLogFilters = {
  actorId: string;
  page: number;
  pageSize: number;
  scheduleDate: WorkScheduleDateFilter;
  total: number;
  totalPages: number;
};

type WorkScheduleRecord = {
  id: string;
  scheduleDate: string;
  weekday: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
};

export type WorkScheduleChangeLogsResult = WorkScheduleChangeLogFilters & {
  logs: WorkScheduleChangeLog[];
};

const workScheduleChangeLogPageSize = 5;

export async function getWorkSchedules(
  month?: string,
): Promise<WorkSchedule[]> {
  const { endDate, startDate } = getWorkScheduleMonthRange(
    normalizeWorkScheduleMonth(month),
  );
  const [schedules, vacationEntries] = await Promise.all([
    prisma.workSchedule.findMany({
      where: {
        scheduleDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: [{ scheduleDate: "asc" }, { startMinute: "asc" }],
      select: workScheduleSelect,
    }),
    getApprovedStaffVacationDateEntries({
      fromDate: startDate,
      toDate: shiftWorkScheduleDate(endDate, -1),
    }),
  ]);

  return [
    ...schedules.map(mapWorkSchedule),
    ...vacationEntries.map((entry, index) => ({
      id: `approved-vacation:${entry.id}`,
      scheduleDate: entry.date,
      weekday: getYouthLearningScheduleWeekday(entry.date),
      startHour: 0,
      startMinute: -1000 + index,
      endHour: 0,
      endMinute: -999 + index,
      content: `${entry.staffName} ${entry.vacationLabel}`,
      detailLabel: entry.detailLabel,
      readOnly: true,
      sourceType: "approvedVacation" as const,
      timeLabel: entry.vacationLabel,
    })),
  ].sort(sortWorkSchedules);
}

export async function getWorkScheduleChangeLogs({
  actorId = "all",
  page = 1,
  pageSize = workScheduleChangeLogPageSize,
  scheduleDate = "",
}: {
  actorId?: string;
  page?: number;
  pageSize?: number;
  scheduleDate?: WorkScheduleDateFilter;
} = {}): Promise<WorkScheduleChangeLogsResult> {
  const normalizedActorId = actorId.trim() || "all";
  const normalizedPageSize = Math.max(1, pageSize);
  const normalizedScheduleDate = normalizeWorkScheduleDateFilter(scheduleDate);
  const where = createWorkScheduleChangeLogWhere({
    actorId: normalizedActorId,
    scheduleDate: normalizedScheduleDate,
  });
  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = clampPage(page, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize,
    select: {
      id: true,
      message: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          profileImageStorageKey: true,
          profileImageUpdatedAt: true,
        },
      },
    },
  });

  return {
    actorId: normalizedActorId,
    logs: logs.map((log) => ({
      id: log.id,
      message: log.message,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
      actor: {
        ...log.actor,
        profileImageUpdatedAt:
          log.actor.profileImageUpdatedAt?.toISOString() ?? null,
      },
    })),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    scheduleDate: normalizedScheduleDate,
    total,
    totalPages,
  };
}

export async function getWorkScheduleChangeLogActors(): Promise<
  WorkScheduleChangeLogActor[]
> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["actorId"],
    where: createWorkScheduleChangeLogWhere(),
    orderBy: {
      createdAt: "desc",
    },
    select: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return rows
    .map((row) => row.actor)
    .sort((first, second) => first.name.localeCompare(second.name, "ko-KR"));
}

export const workScheduleSelect = {
  id: true,
  scheduleDate: true,
  weekday: true,
  startHour: true,
  startMinute: true,
  endHour: true,
  endMinute: true,
  content: true,
} satisfies Prisma.WorkScheduleSelect;

export function mapWorkSchedule(schedule: WorkScheduleRecord): WorkSchedule {
  return {
    ...schedule,
    sourceType: "manual",
    weekday: getYouthLearningScheduleWeekday(schedule.scheduleDate),
  };
}

function sortWorkSchedules(first: WorkSchedule, second: WorkSchedule) {
  return (
    first.scheduleDate.localeCompare(second.scheduleDate) ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute
  );
}

function createWorkScheduleChangeLogWhere({
  actorId = "all",
  scheduleDate = "",
}: {
  actorId?: string;
  scheduleDate?: WorkScheduleDateFilter;
} = {}): Prisma.AuditLogWhereInput {
  const conditions: Prisma.AuditLogWhereInput[] = [
    {
      OR: [
        {
          targetType: "WorkSchedule",
        },
        {
          metadata: {
            path: ["source"],
            equals: "work-schedule",
          },
        },
      ],
    },
  ];

  if (actorId !== "all") {
    conditions.push({
      actorId,
    });
  }

  if (scheduleDate) {
    conditions.push({
      metadata: {
        path: ["scheduleDate"],
        equals: scheduleDate,
      },
    });
  }

  return {
    AND: conditions,
  };
}

function normalizeWorkScheduleDateFilter(
  value: WorkScheduleDateFilter,
): WorkScheduleDateFilter {
  return value && isYouthLearningScheduleDate(value) ? value : "";
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}
