"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, type Prisma } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getYouthLearningSchedules } from "@/lib/youth-learning-schedules";
import {
  getYouthLearningScheduleEndHourFromMinute,
  getYouthLearningScheduleStartHourFromMinute,
  getYouthLearningScheduleWeekday,
  isYouthLearningScheduleDate,
  isYouthLearningScheduleEndMinute,
  isYouthLearningScheduleStartMinute,
  normalizeYouthLearningScheduleWeekdays,
  parseYouthLearningScheduleWeekdays,
  serializeYouthLearningScheduleWeekdays,
  type YouthActionResult,
  type YouthLearningSchedule,
  type YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";

const learningProgressPath = "/youth/learning-progress";
const weeklyRepeatOccurrenceWeeks = 52;

export async function getYouthLearningSchedulesAction(
  scheduleDate: string,
): Promise<
  YouthActionResult<{ scheduleDate: string; schedules: YouthLearningSchedule[] }>
> {
  await requireUser();

  if (!isYouthLearningScheduleDate(scheduleDate)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  return {
    ok: true,
    data: {
      scheduleDate,
      schedules: await getYouthLearningSchedules(scheduleDate),
    },
  };
}

export async function saveYouthLearningScheduleAction(
  youthId: string,
  scheduleDate: string,
  startMinute: number,
  endMinute: number,
  content: string,
  recurrenceWeekdays: number[],
  sourceStartMinute = startMinute,
): Promise<YouthActionResult<{ schedule: YouthLearningSchedule | null }>> {
  const user = await requireUser();
  const normalizedRecurrenceWeekdays = normalizeYouthLearningScheduleWeekdays(
    Array.isArray(recurrenceWeekdays) ? recurrenceWeekdays : [],
  );
  const repeatsWeekly = normalizedRecurrenceWeekdays.length > 0;
  const recurrenceWeekdaysValue = serializeYouthLearningScheduleWeekdays(
    normalizedRecurrenceWeekdays,
  );

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
        if (isWeeklyRepeatSourceSchedule(existingSchedule)) {
          await tx.youthLearningSchedule.deleteMany({
            where: {
              youthId,
              recurrenceSourceDate: existingSchedule.scheduleDate,
            },
          });
        }

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
              previousRecurrenceWeekdays:
                getDisplayScheduleRecurrenceWeekdays(existingSchedule),
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
        scheduleDate: true,
        content: true,
        startHour: true,
        startMinute: true,
        endHour: true,
        endMinute: true,
        repeatsWeekly: true,
        recurrenceSourceDate: true,
        recurrenceWeekdays: true,
      },
    });
    const existingRecurrenceWeekdays = existingSchedule
      ? getEditableScheduleRecurrenceWeekdays(existingSchedule)
      : [];

    if (
      existingSchedule?.content === normalizedContent &&
      existingSchedule.startMinute === startMinute &&
      existingSchedule.endMinute === endMinute &&
      existingSchedule.repeatsWeekly === repeatsWeekly &&
      areYouthLearningScheduleWeekdayArraysEqual(
        existingRecurrenceWeekdays,
        normalizedRecurrenceWeekdays,
      )
    ) {
      await syncWeeklyRepeatOccurrences(tx, {
        content: normalizedContent,
        endHour: existingSchedule.endHour,
        endMinute: existingSchedule.endMinute,
        recurrenceWeekdays: normalizedRecurrenceWeekdays,
        recurrenceWeekdaysValue,
        scheduleDate,
        startHour: existingSchedule.startHour,
        startMinute: existingSchedule.startMinute,
        youthId,
      });

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
        recurrenceSourceDate: existingSchedule.recurrenceSourceDate,
        recurrenceWeekdays: normalizedRecurrenceWeekdays,
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
        recurrenceSourceDate: null,
        recurrenceWeekdays: recurrenceWeekdaysValue,
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
        recurrenceSourceDate: null,
        recurrenceWeekdays: recurrenceWeekdaysValue,
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
        recurrenceSourceDate: true,
        recurrenceWeekdays: true,
      },
    });

    await syncWeeklyRepeatOccurrences(tx, {
      content: normalizedContent,
      endHour,
      endMinute,
      recurrenceWeekdays: normalizedRecurrenceWeekdays,
      recurrenceWeekdaysValue,
      scheduleDate,
      startHour,
      startMinute,
      youthId,
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
          nextRecurrenceWeekdays: normalizedRecurrenceWeekdays,
          previousContent: existingSchedule?.content ?? null,
          previousStartHour: existingSchedule?.startHour ?? null,
          previousStartMinute: existingSchedule?.startMinute ?? null,
          previousEndHour: existingSchedule?.endHour ?? null,
          previousEndMinute: existingSchedule?.endMinute ?? null,
          previousRepeatsWeekly: existingSchedule?.repeatsWeekly ?? null,
          previousRecurrenceWeekdays: existingRecurrenceWeekdays,
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

    return mapSavedYouthLearningSchedule(
      savedSchedule,
      normalizedRecurrenceWeekdays,
    );
  });

  revalidatePath(learningProgressPath);

  return {
    ok: true,
    data: {
      schedule: {
        ...schedule,
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
      if (isWeeklyRepeatSourceSchedule(schedule)) {
        await tx.youthLearningSchedule.deleteMany({
          where: {
            youthId,
            recurrenceSourceDate: schedule.scheduleDate,
          },
        });
      }

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
            previousRecurrenceWeekdays:
              getDisplayScheduleRecurrenceWeekdays(schedule),
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

async function syncWeeklyRepeatOccurrences(
  tx: Prisma.TransactionClient,
  {
    content,
    endHour,
    endMinute,
    recurrenceWeekdays,
    recurrenceWeekdaysValue,
    scheduleDate,
    startHour,
    startMinute,
    youthId,
  }: {
    content: string;
    endHour: number;
    endMinute: number;
    recurrenceWeekdays: YouthLearningScheduleWeekday[];
    recurrenceWeekdaysValue: string | null;
    scheduleDate: string;
    startHour: number;
    startMinute: number;
    youthId: string;
  },
) {
  await tx.youthLearningSchedule.deleteMany({
    where: {
      youthId,
      recurrenceSourceDate: scheduleDate,
    },
  });

  if (recurrenceWeekdays.length === 0) {
    return;
  }

  const occurrenceDates = createWeeklyRepeatOccurrenceDates(
    scheduleDate,
    recurrenceWeekdays,
  );
  const existingSchedules = await tx.youthLearningSchedule.findMany({
    where: {
      youthId,
      scheduleDate: {
        in: occurrenceDates,
      },
    },
    select: {
      scheduleDate: true,
      startMinute: true,
      endMinute: true,
    },
  });
  const availableDates = occurrenceDates.filter(
    (occurrenceDate) =>
      !existingSchedules.some(
        (schedule) =>
          schedule.scheduleDate === occurrenceDate &&
          areLearningScheduleRangesOverlapping(
            startMinute,
            endMinute,
            schedule.startMinute,
            schedule.endMinute,
          ),
      ),
  );

  if (availableDates.length === 0) {
    return;
  }

  await tx.youthLearningSchedule.createMany({
    data: availableDates.map((occurrenceDate) => ({
      content,
      endHour,
      endMinute,
      recurrenceSourceDate: scheduleDate,
      recurrenceWeekdays: recurrenceWeekdaysValue,
      repeatsWeekly: false,
      scheduleDate: occurrenceDate,
      startHour,
      startMinute,
      youthId,
    })),
    skipDuplicates: true,
  });
}

function createWeeklyRepeatOccurrenceDates(
  scheduleDate: string,
  recurrenceWeekdays: YouthLearningScheduleWeekday[],
) {
  return Array.from(
    { length: weeklyRepeatOccurrenceWeeks * 7 },
    (_, index) => shiftLearningScheduleDate(scheduleDate, index + 1),
  ).filter((occurrenceDate) =>
    recurrenceWeekdays.includes(getYouthLearningScheduleWeekday(occurrenceDate)),
  );
}

function shiftLearningScheduleDate(value: string, days: number) {
  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function isWeeklyRepeatSourceSchedule(schedule: {
  recurrenceSourceDate: string | null;
  repeatsWeekly: boolean;
}) {
  return schedule.repeatsWeekly && !schedule.recurrenceSourceDate;
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
      recurrenceSourceDate: true,
      recurrenceWeekdays: true,
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
      recurrenceSourceDate: true,
      recurrenceWeekdays: true,
      youth: {
        select: {
          name: true,
        },
      },
    },
  });

  return (
    recurringSchedules.find((schedule) =>
      isScheduleRecurringOnDate(schedule, scheduleDate),
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
      repeatsWeekly: true,
      recurrenceSourceDate: true,
      recurrenceWeekdays: true,
    },
  });

  return (
    candidates.find((candidate) => {
      const isExactDate = candidate.scheduleDate === scheduleDate;

      if (!isExactDate && !isScheduleRecurringOnDate(candidate, scheduleDate)) {
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

function isScheduleRecurringOnDate(
  schedule: {
    recurrenceWeekdays: string | null;
    repeatsWeekly: boolean;
    scheduleDate: string;
  },
  scheduleDate: string,
) {
  return (
    schedule.repeatsWeekly &&
    schedule.scheduleDate < scheduleDate &&
    getDisplayScheduleRecurrenceWeekdays(schedule).includes(
      getYouthLearningScheduleWeekday(scheduleDate),
    )
  );
}

function getEditableScheduleRecurrenceWeekdays(schedule: {
  recurrenceWeekdays: string | null;
  repeatsWeekly: boolean;
  scheduleDate: string;
}) {
  if (!schedule.repeatsWeekly) {
    return [];
  }

  return parseYouthLearningScheduleWeekdays(
    schedule.recurrenceWeekdays,
    getYouthLearningScheduleWeekday(schedule.scheduleDate),
  );
}

function getDisplayScheduleRecurrenceWeekdays(schedule: {
  recurrenceSourceDate?: string | null;
  recurrenceWeekdays: string | null;
  repeatsWeekly: boolean;
  scheduleDate: string;
}) {
  if (!schedule.repeatsWeekly && !schedule.recurrenceSourceDate) {
    return [];
  }

  return parseYouthLearningScheduleWeekdays(
    schedule.recurrenceWeekdays,
    getYouthLearningScheduleWeekday(
      schedule.recurrenceSourceDate ?? schedule.scheduleDate,
    ),
  );
}

function areYouthLearningScheduleWeekdayArraysEqual(
  first: readonly YouthLearningScheduleWeekday[],
  second: readonly YouthLearningScheduleWeekday[],
) {
  return (
    first.length === second.length &&
    first.every((weekday, index) => weekday === second[index])
  );
}

function mapSavedYouthLearningSchedule(
  schedule: Omit<YouthLearningSchedule, "recurrenceWeekdays"> & {
    recurrenceWeekdays: string | null;
  },
  recurrenceWeekdays: YouthLearningScheduleWeekday[],
): YouthLearningSchedule {
  return {
    ...schedule,
    recurrenceWeekdays,
  };
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
