import "server-only";

import { prisma } from "@/lib/prisma";
import {
  formatLunchBoxDateValue,
  getLunchBoxCountTotal,
  getLunchBoxMonthRange,
  normalizeLunchBoxMonth,
  normalizeLunchBoxSchoolType,
  parseLunchBoxDateValue,
  type LunchBoxCountGrid,
  type LunchBoxCountMonth,
  type LunchBoxCountMonthDay,
  type LunchBoxCountRow,
  type LunchBoxSchool,
} from "@/lib/lunch-box-counts-core";

type LunchBoxSchoolRecord = {
  id: string;
  name: string;
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
      schoolType: school.type,
      class1Count: count?.class1Count ?? 0,
      class2Count: count?.class2Count ?? 0,
      class3Count: count?.class3Count ?? 0,
      class4Count: count?.class4Count ?? 0,
      linkedCount: count?.linkedCount ?? 0,
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
  const { endDate, startDate } = getLunchBoxMonthRange(normalizedMonth);
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

function mapLunchBoxSchool(school: LunchBoxSchoolRecord): LunchBoxSchool {
  return {
    id: school.id,
    name: school.name,
    type: normalizeLunchBoxSchoolType(school.type),
    order: school.order,
    active: school.active,
  };
}
