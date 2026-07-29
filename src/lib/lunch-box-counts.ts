import "server-only";

import { AuditAction, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createLunchBoxChartData,
  createLunchBoxFixedCountList,
  formatLunchBoxDateValue,
  getLunchBoxCalendarRange,
  getLunchBoxCountTotal,
  lunchBoxCountChangeLogPageSize,
  lunchBoxDailyCheckHistoryPageSize,
  normalizeLunchBoxMenuItems,
  normalizeLunchBoxPreservationClass,
  normalizeLunchBoxMonth,
  normalizeLunchBoxSchoolType,
  parseLunchBoxCountChangeDetail,
  parseLunchBoxDailyCheckHistoryDetail,
  parseLunchBoxDateValue,
  type LunchBoxCountChangeLogPage,
  type LunchBoxChartData,
  type LunchBoxDailyCheckHistoryPage,
  type LunchBoxDailySchoolChecklistData,
  type LunchBoxCountGrid,
  type LunchBoxCountMonth,
  type LunchBoxCountMonthDay,
  type LunchBoxCountRow,
  type LunchBoxFixedCountList,
  type LunchBoxSchoolChecklistData,
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
  return (await getLunchBoxCountGridData({ date })).grid;
}

export async function getLunchBoxDailySchoolChecklist({
  date,
}: {
  date: string;
}): Promise<LunchBoxDailySchoolChecklistData> {
  return getLunchBoxCountGridData({ date });
}

export async function getLunchBoxDailyCheckHistoryPage({
  date,
  page,
}: {
  date: string;
  page: number;
}): Promise<LunchBoxDailyCheckHistoryPage> {
  const pageSize = lunchBoxDailyCheckHistoryPageSize;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const where: Prisma.AuditLogWhereInput = {
    action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
    targetType: "LunchBoxDailySchoolCheck",
    metadata: {
      path: ["date"],
      equals: date,
    },
  };
  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(requestedPage, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (normalizedPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
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
      ...parseLunchBoxDailyCheckHistoryDetail(log.metadata, date),
    })),
    page: normalizedPage,
    pageSize,
    total,
    totalPages,
  };
}

async function getLunchBoxCountGridData({
  date,
}: {
  date: string;
}): Promise<LunchBoxDailySchoolChecklistData> {
  const dateValue = parseLunchBoxDateValue(date);
  const [schools, menu, counts] = await Promise.all([
    getLunchBoxSchools({ activeOnly: true }),
    prisma.lunchBoxMenu.findUnique({
      where: { date: dateValue },
      select: { items: true },
    }),
    prisma.lunchBoxCount.findMany({
      where: {
        date: dateValue,
        school: { active: true },
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
        checkedAt: true,
      },
    }),
  ]);
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
    checkedSchoolIds: rows.flatMap((row) =>
      getLunchBoxCountTotal(row) > 0 &&
      countsBySchoolId.get(row.schoolId)?.checkedAt
        ? [row.schoolId]
        : [],
    ),
    grid: {
      date,
      menuItems: normalizeLunchBoxMenuItems(menu?.items ?? []),
      rows,
    },
  };
}

export async function getLunchBoxFixedCountList(): Promise<LunchBoxFixedCountList> {
  const schools = await getLunchBoxSchools({ activeOnly: true });
  const counts = await prisma.lunchBoxCount.findMany({
    where: { schoolId: { in: schools.map((school) => school.id) } },
    orderBy: { date: "asc" },
    select: {
      schoolId: true,
      date: true,
      class1Count: true,
      class2Count: true,
      class3Count: true,
      class4Count: true,
      linkedCount: true,
      preservationCount: true,
      deliveryDriverCount: true,
    },
  });

  return createLunchBoxFixedCountList({
    counts: counts.map((count) => ({
      ...count,
      date: formatLunchBoxDateValue(count.date),
    })),
    schools,
  });
}

export async function getLunchBoxChartData(): Promise<LunchBoxChartData> {
  // Keep historical totals stable even after a school is deactivated.
  const counts = await prisma.lunchBoxCount.findMany({
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
          order: true,
          type: true,
        },
      },
    },
  });

  return createLunchBoxChartData(
    counts.map((count) => ({
      class1Count: count.class1Count,
      class2Count: count.class2Count,
      class3Count: count.class3Count,
      class4Count: count.class4Count,
      date: formatLunchBoxDateValue(count.date),
      deliveryDriverCount: count.deliveryDriverCount,
      linkedCount: count.linkedCount,
      preservationCount: count.preservationCount,
      schoolId: count.school.id,
      schoolName: count.school.name,
      schoolOrder: count.school.order,
      schoolType: normalizeLunchBoxSchoolType(count.school.type),
    })),
  );
}

export async function getLunchBoxSchoolChecklist(): Promise<LunchBoxSchoolChecklistData> {
  const checks = await prisma.lunchBoxSchoolCheck.findMany({
    where: {
      school: { active: true },
    },
    select: {
      schoolId: true,
    },
  });

  return {
    checkedSchoolIds: checks.map((check) => check.schoolId),
  };
}

export async function getLunchBoxCountMonth({
  month,
}: {
  month: string;
}): Promise<LunchBoxCountMonth> {
  const normalizedMonth = normalizeLunchBoxMonth(month);
  const { endDate, startDate } = getLunchBoxCalendarRange(normalizedMonth);
  const startDateValue = parseLunchBoxDateValue(startDate);
  const endDateValue = parseLunchBoxDateValue(endDate);
  const [counts, menus] = await Promise.all([
    prisma.lunchBoxCount.findMany({
      where: {
        date: {
          gte: startDateValue,
          lt: endDateValue,
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
    }),
    prisma.lunchBoxMenu.findMany({
      where: {
        date: {
          gte: startDateValue,
          lt: endDateValue,
        },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        items: true,
      },
    }),
  ]);
  const days: Record<string, LunchBoxCountMonthDay> = {};

  for (const count of counts) {
    const total = getLunchBoxCountTotal(count);

    if (total === 0) {
      continue;
    }

    const date = formatLunchBoxDateValue(count.date);
    const day = (days[date] ??= {
      date,
      menuItems: [],
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

  for (const menu of menus) {
    const date = formatLunchBoxDateValue(menu.date);
    const day = (days[date] ??= {
      date,
      menuItems: [],
      totalCount: 0,
      schools: [],
    });

    day.menuItems = normalizeLunchBoxMenuItems(menu.items);
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
