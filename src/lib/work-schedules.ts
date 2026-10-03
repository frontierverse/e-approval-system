import "server-only";

import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
import type { Prisma } from "@/generated/prisma/client";
import {
  getWorkScheduleMonthRange,
  getWorkScheduleMonthDates,
  getWorkScheduleWeekday,
  isWorkScheduleDate,
  normalizeWorkScheduleMonth,
  shiftWorkScheduleDate,
} from "@/lib/work-schedule-calendar";
import { createHospitalAppointmentWorkSchedules } from "@/lib/work-schedule-hospital-appointments";
import { prisma } from "@/lib/prisma";
import { getApprovedStaffVacationDateEntries } from "@/lib/staff-vacations";
import {
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
  sourceType?: "approvedVacation" | "hospitalAppointment" | "manual";
  timeLabel?: string;
  updatedAt?: string;
  staffName?: string;
  vacationLabel?: string;
  departmentName?: string;
  positionName?: string;
  youthName?: string;
  hospitalName?: string;
  escortName?: string;
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
  updatedAt: Date;
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

export type WorkScheduleReadClient = Pick<Prisma.TransactionClient, "workSchedule" | "approvalDocument" | "youthPersonalSchedule" | "auditLog">;

export async function getWorkSchedules(
  month?: string,
  db: WorkScheduleReadClient = prisma,
  today = getKoreanDateValue(),
): Promise<WorkSchedule[]> {
  const normalizedMonth = normalizeWorkScheduleMonth(month);
  const { endDate, startDate } = getWorkScheduleMonthRange(normalizedMonth);
  const appointmentDates = getWorkScheduleMonthDates(
    normalizedMonth,
  );
  const [schedules, vacationEntries, hospitalAppointmentRecords] =
    await Promise.all([
      db.workSchedule.findMany({
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
      }, db),
      db.youthPersonalSchedule.findMany({
        where: {
          occurrenceDates: {
            hasSome: appointmentDates,
          },
          scheduleType: "HOSPITAL",
          youth: {
            is: {
              AND: youthOperationalWhere(today),
              OR: [
                { dischargeDate: null },
                { dischargeDate: "" },
                { dischargeDate: { gte: startDate } },
              ],
            },
          },
        },
        orderBy: [{ startMinute: "asc" }, { endMinute: "asc" }, { id: "asc" }],
        select: workScheduleHospitalAppointmentSelect,
      }),
    ]);

  return [
    ...schedules.map(mapWorkSchedule),
    ...vacationEntries.map((entry, index) => ({
      id: `approved-vacation:${entry.id}`,
      scheduleDate: entry.date,
      weekday: getWorkScheduleWeekday(entry.date),
      startHour: 0,
      startMinute: -1000 + index,
      endHour: 0,
      endMinute: -999 + index,
      content: `${entry.staffName} ${entry.vacationLabel}`,
      detailLabel: entry.detailLabel,
      readOnly: true,
      sourceType: "approvedVacation" as const,
      timeLabel: entry.vacationLabel,
      staffName: entry.staffName, vacationLabel: entry.vacationLabel,
      departmentName: entry.departmentName, positionName: entry.positionName,
    })),
    ...createHospitalAppointmentWorkSchedules(
      hospitalAppointmentRecords,
      appointmentDates,
    ).map((schedule) => {
      const record = hospitalAppointmentRecords.find(row => `hospital-appointment:${row.id}` === schedule.id)!;
      const label = (value: string | null) => (value ?? "").trim().replace(/\s+/gu, " ");
      return { ...schedule, youthName: label(record.youth.name), hospitalName: label(record.hospitalName), escortName: label(record.escortName) };
    }),
  ].sort(sortWorkSchedules);
}

export const workScheduleHospitalAppointmentSelect = {
  endMinute: true,
  escortName: true,
  hospitalName: true,
  id: true,
  occurrenceDates: true,
  startMinute: true,
  youth: {
    select: {
      dischargeDate: true,
      name: true,
    },
  },
} as const satisfies Prisma.YouthPersonalScheduleSelect;

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
} = {}, db: Pick<Prisma.TransactionClient, "auditLog"> = prisma): Promise<WorkScheduleChangeLogsResult> {
  const normalizedActorId = actorId.trim() || "all";
  const normalizedPageSize = Math.max(1, pageSize);
  const normalizedScheduleDate = normalizeWorkScheduleDateFilter(scheduleDate);
  const where = createWorkScheduleChangeLogWhere({
    actorId: normalizedActorId,
    scheduleDate: normalizedScheduleDate,
  });
  const total = await db.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = clampPage(page, totalPages);
  const logs = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

export async function getWorkScheduleChangeLogActors(db: Pick<Prisma.TransactionClient, "auditLog"> = prisma): Promise<
  WorkScheduleChangeLogActor[]
> {
  const rows = await db.auditLog.findMany({
    distinct: ["actorId"],
    where: createWorkScheduleChangeLogWhere(),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
  updatedAt: true,
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
    updatedAt: schedule.updatedAt.toISOString(),
    sourceType: "manual",
    weekday: getWorkScheduleWeekday(schedule.scheduleDate),
  };
}

function sortWorkSchedules(first: WorkSchedule, second: WorkSchedule) {
  return (
    first.scheduleDate.localeCompare(second.scheduleDate) ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute ||
    first.id.localeCompare(second.id)
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
  return value && isWorkScheduleDate(value) ? value : "";
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}
