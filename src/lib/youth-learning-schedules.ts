import "server-only";

import { prisma } from "@/lib/prisma";
import type { YouthLearningSchedule } from "@/lib/youth-management-core";
import type { YouthLearningProgressChangeLog } from "@/lib/youth-management-core";

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
};

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
    },
  });

  return mapYouthLearningSchedulesForDate(schedules, scheduleDate);
}

export async function getYouthLearningProgressChangeLogs(
  limit = 20,
): Promise<YouthLearningProgressChangeLog[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
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
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
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

  return logs.map((log) => ({
    id: log.id,
    message: log.message,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
    actor: {
      ...log.actor,
      profileImageUpdatedAt: log.actor.profileImageUpdatedAt?.toISOString() ?? null,
    },
  }));
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
      recurrenceSourceDate: isExactDate ? null : record.scheduleDate,
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
    getUtcWeekday(record.scheduleDate) === getUtcWeekday(selectedDate)
  );
}

function getUtcWeekday(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );

  return date.getUTCDay();
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
