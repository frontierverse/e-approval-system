"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapYouthCommonSchedule } from "@/lib/youth-common-schedules";
import {
  getYouthLearningScheduleEndHourFromMinute,
  getYouthLearningScheduleStartHourFromMinute,
  isYouthLearningScheduleEndMinute,
  isYouthLearningScheduleStartMinute,
  isYouthLearningScheduleWeekday,
  youthCommonScheduleWeekdays,
  type YouthActionResult,
  type YouthCommonSchedule,
  type YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";

const commonSchedulePath = "/youth/common-schedule";

export async function saveYouthCommonScheduleAction(
  weekday: number,
  startMinute: number,
  endMinute: number,
  content: string,
  sourceStartMinute = startMinute,
): Promise<YouthActionResult<{ schedule: YouthCommonSchedule | null }>> {
  const user = await requireUser();

  if (!isYouthLearningScheduleWeekday(weekday)) {
    return {
      ok: false,
      error: "요일을 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleStartMinute(startMinute)) {
    return {
      ok: false,
      error: "시작 시간을 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleStartMinute(sourceStartMinute)) {
    return {
      ok: false,
      error: "기존 시작 시간을 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleEndMinute(endMinute, startMinute)) {
    return {
      ok: false,
      error: "종료 시간을 다시 선택하세요.",
    };
  }

  const normalizedContent = content.trim();

  if (!normalizedContent) {
    const existingSchedule = await findCommonSchedule(weekday, sourceStartMinute);

    if (existingSchedule) {
      const auditRequestData = await getCurrentAuditLogRequestData();

      await prisma.$transaction(async (tx) => {
        await tx.youthCommonSchedule.delete({
          where: {
            weekday_startMinute: {
              weekday,
              startMinute: sourceStartMinute,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            ...auditRequestData,
            action: AuditAction.UPDATE_YOUTH,
            targetType: "YouthCommonSchedule",
            targetId: existingSchedule.id,
            message: `공통 일정표 ${formatCommonScheduleSlotLabel(
              weekday,
              existingSchedule.startMinute,
              existingSchedule.endMinute,
            )} 일정을 삭제했습니다.`,
            metadata: {
              changeType: "commonSchedule.delete",
              nextContent: null,
              previousContent: existingSchedule.content,
              source: "common-schedule",
              weekday,
              startHour: existingSchedule.startHour,
              startMinute: existingSchedule.startMinute,
              endHour: existingSchedule.endHour,
              endMinute: existingSchedule.endMinute,
              timeLabel: formatScheduleRangeLabel(
                existingSchedule.startMinute,
                existingSchedule.endMinute,
              ),
            },
          },
        });
      });
    }

    revalidatePath(commonSchedulePath);

    return {
      ok: true,
      data: {
        schedule: null,
      },
    };
  }

  const conflictingSchedule = await findConflictingCommonSchedule({
    weekday,
    startMinute,
    endMinute,
    sourceStartMinute,
  });

  if (conflictingSchedule) {
    return {
      ok: false,
      error: `${formatScheduleRangeLabel(
        conflictingSchedule.startMinute,
        conflictingSchedule.endMinute,
      )} 일정과 시간이 겹칩니다.`,
    };
  }

  const startHour = getYouthLearningScheduleStartHourFromMinute(startMinute);
  const endHour = getYouthLearningScheduleEndHourFromMinute(endMinute);
  const auditRequestData = await getCurrentAuditLogRequestData();

  const schedule = await prisma.$transaction(async (tx) => {
    const existingSchedule = await tx.youthCommonSchedule.findUnique({
      where: {
        weekday_startMinute: {
          weekday,
          startMinute: sourceStartMinute,
        },
      },
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

    if (
      existingSchedule?.content === normalizedContent &&
      existingSchedule.startMinute === startMinute &&
      existingSchedule.endMinute === endMinute
    ) {
      return mapYouthCommonSchedule(existingSchedule);
    }

    const savedSchedule = await tx.youthCommonSchedule.upsert({
      where: {
        weekday_startMinute: {
          weekday,
          startMinute: sourceStartMinute,
        },
      },
      update: {
        content: normalizedContent,
        endHour,
        endMinute,
        startHour,
        startMinute,
      },
      create: {
        content: normalizedContent,
        endHour,
        endMinute,
        startHour,
        startMinute,
        weekday,
      },
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

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "YouthCommonSchedule",
        targetId: savedSchedule.id,
        message: `공통 일정표 ${formatCommonScheduleSlotLabel(
          weekday,
          startMinute,
          endMinute,
        )} 일정을 ${existingSchedule ? "변경" : "입력"}했습니다.`,
        metadata: {
          changeType: existingSchedule
            ? "commonSchedule.update"
            : "commonSchedule.create",
          nextContent: normalizedContent,
          nextStartHour: startHour,
          nextStartMinute: startMinute,
          nextEndHour: endHour,
          nextEndMinute: endMinute,
          previousContent: existingSchedule?.content ?? null,
          previousStartHour: existingSchedule?.startHour ?? null,
          previousStartMinute: existingSchedule?.startMinute ?? null,
          previousEndHour: existingSchedule?.endHour ?? null,
          previousEndMinute: existingSchedule?.endMinute ?? null,
          source: "common-schedule",
          sourceStartMinute,
          weekday,
          endHour,
          endMinute,
          startHour,
          startMinute,
          timeLabel: formatScheduleRangeLabel(startMinute, endMinute),
        },
      },
    });

    return mapYouthCommonSchedule(savedSchedule);
  });

  revalidatePath(commonSchedulePath);

  return {
    ok: true,
    data: {
      schedule,
    },
  };
}

export async function deleteYouthCommonScheduleAction(
  weekday: number,
  startMinute: number,
): Promise<
  YouthActionResult<{ weekday: YouthLearningScheduleWeekday; startMinute: number }>
> {
  const user = await requireUser();

  if (!isYouthLearningScheduleWeekday(weekday)) {
    return {
      ok: false,
      error: "요일을 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleStartMinute(startMinute)) {
    return {
      ok: false,
      error: "시작 시간을 다시 선택하세요.",
    };
  }

  const schedule = await findCommonSchedule(weekday, startMinute);

  if (schedule) {
    const auditRequestData = await getCurrentAuditLogRequestData();

    await prisma.$transaction(async (tx) => {
      await tx.youthCommonSchedule.delete({
        where: {
          weekday_startMinute: {
            weekday,
            startMinute,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.UPDATE_YOUTH,
          targetType: "YouthCommonSchedule",
          targetId: schedule.id,
          message: `공통 일정표 ${formatCommonScheduleSlotLabel(
            weekday,
            schedule.startMinute,
            schedule.endMinute,
          )} 일정을 삭제했습니다.`,
          metadata: {
            changeType: "commonSchedule.delete",
            nextContent: null,
            previousContent: schedule.content,
            source: "common-schedule",
            weekday,
            startHour: schedule.startHour,
            startMinute: schedule.startMinute,
            endHour: schedule.endHour,
            endMinute: schedule.endMinute,
            timeLabel: formatScheduleRangeLabel(
              schedule.startMinute,
              schedule.endMinute,
            ),
          },
        },
      });
    });
  }

  revalidatePath(commonSchedulePath);

  return {
    ok: true,
    data: {
      weekday,
      startMinute,
    },
  };
}

async function findCommonSchedule(
  weekday: YouthLearningScheduleWeekday,
  startMinute: number,
) {
  return prisma.youthCommonSchedule.findUnique({
    where: {
      weekday_startMinute: {
        weekday,
        startMinute,
      },
    },
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
}

async function findConflictingCommonSchedule({
  weekday,
  startMinute,
  endMinute,
  sourceStartMinute,
}: {
  weekday: YouthLearningScheduleWeekday;
  startMinute: number;
  endMinute: number;
  sourceStartMinute: number;
}) {
  const candidates = await prisma.youthCommonSchedule.findMany({
    where: {
      weekday,
    },
    orderBy: {
      startMinute: "asc",
    },
    select: {
      id: true,
      startMinute: true,
      endMinute: true,
    },
  });

  return (
    candidates.find((candidate) => {
      if (candidate.startMinute === sourceStartMinute) {
        return false;
      }

      return areScheduleRangesOverlapping(
        startMinute,
        endMinute,
        candidate.startMinute,
        candidate.endMinute,
      );
    }) ?? null
  );
}

function areScheduleRangesOverlapping(
  firstStartMinute: number,
  firstEndMinute: number,
  secondStartMinute: number,
  secondEndMinute: number,
) {
  return firstStartMinute < secondEndMinute && secondStartMinute < firstEndMinute;
}

function formatCommonScheduleSlotLabel(
  weekday: YouthLearningScheduleWeekday,
  startMinute: number,
  endMinute: number,
) {
  return `${formatWeekdayLabel(weekday)} ${formatScheduleRangeLabel(
    startMinute,
    endMinute,
  )}`;
}

function formatWeekdayLabel(weekday: YouthLearningScheduleWeekday) {
  return (
    youthCommonScheduleWeekdays.find((item) => item.value === weekday)?.label ??
    `${weekday}`
  );
}

function formatScheduleRangeLabel(startMinute: number, endMinute: number) {
  return `${formatMinuteLabel(startMinute)} - ${formatMinuteLabel(endMinute)}`;
}

function formatMinuteLabel(minute: number) {
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;

  return minutePart === 0
    ? formatHourLabel(hour)
    : `${formatHourLabel(hour)} ${minutePart}분`;
}

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour <= 12 ? hour : hour - 12;

  return `${period} ${displayHour}시`;
}
