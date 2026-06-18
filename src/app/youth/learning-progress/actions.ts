"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isYouthLearningScheduleDate,
  isYouthLearningScheduleStartHour,
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
  startHour: number,
  content: string,
): Promise<YouthActionResult<{ schedule: YouthLearningSchedule | null }>> {
  const user = await requireUser();

  if (!isYouthLearningScheduleDate(scheduleDate)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleStartHour(startHour)) {
    return {
      ok: false,
      error: "시간을 다시 선택하세요.",
    };
  }

  const normalizedContent = content.trim();

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
    const existingSchedule = await prisma.youthLearningSchedule.findUnique({
      where: {
        youthId_scheduleDate_startHour: {
          youthId,
          scheduleDate,
          startHour,
        },
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (existingSchedule) {
      const auditRequestData = await getCurrentAuditLogRequestData();

      await prisma.$transaction(async (tx) => {
        await tx.youthLearningSchedule.delete({
          where: {
            youthId_scheduleDate_startHour: {
              youthId,
              scheduleDate,
              startHour,
            },
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
              startHour,
            )} 스케줄을 삭제했습니다.`,
            metadata: {
              changeType: "schedule.delete",
              nextContent: null,
              previousContent: existingSchedule.content,
              scheduleDate,
              source: "learning-progress",
              startHour,
              timeLabel: formatLearningScheduleSlotLabel(startHour),
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

  const auditRequestData = await getCurrentAuditLogRequestData();
  const schedule = await prisma.$transaction(async (tx) => {
    const existingSchedule = await tx.youthLearningSchedule.findUnique({
      where: {
        youthId_scheduleDate_startHour: {
          youthId,
          scheduleDate,
          startHour,
        },
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (existingSchedule?.content === normalizedContent) {
      return {
        id: existingSchedule.id,
        youthId,
        scheduleDate,
        startHour,
        content: normalizedContent,
      };
    }

    const savedSchedule = await tx.youthLearningSchedule.upsert({
      where: {
        youthId_scheduleDate_startHour: {
          youthId,
          scheduleDate,
          startHour,
        },
      },
      update: {
        content: normalizedContent,
      },
      create: {
        youthId,
        scheduleDate,
        startHour,
        content: normalizedContent,
      },
      select: {
        id: true,
        youthId: true,
        scheduleDate: true,
        startHour: true,
        content: true,
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
          startHour,
        )} 스케줄을 ${existingSchedule ? "변경" : "입력"}했습니다.`,
        metadata: {
          changeType: existingSchedule ? "schedule.update" : "schedule.create",
          nextContent: normalizedContent,
          previousContent: existingSchedule?.content ?? null,
          scheduleDate,
          source: "learning-progress",
          startHour,
          timeLabel: formatLearningScheduleSlotLabel(startHour),
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
      schedule,
    },
  };
}

export async function deleteYouthLearningScheduleAction(
  youthId: string,
  scheduleDate: string,
  startHour: number,
): Promise<
  YouthActionResult<{ youthId: string; scheduleDate: string; startHour: number }>
> {
  const user = await requireUser();

  if (!isYouthLearningScheduleDate(scheduleDate)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  if (!isYouthLearningScheduleStartHour(startHour)) {
    return {
      ok: false,
      error: "시간을 다시 선택하세요.",
    };
  }

  const schedule = await prisma.youthLearningSchedule.findUnique({
    where: {
      youthId_scheduleDate_startHour: {
        youthId,
        scheduleDate,
        startHour,
      },
    },
    select: {
      id: true,
      content: true,
      youth: {
        select: {
          name: true,
        },
      },
    },
  });

  if (schedule) {
    const auditRequestData = await getCurrentAuditLogRequestData();

    await prisma.$transaction(async (tx) => {
      await tx.youthLearningSchedule.delete({
        where: {
          youthId_scheduleDate_startHour: {
            youthId,
            scheduleDate,
            startHour,
          },
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
            startHour,
          )} 스케줄을 삭제했습니다.`,
          metadata: {
            changeType: "schedule.delete",
            nextContent: null,
            previousContent: schedule.content,
            scheduleDate,
            source: "learning-progress",
            startHour,
            timeLabel: formatLearningScheduleSlotLabel(startHour),
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
      startHour,
    },
  };
}

function formatLearningScheduleSlotLabel(startHour: number) {
  return `${formatHourLabel(startHour)}-${formatHourLabel(startHour + 1)}`;
}

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour <= 12 ? hour : hour - 12;

  return `${period} ${displayHour}시`;
}
