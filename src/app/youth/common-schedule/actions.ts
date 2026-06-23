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
  normalizeYouthLearningScheduleWeekdays,
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
  recurrenceWeekdaysOrSourceStartMinute: number[] | number = [weekday],
  maybeSourceStartMinute?: number,
): Promise<
  YouthActionResult<{
    schedules: YouthCommonSchedule[];
    sourceStartMinute: number;
    targetWeekdays: YouthLearningScheduleWeekday[];
  }>
> {
  const user = await requireUser();
  const sourceStartMinute = Array.isArray(recurrenceWeekdaysOrSourceStartMinute)
    ? (maybeSourceStartMinute ?? startMinute)
    : recurrenceWeekdaysOrSourceStartMinute;

  if (!isYouthLearningScheduleWeekday(weekday)) {
    return {
      ok: false,
      error: "요일을 다시 선택하세요.",
    };
  }

  const targetWeekdays = normalizeYouthLearningScheduleWeekdays([
    weekday,
    ...(Array.isArray(recurrenceWeekdaysOrSourceStartMinute)
      ? recurrenceWeekdaysOrSourceStartMinute
      : []),
  ]);

  if (targetWeekdays.length === 0) {
    return {
      ok: false,
      error: "반복 요일을 하나 이상 선택하세요.",
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
    const existingSchedules = await findCommonSchedules(
      targetWeekdays,
      sourceStartMinute,
    );

    if (existingSchedules.length > 0) {
      const auditRequestData = await getCurrentAuditLogRequestData();

      await prisma.$transaction(async (tx) => {
        await tx.youthCommonSchedule.deleteMany({
          where: {
            startMinute: sourceStartMinute,
            weekday: {
              in: targetWeekdays,
            },
          },
        });

        for (const existingSchedule of existingSchedules) {
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              ...auditRequestData,
              action: AuditAction.UPDATE_YOUTH,
              targetType: "YouthCommonSchedule",
              targetId: existingSchedule.id,
              message: `공통 일정표 ${formatCommonScheduleSlotLabel(
                existingSchedule.weekday,
                existingSchedule.startMinute,
                existingSchedule.endMinute,
              )} 일정을 삭제했습니다.`,
              metadata: {
                changeType: "commonSchedule.delete",
                nextContent: null,
                previousContent: existingSchedule.content,
                source: "common-schedule",
                sourceStartMinute,
                targetWeekdays,
                weekday: existingSchedule.weekday,
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
        }
      });
    }

    revalidatePath(commonSchedulePath);

    return {
      ok: true,
      data: {
        schedules: [],
        sourceStartMinute,
        targetWeekdays,
      },
    };
  }

  const conflictingSchedule = await findConflictingCommonSchedule({
    startMinute,
    endMinute,
    sourceStartMinute,
    weekdays: targetWeekdays,
  });

  if (conflictingSchedule) {
    return {
      ok: false,
      error: `${formatWeekdayLabel(
        conflictingSchedule.weekday,
      )} ${formatScheduleRangeLabel(
        conflictingSchedule.startMinute,
        conflictingSchedule.endMinute,
      )} 일정과 시간이 겹칩니다.`,
    };
  }

  const startHour = getYouthLearningScheduleStartHourFromMinute(startMinute);
  const endHour = getYouthLearningScheduleEndHourFromMinute(endMinute);
  const auditRequestData = await getCurrentAuditLogRequestData();

  const schedules = await prisma.$transaction(async (tx) => {
    const existingSchedules = await tx.youthCommonSchedule.findMany({
      where: {
        startMinute: sourceStartMinute,
        weekday: {
          in: targetWeekdays,
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
    const existingScheduleByWeekday = new Map(
      existingSchedules.map((schedule) => [schedule.weekday, schedule]),
    );
    const savedSchedules: YouthCommonSchedule[] = [];

    for (const targetWeekday of targetWeekdays) {
      const existingSchedule = existingScheduleByWeekday.get(targetWeekday);

      if (
        existingSchedule?.content === normalizedContent &&
        existingSchedule.startMinute === startMinute &&
        existingSchedule.endMinute === endMinute
      ) {
        savedSchedules.push(mapYouthCommonSchedule(existingSchedule));
        continue;
      }

      const savedSchedule = await tx.youthCommonSchedule.upsert({
        where: {
          weekday_startMinute: {
            weekday: targetWeekday,
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
          weekday: targetWeekday,
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
            targetWeekday,
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
            targetWeekdays,
            weekday: targetWeekday,
            endHour,
            endMinute,
            startHour,
            startMinute,
            timeLabel: formatScheduleRangeLabel(startMinute, endMinute),
          },
        },
      });

      savedSchedules.push(mapYouthCommonSchedule(savedSchedule));
    }

    return savedSchedules;
  });

  revalidatePath(commonSchedulePath);

  return {
    ok: true,
    data: {
      schedules,
      sourceStartMinute,
      targetWeekdays,
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

async function findCommonSchedules(
  weekdays: YouthLearningScheduleWeekday[],
  startMinute: number,
) {
  return prisma.youthCommonSchedule.findMany({
    where: {
      startMinute,
      weekday: {
        in: weekdays,
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
  startMinute,
  endMinute,
  sourceStartMinute,
  weekdays,
}: {
  startMinute: number;
  endMinute: number;
  sourceStartMinute: number;
  weekdays: YouthLearningScheduleWeekday[];
}) {
  const candidates = await prisma.youthCommonSchedule.findMany({
    where: {
      weekday: {
        in: weekdays,
      },
    },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    select: {
      id: true,
      weekday: true,
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
  weekday: number,
  startMinute: number,
  endMinute: number,
) {
  return `${formatWeekdayLabel(weekday)} ${formatScheduleRangeLabel(
    startMinute,
    endMinute,
  )}`;
}

function formatWeekdayLabel(weekday: number) {
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
