import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getYouthPersonalScheduleCalendarDates,
  isYouthPersonalScheduleMonth,
  isYouthPersonalScheduleSelectionMode,
  parseYouthPersonalScheduleWeekdays,
  type YouthPersonalScheduleSelectionMode,
  type YouthPersonalScheduleWeekday,
} from "@/lib/youth-personal-schedule-core";

export type YouthPersonalSchedule = {
  id: string;
  youthId: string;
  content: string;
  startMinute: number;
  endMinute: number;
  selectionMode: YouthPersonalScheduleSelectionMode;
  occurrenceDates: string[];
  recurrenceWeekdays: YouthPersonalScheduleWeekday[];
  recurrenceStartDate: string | null;
  recurrenceEndDate: string | null;
};

export const youthPersonalScheduleSelect = {
  id: true,
  youthId: true,
  content: true,
  startMinute: true,
  endMinute: true,
  selectionMode: true,
  occurrenceDates: true,
  recurrenceWeekdays: true,
  recurrenceStartDate: true,
  recurrenceEndDate: true,
} satisfies Prisma.YouthPersonalScheduleSelect;

type YouthPersonalScheduleRecord = Prisma.YouthPersonalScheduleGetPayload<{
  select: typeof youthPersonalScheduleSelect;
}>;

export async function getYouthPersonalSchedules(
  youthId: string,
  month: string,
): Promise<YouthPersonalSchedule[]> {
  const normalizedYouthId =
    typeof youthId === "string" ? youthId.trim() : "";

  if (!normalizedYouthId || !isYouthPersonalScheduleMonth(month)) {
    return [];
  }

  const calendarDates = getYouthPersonalScheduleCalendarDates(month);
  const schedules = await prisma.youthPersonalSchedule.findMany({
    where: {
      youthId: normalizedYouthId,
      occurrenceDates: {
        hasSome: calendarDates,
      },
    },
    orderBy: [{ startMinute: "asc" }, { endMinute: "asc" }, { id: "asc" }],
    select: youthPersonalScheduleSelect,
  });
  const calendarDateSet = new Set(calendarDates);

  return schedules
    .map(mapYouthPersonalSchedule)
    .sort((first, second) => {
      const firstDate = getFirstOccurrenceInCalendar(first, calendarDateSet);
      const secondDate = getFirstOccurrenceInCalendar(second, calendarDateSet);

      return (
        firstDate.localeCompare(secondDate) ||
        first.startMinute - second.startMinute ||
        first.endMinute - second.endMinute ||
        first.id.localeCompare(second.id)
      );
    });
}

export function mapYouthPersonalSchedule(
  schedule: YouthPersonalScheduleRecord,
): YouthPersonalSchedule {
  return {
    id: schedule.id,
    youthId: schedule.youthId,
    content: schedule.content,
    startMinute: schedule.startMinute,
    endMinute: schedule.endMinute,
    selectionMode: isYouthPersonalScheduleSelectionMode(schedule.selectionMode)
      ? schedule.selectionMode
      : "DATES",
    occurrenceDates: [...schedule.occurrenceDates].sort(),
    recurrenceWeekdays: parseYouthPersonalScheduleWeekdays(
      schedule.recurrenceWeekdays,
    ),
    recurrenceStartDate: schedule.recurrenceStartDate,
    recurrenceEndDate: schedule.recurrenceEndDate,
  };
}

function getFirstOccurrenceInCalendar(
  schedule: YouthPersonalSchedule,
  calendarDateSet: ReadonlySet<string>,
) {
  return (
    schedule.occurrenceDates.find((date) => calendarDateSet.has(date)) ??
    schedule.occurrenceDates[0] ??
    ""
  );
}
