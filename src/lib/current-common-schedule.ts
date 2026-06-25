import "server-only";

import {
  createCurrentCommonScheduleAlert,
  getKoreanCurrentCommonScheduleClock,
  type CurrentCommonScheduleAlert,
  type CurrentCommonScheduleSource,
} from "@/lib/current-common-schedule-core";
import { prisma } from "@/lib/prisma";
import { youthCommonScheduleWeekdays } from "@/lib/youth-management-core";

export type CurrentCommonScheduleTopbarData = {
  alert: CurrentCommonScheduleAlert | null;
  schedules: CurrentCommonScheduleSource[];
};

export async function getCurrentCommonScheduleTopbarData(
  date = new Date(),
): Promise<CurrentCommonScheduleTopbarData> {
  const clock = getKoreanCurrentCommonScheduleClock(date);
  const schedules = await prisma.youthCommonSchedule.findMany({
    where: {
      weekday: {
        in: youthCommonScheduleWeekdays.map((weekday) => weekday.value),
      },
    },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }, { endMinute: "asc" }],
    select: {
      content: true,
      endMinute: true,
      id: true,
      startMinute: true,
      weekday: true,
    },
  });

  return {
    alert: createCurrentCommonScheduleAlert(schedules, clock),
    schedules,
  };
}
