import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getYouthLearningScheduleWeekday,
  hiddenYouthLearningProgressChangeLogActorNames,
  parseYouthLearningScheduleWeekdays,
  shouldShowYouthLearningProgressChangeLogActor,
  type YouthLearningProgressChangeLog,
  type YouthLearningProgressChangeLogActor,
  type YouthLearningProgressChangeLogFilters,
  type YouthLearningSchedule,
} from "@/lib/youth-management-core";

type YouthLearningScheduleRecord = {
  id: string;
  youthId: string;
  scheduleDate: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
  repeatsWeekly: boolean;
  recurrenceSourceDate: string | null;
  recurrenceWeekdays: string | null;
};

export type YouthLearningProgressChangeLogsResult =
  YouthLearningProgressChangeLogFilters & {
    logs: YouthLearningProgressChangeLog[];
  };

const youthLearningProgressChangeLogPageSize = 5;

export async function getYouthLearningSchedules(
  scheduleDate: string,
): Promise<
  YouthLearningSchedule[]
> {
  const schedules = await prisma.youthLearningSchedule.findMany({
    where: {
      OR: [
        {
          scheduleDate,
        },
        {
          repeatsWeekly: true,
          scheduleDate: {
            lte: scheduleDate,
          },
        },
      ],
    },
    orderBy: [
      { scheduleDate: "asc" },
      { startMinute: "asc" },
      { updatedAt: "desc" },
    ],
    select: {
      id: true,
      youthId: true,
      scheduleDate: true,
      startHour: true,
      startMinute: true,
      endHour: true,
      endMinute: true,
      content: true,
      repeatsWeekly: true,
      recurrenceSourceDate: true,
      recurrenceWeekdays: true,
    },
  });

  return mapYouthLearningSchedulesForDate(schedules, scheduleDate);
}

export async function getYouthLearningProgressChangeLogs({
  actorId = "all",
  page = 1,
  pageSize = youthLearningProgressChangeLogPageSize,
  scheduleDate = "",
}: {
  actorId?: string;
  page?: number;
  pageSize?: number;
  scheduleDate?: string;
} = {}): Promise<YouthLearningProgressChangeLogsResult> {
  const normalizedActorId = actorId.trim() || "all";
  const normalizedScheduleDate = scheduleDate.trim();
  const normalizedPageSize = Math.max(1, pageSize);
  const where = createYouthLearningProgressChangeLogWhere({
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
    logs: logs
      .filter((log) =>
        shouldShowYouthLearningProgressChangeLogActor(log.actor.name),
      )
      .map((log) => ({
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

export async function getYouthLearningProgressChangeLogActors(): Promise<
  YouthLearningProgressChangeLogActor[]
> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["actorId"],
    where: createYouthLearningProgressChangeLogWhere(),
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
    .filter((actor) =>
      shouldShowYouthLearningProgressChangeLogActor(actor.name),
    )
    .sort((first, second) => first.name.localeCompare(second.name, "ko-KR"));
}

function mapYouthLearningSchedulesForDate(
  records: YouthLearningScheduleRecord[],
  selectedDate: string,
) {
  const scheduleMap = new Map<string, YouthLearningSchedule>();

  for (const record of records) {
    const isExactDate = record.scheduleDate === selectedDate;

    if (!isExactDate && !isRecurringOnSelectedDate(record, selectedDate)) {
      continue;
    }

    const recurrenceWeekdays = getRecordRecurrenceWeekdays(record);

    scheduleMap.set(createScheduleKey(record.youthId, record.startMinute), {
      id: record.id,
      youthId: record.youthId,
      scheduleDate: selectedDate,
      startHour: record.startHour,
      startMinute: record.startMinute,
      endHour: record.endHour,
      endMinute: record.endMinute,
      content: record.content,
      repeatsWeekly: record.repeatsWeekly,
      recurrenceSourceDate: isExactDate
        ? record.recurrenceSourceDate
        : record.scheduleDate,
      recurrenceWeekdays,
    });
  }

  return [...scheduleMap.values()].sort(sortYouthLearningSchedules);
}

function isRecurringOnSelectedDate(
  record: YouthLearningScheduleRecord,
  selectedDate: string,
) {
  return (
    record.repeatsWeekly &&
    record.scheduleDate < selectedDate &&
    getRecordRecurrenceWeekdays(record).includes(
      getYouthLearningScheduleWeekday(selectedDate),
    )
  );
}

function getRecordRecurrenceWeekdays(record: YouthLearningScheduleRecord) {
  if (!record.repeatsWeekly && !record.recurrenceSourceDate) {
    return [];
  }

  return parseYouthLearningScheduleWeekdays(
    record.recurrenceWeekdays,
    getYouthLearningScheduleWeekday(
      record.recurrenceSourceDate ?? record.scheduleDate,
    ),
  );
}

function createScheduleKey(youthId: string, startMinute: number) {
  return `${youthId}:${startMinute}`;
}

function sortYouthLearningSchedules(
  first: YouthLearningSchedule,
  second: YouthLearningSchedule,
) {
  return (
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute ||
    first.youthId.localeCompare(second.youthId)
  );
}

function createYouthLearningProgressChangeLogWhere({
  actorId = "all",
  scheduleDate = "",
}: {
  actorId?: string;
  scheduleDate?: string;
} = {}): Prisma.AuditLogWhereInput {
  const conditions: Prisma.AuditLogWhereInput[] = [
    {
      OR: [
        {
          targetType: "YouthLearningSchedule",
        },
        {
          metadata: {
            path: ["source"],
            equals: "learning-progress",
          },
        },
      ],
    },
    {
      actor: {
        name: {
          notIn: [...hiddenYouthLearningProgressChangeLogActorNames],
        },
      },
    },
  ];

  if (actorId !== "all") {
    conditions.push({
      actorId,
    });
  }

  if (scheduleDate) {
    conditions.push({
      OR: [
        {
          metadata: {
            path: ["scheduleDate"],
            equals: scheduleDate,
          },
        },
        {
          metadata: {
            path: ["sourceScheduleDate"],
            equals: scheduleDate,
          },
        },
      ],
    });
  }

  return {
    AND: conditions,
  };
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}
