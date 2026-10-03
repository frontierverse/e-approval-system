import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkLogToday, isWorkLogDate } from "@/lib/work-log-core";
import {
  sortWorkLogLinkedSchedules,
  type WorkLogLinkedSchedule,
  type WorkLogLinkedScheduleLoadState,
} from "@/lib/work-log-linked-schedule-core";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
import { getSafeErrorDigest, logServerEvent } from "@/lib/observability";

export const workLogLinkedScheduleSelect = {
  content: true,
  endMinute: true,
  id: true,
  startMinute: true,
  youth: {
    select: {
      name: true,
    },
  },
  youthId: true,
} as const satisfies Prisma.YouthPersonalScheduleSelect;

export type WorkLogLinkedScheduleRecord = Prisma.YouthPersonalScheduleGetPayload<{
  select: typeof workLogLinkedScheduleSelect;
}>;

/**
 * Youth personal schedules (개인 일정표) that occur on the given work date.
 * They are shown alongside the staff work log so the same activities do not
 * have to be typed twice; the data stays owned by the personal schedule page.
 */
type ScheduleDb = Pick<Prisma.TransactionClient, "youthPersonalSchedule"> & Partial<Pick<Prisma.TransactionClient, "$executeRawUnsafe">>;

export async function getWorkLogLinkedSchedules(
  workDate: string,
  db: ScheduleDb = prisma,
  today = getWorkLogToday(),
): Promise<WorkLogLinkedSchedule[]> {
  if (!isWorkLogDate(workDate)) {
    return [];
  }

  const records = await db.youthPersonalSchedule.findMany({
    where: {
      occurrenceDates: {
        has: workDate,
      },
      youth: {
        is: {
          AND: [
            youthOperationalWhere(today),
            { OR: [
              { dischargeDate: null },
              { dischargeDate: "" },
              { dischargeDate: { gte: workDate } },
            ] },
          ],
        },
      },
    },
    orderBy: [{ startMinute: "asc" }, { endMinute: "asc" }, { id: "asc" }],
    select: workLogLinkedScheduleSelect,
  });

  return sortWorkLogLinkedSchedules(records.map(mapWorkLogLinkedSchedule));
}

export async function getWorkLogLinkedScheduleLoadState(
  workDate: string,
  db: ScheduleDb = prisma,
  today = getWorkLogToday(),
): Promise<WorkLogLinkedScheduleLoadState> {
  // Call after other snapshot reads: a failed optional SQL query must not poison
  // the transaction or roll back a valid manual write/mandatory projection.
  const savepoint = db !== prisma && Boolean(db.$executeRawUnsafe);
  try {
    if (savepoint) await db.$executeRawUnsafe!("SAVEPOINT work_log_optional_schedules");
    const schedules = await getWorkLogLinkedSchedules(workDate, db, today);
    if (savepoint) await db.$executeRawUnsafe!("RELEASE SAVEPOINT work_log_optional_schedules");
    return { schedules, status: "ready" };
  } catch (error) {
    if (savepoint) {
      await db.$executeRawUnsafe!("ROLLBACK TO SAVEPOINT work_log_optional_schedules");
      await db.$executeRawUnsafe!("RELEASE SAVEPOINT work_log_optional_schedules");
    }
    logServerEvent("error", "work_log.linked_schedules_load_failed", {
      errorDigest: getSafeErrorDigest(error),
      workDate: isWorkLogDate(workDate) ? workDate : null,
    });

    return { status: "error" };
  }
}

export function mapWorkLogLinkedSchedule(
  record: WorkLogLinkedScheduleRecord,
): WorkLogLinkedSchedule {
  return {
    content: record.content,
    endMinute: record.endMinute,
    id: record.id,
    startMinute: record.startMinute,
    youthId: record.youthId,
    youthName: record.youth.name,
  };
}
