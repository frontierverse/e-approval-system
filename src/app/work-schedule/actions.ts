"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  mapWorkSchedule,
  workScheduleSelect,
  type WorkSchedule,
} from "@/lib/work-schedules";
import {
  formatWorkScheduleDateLabel,
  getWorkScheduleMonthFromDate,
} from "@/lib/work-schedule-calendar";
import {
  getYouthLearningScheduleEndHourFromMinute,
  getYouthLearningScheduleStartHourFromMinute,
  getYouthLearningScheduleWeekday,
  isYouthLearningScheduleDate,
  isYouthLearningScheduleEndMinute,
  isYouthLearningScheduleStartMinute,
  type YouthActionResult,
} from "@/lib/youth-management-core";

const workSchedulePath = "/work-schedule";

export async function saveWorkScheduleAction(
  scheduleDate: string,
  startMinute: number,
  endMinute: number,
  content: string,
  sourceScheduleDate = scheduleDate,
  sourceStartMinute = startMinute,
): Promise<YouthActionResult<{ schedule: WorkSchedule | null }>> {
  const user = await requireUser();

  if (!isYouthLearningScheduleDate(scheduleDate)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleDate(sourceScheduleDate)) {
    return {
      ok: false,
      error: "기존 날짜를 다시 확인하세요.",
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
      error: "기존 시작 시간을 다시 확인하세요.",
    };
  }

  if (!isYouthLearningScheduleEndMinute(endMinute, startMinute)) {
    return {
      ok: false,
      error: "종료 시간을 다시 선택하세요.",
    };
  }

  const normalizedContent = content.trim();
  const existingSchedule = await findWorkSchedule(
    sourceScheduleDate,
    sourceStartMinute,
  );

  if (!normalizedContent) {
    if (existingSchedule) {
      await deleteExistingWorkSchedule({
        schedule: existingSchedule,
        userId: user.id,
      });
    }

    revalidateWorkSchedulePaths(scheduleDate, sourceScheduleDate);

    return {
      ok: true,
      data: {
        schedule: null,
      },
    };
  }

  const conflictingSchedule = await findConflictingWorkSchedule({
    endMinute,
    scheduleDate,
    sourceScheduleDate,
    sourceStartMinute,
    startMinute,
  });

  if (conflictingSchedule) {
    return {
      ok: false,
      error: `${formatWorkScheduleDateLabel(scheduleDate)} ${formatScheduleRangeLabel(
        conflictingSchedule.startMinute,
        conflictingSchedule.endMinute,
      )} 일정과 시간이 겹칩니다.`,
    };
  }

  const startHour = getYouthLearningScheduleStartHourFromMinute(startMinute);
  const endHour = getYouthLearningScheduleEndHourFromMinute(endMinute);
  const weekday = getYouthLearningScheduleWeekday(scheduleDate);
  const auditRequestData = await getCurrentAuditLogRequestData();
  const savedSchedule = await prisma.$transaction(async (tx) => {
    if (existingSchedule) {
      const updatedSchedule = await tx.workSchedule.update({
        where: {
          scheduleDate_startMinute: {
            scheduleDate: sourceScheduleDate,
            startMinute: sourceStartMinute,
          },
        },
        data: {
          content: normalizedContent,
          endHour,
          endMinute,
          scheduleDate,
          startHour,
          startMinute,
          weekday,
        },
        select: workScheduleSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.UPDATE_WORK_SCHEDULE,
          targetType: "WorkSchedule",
          targetId: updatedSchedule.id,
          message: `업무 일정표 ${formatWorkScheduleSlotLabel(
            scheduleDate,
            startMinute,
            endMinute,
          )} 일정이 변경되었습니다.`,
          metadata: {
            changeType: "workSchedule.update",
            nextContent: normalizedContent,
            nextEndHour: endHour,
            nextEndMinute: endMinute,
            nextScheduleDate: scheduleDate,
            nextStartHour: startHour,
            nextStartMinute: startMinute,
            previousContent: existingSchedule.content,
            previousEndHour: existingSchedule.endHour,
            previousEndMinute: existingSchedule.endMinute,
            previousScheduleDate: existingSchedule.scheduleDate,
            previousStartHour: existingSchedule.startHour,
            previousStartMinute: existingSchedule.startMinute,
            scheduleDate,
            source: "work-schedule",
            sourceScheduleDate,
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

      return updatedSchedule;
    }

    const createdSchedule = await tx.workSchedule.create({
      data: {
        content: normalizedContent,
        endHour,
        endMinute,
        scheduleDate,
        startHour,
        startMinute,
        weekday,
      },
      select: workScheduleSelect,
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_WORK_SCHEDULE,
        targetType: "WorkSchedule",
        targetId: createdSchedule.id,
        message: `업무 일정표 ${formatWorkScheduleSlotLabel(
          scheduleDate,
          startMinute,
          endMinute,
        )} 일정이 입력되었습니다.`,
        metadata: {
          changeType: "workSchedule.create",
          nextContent: normalizedContent,
          nextEndHour: endHour,
          nextEndMinute: endMinute,
          nextScheduleDate: scheduleDate,
          nextStartHour: startHour,
          nextStartMinute: startMinute,
          previousContent: null,
          previousEndHour: null,
          previousEndMinute: null,
          previousScheduleDate: null,
          previousStartHour: null,
          previousStartMinute: null,
          scheduleDate,
          source: "work-schedule",
          sourceScheduleDate,
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

    return createdSchedule;
  });

  revalidateWorkSchedulePaths(scheduleDate, sourceScheduleDate);

  return {
    ok: true,
    data: {
      schedule: mapWorkSchedule(savedSchedule),
    },
  };
}

export async function deleteWorkScheduleAction(
  scheduleDate: string,
  startMinute: number,
): Promise<YouthActionResult<{ scheduleDate: string; startMinute: number }>> {
  const user = await requireUser();

  if (!isYouthLearningScheduleDate(scheduleDate)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleStartMinute(startMinute)) {
    return {
      ok: false,
      error: "시작 시간을 다시 선택하세요.",
    };
  }

  const schedule = await findWorkSchedule(scheduleDate, startMinute);

  if (schedule) {
    await deleteExistingWorkSchedule({ schedule, userId: user.id });
  }

  revalidateWorkSchedulePaths(scheduleDate);

  return {
    ok: true,
    data: {
      scheduleDate,
      startMinute,
    },
  };
}

async function deleteExistingWorkSchedule({
  schedule,
  userId,
}: {
  schedule: WorkSchedule;
  userId: string;
}) {
  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    await tx.workSchedule.delete({
      where: {
        scheduleDate_startMinute: {
          scheduleDate: schedule.scheduleDate,
          startMinute: schedule.startMinute,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        ...auditRequestData,
        action: AuditAction.UPDATE_WORK_SCHEDULE,
        targetType: "WorkSchedule",
        targetId: schedule.id,
        message: `업무 일정표 ${formatWorkScheduleSlotLabel(
          schedule.scheduleDate,
          schedule.startMinute,
          schedule.endMinute,
        )} 일정이 삭제되었습니다.`,
        metadata: {
          changeType: "workSchedule.delete",
          nextContent: null,
          previousContent: schedule.content,
          previousScheduleDate: schedule.scheduleDate,
          scheduleDate: schedule.scheduleDate,
          source: "work-schedule",
          weekday: schedule.weekday,
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

async function findWorkSchedule(scheduleDate: string, startMinute: number) {
  const schedule = await prisma.workSchedule.findUnique({
    where: {
      scheduleDate_startMinute: {
        scheduleDate,
        startMinute,
      },
    },
    select: workScheduleSelect,
  });

  return schedule ? mapWorkSchedule(schedule) : null;
}

async function findConflictingWorkSchedule({
  endMinute,
  scheduleDate,
  sourceScheduleDate,
  sourceStartMinute,
  startMinute,
}: {
  endMinute: number;
  scheduleDate: string;
  sourceScheduleDate: string;
  sourceStartMinute: number;
  startMinute: number;
}) {
  const candidates = await prisma.workSchedule.findMany({
    where: {
      scheduleDate,
    },
    orderBy: [{ startMinute: "asc" }],
    select: {
      id: true,
      scheduleDate: true,
      startMinute: true,
      endMinute: true,
    },
  });

  return (
    candidates.find((candidate) => {
      if (
        candidate.scheduleDate === sourceScheduleDate &&
        candidate.startMinute === sourceStartMinute
      ) {
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

function revalidateWorkSchedulePaths(
  scheduleDate: string,
  sourceScheduleDate = scheduleDate,
) {
  revalidatePath(workSchedulePath);
  revalidatePath(
    `${workSchedulePath}?month=${getWorkScheduleMonthFromDate(scheduleDate)}`,
  );

  if (sourceScheduleDate !== scheduleDate) {
    revalidatePath(
      `${workSchedulePath}?month=${getWorkScheduleMonthFromDate(
        sourceScheduleDate,
      )}`,
    );
  }
}

function areScheduleRangesOverlapping(
  firstStartMinute: number,
  firstEndMinute: number,
  secondStartMinute: number,
  secondEndMinute: number,
) {
  return firstStartMinute < secondEndMinute && secondStartMinute < firstEndMinute;
}

function formatWorkScheduleSlotLabel(
  scheduleDate: string,
  startMinute: number,
  endMinute: number,
) {
  return `${formatWorkScheduleDateLabel(scheduleDate)} ${formatScheduleRangeLabel(
    startMinute,
    endMinute,
  )}`;
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
