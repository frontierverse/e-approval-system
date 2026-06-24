import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isYouthCommonScheduleWeekday,
  youthCommonScheduleWeekdays,
  type YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";

export type WorkSchedule = {
  id: string;
  weekday: YouthLearningScheduleWeekday;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
};

export type WorkScheduleWeekdayFilter = "all" | YouthLearningScheduleWeekday;

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
  total: number;
  totalPages: number;
  weekday: WorkScheduleWeekdayFilter;
};

type WorkScheduleRecord = {
  id: string;
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

export async function getWorkSchedules(): Promise<WorkSchedule[]> {
  const schedules = await prisma.workSchedule.findMany({
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

  return schedules.map(mapWorkSchedule).sort(sortWorkSchedules);
}

export async function getWorkScheduleChangeLogs({
  actorId = "all",
  page = 1,
  pageSize = workScheduleChangeLogPageSize,
  weekday = "all",
}: {
  actorId?: string;
  page?: number;
  pageSize?: number;
  weekday?: WorkScheduleWeekdayFilter;
} = {}): Promise<WorkScheduleChangeLogsResult> {
  const normalizedActorId = actorId.trim() || "all";
  const normalizedPageSize = Math.max(1, pageSize);
  const normalizedWeekday = normalizeWorkScheduleWeekdayFilter(weekday);
  const where = createWorkScheduleChangeLogWhere({
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

export function mapWorkSchedule(schedule: WorkScheduleRecord): WorkSchedule {
  return {
    ...schedule,
    weekday: isYouthCommonScheduleWeekday(schedule.weekday)
      ? schedule.weekday
      : 1,
  };
}

function sortWorkSchedules(first: WorkSchedule, second: WorkSchedule) {
  return (
    first.weekday - second.weekday ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute
  );
}

function createWorkScheduleChangeLogWhere({
  actorId = "all",
  weekday = "all",
}: {
  actorId?: string;
  weekday?: WorkScheduleWeekdayFilter;
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

function normalizeWorkScheduleWeekdayFilter(
  value: WorkScheduleWeekdayFilter,
): WorkScheduleWeekdayFilter {
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
