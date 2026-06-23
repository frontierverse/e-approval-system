import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isYouthCommonScheduleWeekday,
  youthCommonScheduleWeekdays,
  type YouthCommonSchedule,
  type YouthCommonScheduleChangeLog,
  type YouthCommonScheduleChangeLogActor,
  type YouthCommonScheduleChangeLogFilters,
  type YouthCommonScheduleWeekdayFilter,
} from "@/lib/youth-management-core";

type YouthCommonScheduleRecord = {
  id: string;
  weekday: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
};

export type YouthCommonScheduleChangeLogsResult =
  YouthCommonScheduleChangeLogFilters & {
    logs: YouthCommonScheduleChangeLog[];
  };

const youthCommonScheduleChangeLogPageSize = 5;

export async function getYouthCommonSchedules(): Promise<YouthCommonSchedule[]> {
  const schedules = await prisma.youthCommonSchedule.findMany({
    where: {
      weekday: {
        in: youthCommonScheduleWeekdays.map((weekday) => weekday.value),
      },
    },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    select: {
      id: true,
      weekday: true,
      startHour: true,
      startMinute: true,
      endHour: true,
      endMinute: true,
      content: true,
    },
  });

  return schedules.map(mapYouthCommonSchedule).sort(sortYouthCommonSchedules);
}

export async function getYouthCommonScheduleChangeLogs({
  actorId = "all",
  page = 1,
  pageSize = youthCommonScheduleChangeLogPageSize,
  weekday = "all",
}: {
  actorId?: string;
  page?: number;
  pageSize?: number;
  weekday?: YouthCommonScheduleWeekdayFilter;
} = {}): Promise<YouthCommonScheduleChangeLogsResult> {
  const normalizedActorId = actorId.trim() || "all";
  const normalizedPageSize = Math.max(1, pageSize);
  const normalizedWeekday = normalizeCommonScheduleWeekdayFilter(weekday);
  const where = createYouthCommonScheduleChangeLogWhere({
    actorId: normalizedActorId,
    weekday: normalizedWeekday,
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
    total,
    totalPages,
    weekday: normalizedWeekday,
  };
}

export async function getYouthCommonScheduleChangeLogActors(): Promise<
  YouthCommonScheduleChangeLogActor[]
> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["actorId"],
    where: createYouthCommonScheduleChangeLogWhere(),
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

export function mapYouthCommonSchedule(
  schedule: YouthCommonScheduleRecord,
): YouthCommonSchedule {
  return {
    ...schedule,
    weekday: isYouthCommonScheduleWeekday(schedule.weekday)
      ? schedule.weekday
      : 1,
  };
}

function sortYouthCommonSchedules(
  first: YouthCommonSchedule,
  second: YouthCommonSchedule,
) {
  return (
    first.weekday - second.weekday ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute
  );
}

function createYouthCommonScheduleChangeLogWhere({
  actorId = "all",
  weekday = "all",
}: {
  actorId?: string;
  weekday?: YouthCommonScheduleWeekdayFilter;
} = {}): Prisma.AuditLogWhereInput {
  const conditions: Prisma.AuditLogWhereInput[] = [
    {
      OR: [
        {
          targetType: "YouthCommonSchedule",
        },
        {
          metadata: {
            path: ["source"],
            equals: "common-schedule",
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

  if (weekday !== "all") {
    conditions.push({
      metadata: {
        path: ["weekday"],
        equals: weekday,
      },
    });
  }

  return {
    AND: conditions,
  };
}

function normalizeCommonScheduleWeekdayFilter(
  value: YouthCommonScheduleWeekdayFilter,
): YouthCommonScheduleWeekdayFilter {
  return value === "all" || isYouthCommonScheduleWeekday(value)
    ? value
    : "all";
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}
