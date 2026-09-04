import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getYouthPersonalScheduleCalendarDates,
  isYouthPersonalScheduleMonth,
  isYouthPersonalScheduleSelectionMode,
  parseYouthPersonalScheduleWeekdays,
  type YouthPersonalScheduleEscortType,
  type YouthPersonalScheduleSelectionMode,
  type YouthPersonalScheduleType,
  type YouthPersonalScheduleWeekday,
} from "@/lib/youth-personal-schedule-core";

export type YouthPersonalSchedule = {
  id: string;
  youthId: string;
  content: string;
  scheduleType: YouthPersonalScheduleType;
  hospitalName: string | null;
  escortType: YouthPersonalScheduleEscortType | null;
  escortUserId: string | null;
  escortName: string | null;
  nextAppointmentDate: string | null;
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
  scheduleType: true,
  hospitalName: true,
  escortType: true,
  escortUserId: true,
  escortName: true,
  nextAppointmentDate: true,
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

export type YouthPersonalScheduleStaffDirectoryItem = {
  id: string;
  name: string;
  departmentName: string;
  positionName: string;
  hireDate: string | null;
  resignationDate: string | null;
};

export async function getYouthPersonalScheduleStaffDirectory(): Promise<
  YouthPersonalScheduleStaffDirectoryItem[]
> {
  const staff = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      hireDate: true,
      resignationDate: true,
      department: {
        select: {
          name: true,
        },
      },
      position: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      {
        department: {
          sortOrder: "asc",
        },
      },
      {
        position: {
          level: "desc",
        },
      },
      { name: "asc" },
      { id: "asc" },
    ],
  });

  return staff.map((member) => ({
    id: member.id,
    name: member.name,
    departmentName: member.department.name,
    positionName: member.position.name,
    hireDate: member.hireDate,
    resignationDate: member.resignationDate,
  }));
}

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
    scheduleType:
      schedule.scheduleType === "HOSPITAL" ? "HOSPITAL" : "GENERAL",
    hospitalName: schedule.hospitalName,
    escortType:
      schedule.escortType === "STAFF" || schedule.escortType === "OTHER"
        ? schedule.escortType
        : null,
    escortUserId: schedule.escortUserId,
    escortName: schedule.escortName,
    nextAppointmentDate: schedule.nextAppointmentDate,
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
