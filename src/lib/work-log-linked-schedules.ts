import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isWorkLogDate } from "@/lib/work-log-core";
import {
  sortWorkLogLinkedSchedules,
  type WorkLogLinkedSchedule,
  type WorkLogLinkedScheduleLoadState,
} from "@/lib/work-log-linked-schedule-core";
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
export async function getWorkLogLinkedSchedules(
  workDate: string,
): Promise<WorkLogLinkedSchedule[]> {
  if (!isWorkLogDate(workDate)) {
    return [];
  }

  const records = await prisma.youthPersonalSchedule.findMany({
    where: {
      occurrenceDates: {
        has: workDate,
      },
      youth: {
        is: {
          OR: [
            { dischargeDate: null },
            { dischargeDate: "" },
            { dischargeDate: { gte: workDate } },
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
): Promise<WorkLogLinkedScheduleLoadState> {
  try {
    return {
      schedules: await getWorkLogLinkedSchedules(workDate),
      status: "ready",
    };
  } catch (error) {
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
