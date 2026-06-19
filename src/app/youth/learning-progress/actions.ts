"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getYouthLearningScheduleEndHourFromMinute,
  getYouthLearningScheduleStartHourFromMinute,
  isYouthLearningScheduleDate,
  isYouthLearningScheduleEndMinute,
  isYouthLearningScheduleStartMinute,
  type YouthActionResult,
  type YouthLearningSchedule,
  type YouthProfile,
} from "@/lib/youth-management-core";

const learningProgressPath = "/youth/learning-progress";

export async function createLearningProgressYouthAction(
  name: string,
): Promise<YouthActionResult<{ youth: YouthProfile }>> {
  const user = await requireUser();
  const normalizedName = name.trim();

  if (!normalizedName) {
    return {
      ok: false,
      error: "학생 이름을 입력하세요.",
    };
  }

  const existing = await prisma.youth.findUnique({
    where: {
      name: normalizedName,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return {
      ok: false,
      error: "이미 등록된 학생 이름입니다.",
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  const youth = await prisma.$transaction(async (tx) => {
    const createdYouth = await tx.youth.create({
      data: {
        name: normalizedName,
      },
      select: {
        id: true,
        name: true,
        admissionDate: true,
        dischargeDate: true,
        age: true,
        phone: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.CREATE_YOUTH,
        targetType: "Youth",
        targetId: createdYouth.id,
        message: `${createdYouth.name} 학생을 등록했습니다.`,
        metadata: {
          changeType: "student.create",
          nextName: createdYouth.name,
          source: "learning-progress",
        },
      },
    });

    return createdYouth;
  });

  revalidatePath("/youth");
  revalidatePath(learningProgressPath);

  return {
    ok: true,
    data: {
      youth: {
        ...youth,
        familyContacts: [],
        notes: [],
      },
    },
  };
}

export async function deleteLearningProgressYouthAction(
  youthId: string,
): Promise<YouthActionResult<{ youthId: string }>> {
  const user = await requireUser();

  const existing = await prisma.youth.findUnique({
    where: {
      id: youthId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "삭제할 학생을 찾을 수 없습니다.",
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "Youth",
        targetId: existing.id,
        message: `${existing.name} 학생을 삭제했습니다.`,
        metadata: {
          changeType: "student.delete",
          previousName: existing.name,
          source: "learning-progress",
        },
      },
    });

    await tx.youth.delete({
      where: {
        id: existing.id,
      },
    });
  });

  revalidatePath("/youth");
  revalidatePath(learningProgressPath);

  return {
    ok: true,
    data: {
      youthId: existing.id,
    },
  };
}

export async function saveYouthLearningScheduleAction(
  youthId: string,
  scheduleDate: string,
  startMinute: number,
  endMinute: number,
  content: string,
  repeatsWeekly: boolean,
  sourceStartMinute = startMinute,
): Promise<YouthActionResult<{ schedule: YouthLearningSchedule | null }>> {
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
      error: "시간을 다시 선택하세요.",
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
  const startHour = getYouthLearningScheduleStartHourFromMinute(startMinute);
  const endHour = getYouthLearningScheduleEndHourFromMinute(endMinute);

  const youth = await prisma.youth.findUnique({
    where: {
      id: youthId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!youth) {
    return {
      ok: false,
      error: "학생을 찾을 수 없습니다.",
    };
  }

  if (!normalizedContent) {
    const existingSchedule = await findScheduleForSelectedDate(
      youthId,
      scheduleDate,
      sourceStartMinute,
    );

    if (existingSchedule) {
      const auditRequestData = await getCurrentAuditLogRequestData();

      await prisma.$transaction(async (tx) => {
        await tx.youthLearningSchedule.delete({
          where: {
            id: existingSchedule.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            ...auditRequestData,
            action: AuditAction.UPDATE_YOUTH,
            targetType: "YouthLearningSchedule",
            targetId: existingSchedule.id,
            message: `${youth.name} ${formatLearningScheduleSlotLabel(
              existingSchedule.startMinute,
              existingSchedule.endMinute,
            )} 스케줄을 삭제했습니다.`,
            metadata: {
              changeType: "schedule.delete",
              nextContent: null,
              previousContent: existingSchedule.content,
              previousStartHour: existingSchedule.startHour,
              previousStartMinute: existingSchedule.startMinute,
              previousEndMinute: existingSchedule.endMinute,
              previousRepeatsWeekly: existingSchedule.repeatsWeekly,
              scheduleDate,
              sourceScheduleDate: existingSchedule.scheduleDate,
              source: "learning-progress",
              endHour: existingSchedule.endHour,
              endMinute: existingSchedule.endMinute,
              startHour: existingSchedule.startHour,
              startMinute: existingSchedule.startMinute,
              timeLabel: formatLearningScheduleSlotLabel(
                existingSchedule.startMinute,
                existingSchedule.endMinute,
              ),
              youthId,
              youthName: youth.name,
            },
          },
        });
      });
    }

    revalidatePath(learningProgressPath);

    return {
      ok: true,
      data: {
        schedule: null,
      },
    };
  }

  const conflictingSchedule = await findConflictingSchedule({
    youthId,
    scheduleDate,
    startMinute,
    endMinute,
    sourceStartMinute,
  });

  if (conflictingSchedule) {
    return {
      ok: false,
      error: `${formatLearningScheduleSlotLabel(
        conflictingSchedule.startMinute,
        conflictingSchedule.endMinute,
      )} 스케줄과 시간이 겹칩니다.`,
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();
  const schedule = await prisma.$transaction(async (tx) => {
    const existingSchedule = await tx.youthLearningSchedule.findUnique({
      where: {
        youthId_scheduleDate_startMinute: {
          youthId,
          scheduleDate,
          startMinute: sourceStartMinute,
        },
      },
      select: {
        id: true,
        content: true,
        startHour: true,
        startMinute: true,
        endHour: true,
        endMinute: true,
        repeatsWeekly: true,
      },
    });

    if (
      existingSchedule?.content === normalizedContent &&
      existingSchedule.startMinute === startMinute &&
      existingSchedule.endMinute === endMinute &&
      existingSchedule.repeatsWeekly === repeatsWeekly
    ) {
      return {
        id: existingSchedule.id,
        youthId,
        scheduleDate,
        startHour: existingSchedule.startHour,
        startMinute: existingSchedule.startMinute,
        endHour: existingSchedule.endHour,
        endMinute: existingSchedule.endMinute,
        content: normalizedContent,
        repeatsWeekly,
        recurrenceSourceDate: null,
      };
    }

    const savedSchedule = await tx.youthLearningSchedule.upsert({
      where: {
        youthId_scheduleDate_startMinute: {
          youthId,
          scheduleDate,
          startMinute: sourceStartMinute,
        },
      },
      update: {
        content: normalizedContent,
        startHour,
        startMinute,
        endHour,
        endMinute,
        repeatsWeekly,
      },
      create: {
        youthId,
        scheduleDate,
        startHour,
        startMinute,
        endHour,
        endMinute,
        content: normalizedContent,
        repeatsWeekly,
      },
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

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "YouthLearningSchedule",
        targetId: savedSchedule.id,
        message: `${youth.name} ${formatLearningScheduleSlotLabel(
          startMinute,
          endMinute,
        )} 스케줄을 ${existingSchedule ? "변경" : "입력"}했습니다.`,
        metadata: {
          changeType: existingSchedule ? "schedule.update" : "schedule.create",
          nextContent: normalizedContent,
          nextStartHour: startHour,
          nextStartMinute: startMinute,
          nextEndHour: endHour,
          nextEndMinute: endMinute,
          nextRepeatsWeekly: repeatsWeekly,
          previousContent: existingSchedule?.content ?? null,
          previousStartHour: existingSchedule?.startHour ?? null,
          previousStartMinute: existingSchedule?.startMinute ?? null,
          previousEndHour: existingSchedule?.endHour ?? null,
          previousEndMinute: existingSchedule?.endMinute ?? null,
          previousRepeatsWeekly: existingSchedule?.repeatsWeekly ?? null,
          scheduleDate,
          source: "learning-progress",
          endHour,
          endMinute,
          startHour,
          startMinute,
          sourceStartMinute,
          timeLabel: formatLearningScheduleSlotLabel(startMinute, endMinute),
          youthId,
          youthName: youth.name,
        },
      },
    });

    return savedSchedule;
  });

  revalidatePath(learningProgressPath);

  return {
    ok: true,
    data: {
      schedule: {
        ...schedule,
        recurrenceSourceDate: null,
      },
    },
  };
}

export async function deleteYouthLearningScheduleAction(
  youthId: string,
  scheduleDate: string,
  startMinute: number,
): Promise<
  YouthActionResult<{ youthId: string; scheduleDate: string; startMinute: number }>
> {
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
      error: "시간을 다시 선택하세요.",
    };
  }

  const schedule = await findScheduleForSelectedDate(
    youthId,
    scheduleDate,
    startMinute,
  );

  if (schedule) {
    const auditRequestData = await getCurrentAuditLogRequestData();

    await prisma.$transaction(async (tx) => {
      await tx.youthLearningSchedule.delete({
        where: {
          id: schedule.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.UPDATE_YOUTH,
          targetType: "YouthLearningSchedule",
          targetId: schedule.id,
          message: `${schedule.youth.name} ${formatLearningScheduleSlotLabel(
            schedule.startMinute,
            schedule.endMinute,
          )} 스케줄을 삭제했습니다.`,
          metadata: {
            changeType: "schedule.delete",
            nextContent: null,
            previousContent: schedule.content,
            previousStartHour: schedule.startHour,
            previousStartMinute: schedule.startMinute,
            previousEndMinute: schedule.endMinute,
            previousRepeatsWeekly: schedule.repeatsWeekly,
            scheduleDate,
            sourceScheduleDate: schedule.scheduleDate,
            source: "learning-progress",
            endHour: schedule.endHour,
            endMinute: schedule.endMinute,
            startHour: schedule.startHour,
            startMinute: schedule.startMinute,
            timeLabel: formatLearningScheduleSlotLabel(
              schedule.startMinute,
              schedule.endMinute,
            ),
            youthId,
            youthName: schedule.youth.name,
          },
        },
      });
    });
  }

  revalidatePath(learningProgressPath);

  return {
    ok: true,
    data: {
      youthId,
      scheduleDate,
      startMinute,
    },
  };
}

function formatLearningScheduleSlotLabel(startMinute: number, endMinute: number) {
  return `${formatMinuteLabel(startMinute)}-${formatMinuteLabel(endMinute)}`;
}

async function findScheduleForSelectedDate(
  youthId: string,
  scheduleDate: string,
  startMinute: number,
) {
  const exactSchedule = await prisma.youthLearningSchedule.findUnique({
    where: {
      youthId_scheduleDate_startMinute: {
        youthId,
        scheduleDate,
        startMinute,
      },
    },
    select: {
      id: true,
      scheduleDate: true,
      startHour: true,
      startMinute: true,
      endHour: true,
      endMinute: true,
      content: true,
      repeatsWeekly: true,
      youth: {
        select: {
          name: true,
        },
      },
    },
  });

  if (exactSchedule) {
    return exactSchedule;
  }

  const recurringSchedules = await prisma.youthLearningSchedule.findMany({
    where: {
      youthId,
      startMinute,
      repeatsWeekly: true,
      scheduleDate: {
        lt: scheduleDate,
      },
    },
    orderBy: {
      scheduleDate: "desc",
    },
    select: {
      id: true,
      scheduleDate: true,
      startHour: true,
      startMinute: true,
      endHour: true,
      endMinute: true,
      content: true,
      repeatsWeekly: true,
      youth: {
        select: {
          name: true,
        },
      },
    },
  });

  return (
    recurringSchedules.find((schedule) =>
      isSameUtcWeekday(schedule.scheduleDate, scheduleDate),
    ) ?? null
  );
}

async function findConflictingSchedule({
  youthId,
  scheduleDate,
  startMinute,
  endMinute,
  sourceStartMinute,
}: {
  youthId: string;
  scheduleDate: string;
  startMinute: number;
  endMinute: number;
  sourceStartMinute: number;
}) {
  const candidates = await prisma.youthLearningSchedule.findMany({
    where: {
      youthId,
      OR: [
        {
          scheduleDate,
        },
        {
          repeatsWeekly: true,
          scheduleDate: {
            lt: scheduleDate,
          },
        },
      ],
    },
    orderBy: [
      {
        scheduleDate: "asc",
      },
      {
        startMinute: "asc",
      },
    ],
    select: {
      id: true,
      scheduleDate: true,
      startHour: true,
      startMinute: true,
      endHour: true,
      endMinute: true,
    },
  });

  return (
    candidates.find((candidate) => {
      const isExactDate = candidate.scheduleDate === scheduleDate;

      if (!isExactDate && !isSameUtcWeekday(candidate.scheduleDate, scheduleDate)) {
        return false;
      }

      if (candidate.startMinute === sourceStartMinute) {
        return false;
      }

      return areLearningScheduleRangesOverlapping(
        startMinute,
        endMinute,
        candidate.startMinute,
        candidate.endMinute,
      );
    }) ?? null
  );
}

function areLearningScheduleRangesOverlapping(
  firstStartMinute: number,
  firstEndMinute: number,
  secondStartMinute: number,
  secondEndMinute: number,
) {
  return firstStartMinute < secondEndMinute && secondStartMinute < firstEndMinute;
}

function isSameUtcWeekday(first: string, second: string) {
  return getUtcWeekday(first) === getUtcWeekday(second);
}

function getUtcWeekday(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );

  return date.getUTCDay();
}

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour <= 12 ? hour : hour - 12;

  return `${period} ${displayHour}시`;
}

function formatMinuteLabel(minute: number) {
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;

  return minutePart === 0
    ? formatHourLabel(hour)
    : `${formatHourLabel(hour)} ${minutePart}분`;
}
