import "server-only";

import { AuditAction, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatLunchBoxDateValue,
  getLunchBoxCalendarRange,
  getLunchBoxCountTotal,
  lunchBoxCountChangeLogPageSize,
  normalizeLunchBoxPreservationClass,
  normalizeLunchBoxMonth,
  normalizeLunchBoxSchoolType,
  parseLunchBoxCountChangeDetail,
  parseLunchBoxDateValue,
  type LunchBoxCountChangeLogPage,
  type LunchBoxCountGrid,
  type LunchBoxCountMonth,
  type LunchBoxCountMonthDay,
  type LunchBoxCountRow,
  type LunchBoxSchool,
} from "@/lib/lunch-box-counts-core";

type LunchBoxSchoolRecord = {
  id: string;
  name: string;
  preservationClass: number | null;
  type: string;
  order: number;
  active: boolean;
};

export async function getLunchBoxSchools({
  activeOnly = true,
}: {
  activeOnly?: boolean;
} = {}): Promise<LunchBoxSchool[]> {
  const schools = await prisma.lunchBoxSchool.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      preservationClass: true,
      type: true,
      order: true,
      active: true,
    },
  });

  return schools.map(mapLunchBoxSchool);
}

export async function getLunchBoxCountGrid({
  date,
}: {
  date: string;
}): Promise<LunchBoxCountGrid> {
  const schools = await getLunchBoxSchools({ activeOnly: true });
  const counts = await prisma.lunchBoxCount.findMany({
    where: {
      date: parseLunchBoxDateValue(date),
      schoolId: { in: schools.map((school) => school.id) },
    },
    select: {
      schoolId: true,
      class1Count: true,
      class2Count: true,
      class3Count: true,
      class4Count: true,
      linkedCount: true,
      preservationCount: true,
      deliveryDriverCount: true,
    },
  });
  const countsBySchoolId = new Map(
    counts.map((count) => [count.schoolId, count]),
  );

  const rows: LunchBoxCountRow[] = schools.map((school) => {
    const count = countsBySchoolId.get(school.id);

    return {
      schoolId: school.id,
      schoolName: school.name,
      preservationClass: school.preservationClass,
      schoolType: school.type,
      class1Count: count?.class1Count ?? 0,
      class2Count: count?.class2Count ?? 0,
      class3Count: count?.class3Count ?? 0,
      class4Count: count?.class4Count ?? 0,
      linkedCount: count?.linkedCount ?? 0,
      preservationCount: count?.preservationCount ?? 0,
      deliveryDriverCount: count?.deliveryDriverCount ?? 0,
    };
  });

  return {
    date,
    rows,
  };
}

export async function getLunchBoxCountMonth({
  month,
}: {
  month: string;
}): Promise<LunchBoxCountMonth> {
  const normalizedMonth = normalizeLunchBoxMonth(month);
  const { endDate, startDate } = getLunchBoxCalendarRange(normalizedMonth);
  const counts = await prisma.lunchBoxCount.findMany({
    where: {
      date: {
        gte: parseLunchBoxDateValue(startDate),
        lt: parseLunchBoxDateValue(endDate),
      },
      school: {
        active: true,
      },
    },
    orderBy: [
      { date: "asc" },
      { school: { order: "asc" } },
      { school: { name: "asc" } },
    ],
    select: {
      date: true,
      class1Count: true,
      class2Count: true,
      class3Count: true,
      class4Count: true,
      linkedCount: true,
      preservationCount: true,
      deliveryDriverCount: true,
      school: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });
  const days: Record<string, LunchBoxCountMonthDay> = {};

  for (const count of counts) {
    const total = getLunchBoxCountTotal(count);

    if (total === 0) {
      continue;
    }

    const date = formatLunchBoxDateValue(count.date);
    const day = (days[date] ??= {
      date,
      totalCount: 0,
      schools: [],
    });

    day.totalCount += total;
    day.schools.push({
      schoolId: count.school.id,
      schoolName: count.school.name,
      schoolType: normalizeLunchBoxSchoolType(count.school.type),
      total,
    });
  }

  return {
    month: normalizedMonth,
    days,
  };
}

export async function getLunchBoxCountChangeLogPage({
  page,
}: {
  page: number;
}): Promise<LunchBoxCountChangeLogPage> {
  const normalizedPageSize = lunchBoxCountChangeLogPageSize;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const where: Prisma.AuditLogWhereInput = {
    action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
    targetType: "LunchBoxCount",
  };
  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = Math.min(requestedPage, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize,
    select: {
      id: true,
      targetId: true,
      message: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          name: true,
          profileImageStorageKey: true,
          profileImageUpdatedAt: true,
          department: {
            select: { name: true },
          },
          position: {
            select: { name: true },
          },
        },
      },
    },
  });

  return {
    logs: logs.map((log) => ({
      id: log.id,
      message: log.message,
      createdAt: log.createdAt.toISOString(),
      actor: {
        id: log.actor.id,
        name: log.actor.name,
        departmentName: log.actor.department.name,
        positionName: log.actor.position.name,
        profileImageStorageKey: log.actor.profileImageStorageKey,
        profileImageUpdatedAt:
          log.actor.profileImageUpdatedAt?.toISOString() ?? null,
      },
      ...parseLunchBoxCountChangeDetail(log.metadata, log.targetId),
    })),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
  };
}

function mapLunchBoxSchool(school: LunchBoxSchoolRecord): LunchBoxSchool {
  return {
    id: school.id,
    name: school.name,
    preservationClass: normalizeLunchBoxPreservationClass(
      school.preservationClass,
    ),
    type: normalizeLunchBoxSchoolType(school.type),
    order: school.order,
    active: school.active,
  };
}
