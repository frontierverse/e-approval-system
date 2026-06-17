import "server-only";

import { prisma } from "@/lib/prisma";
import type { YouthLearningSchedule } from "@/lib/youth-management-core";
import type { YouthLearningProgressChangeLog } from "@/lib/youth-management-core";

type YouthLearningScheduleRecord = {
  id: string;
  youthId: string;
  startHour: number;
  content: string;
};

export async function getYouthLearningSchedules(): Promise<
  YouthLearningSchedule[]
> {
  const schedules = await prisma.youthLearningSchedule.findMany({
    orderBy: [{ startHour: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      youthId: true,
      startHour: true,
      content: true,
    },
  });

  return schedules.map(mapYouthLearningSchedule);
}

export async function getYouthLearningProgressChangeLogs(
  limit = 20,
): Promise<YouthLearningProgressChangeLog[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        {
          targetType: "YouthLearningSchedule",
        },
        {
          metadata: {
            path: ["source"],
            equals: "learning-progress",
          },
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
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

  return logs.map((log) => ({
    id: log.id,
    message: log.message,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
    actor: {
      ...log.actor,
      profileImageUpdatedAt: log.actor.profileImageUpdatedAt?.toISOString() ?? null,
    },
  }));
}

function mapYouthLearningSchedule(
  record: YouthLearningScheduleRecord,
): YouthLearningSchedule {
  return {
    id: record.id,
    youthId: record.youthId,
    startHour: record.startHour,
    content: record.content,
  };
}
