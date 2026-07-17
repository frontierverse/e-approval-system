"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { getLunchBoxCountGrid, getLunchBoxSchools } from "@/lib/lunch-box-counts";
import {
  isLunchBoxDate,
  isLunchBoxSchoolType,
  lunchBoxCountFields,
  normalizeLunchBoxCountValue,
  normalizeLunchBoxSchoolFormValues,
  parseLunchBoxDateValue,
  type LunchBoxActionResult,
  type LunchBoxCountGrid,
  type LunchBoxCountRowInput,
  type LunchBoxSchool,
  type LunchBoxSchoolFormState,
} from "@/lib/lunch-box-counts-core";
import { prisma } from "@/lib/prisma";

const lunchBoxManagementPath = "/work-schedule/lunch-boxes";
const maxLunchBoxSchoolNameLength = 100;

export async function getLunchBoxCountGridAction(
  date: string,
): Promise<LunchBoxActionResult<{ grid: LunchBoxCountGrid }>> {
  await requireUser();

  if (!isLunchBoxDate(date)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  return {
    ok: true,
    data: {
      grid: await getLunchBoxCountGrid({ date }),
    },
  };
}

export async function getLunchBoxSchoolListAction(): Promise<
  LunchBoxActionResult<{ schools: LunchBoxSchool[] }>
> {
  await requireUser();

  return {
    ok: true,
    data: {
      schools: await getLunchBoxSchools({ activeOnly: false }),
    },
  };
}

export async function saveLunchBoxCountsAction(
  date: string,
  rows: LunchBoxCountRowInput[],
): Promise<LunchBoxActionResult<{ grid: LunchBoxCountGrid }>> {
  const user = await requireUser();

  if (!isLunchBoxDate(date)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  const schools = await getLunchBoxSchools({ activeOnly: false });
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const normalizedRows = rows.flatMap((row) => {
    const school = schoolsById.get(row.schoolId);

    if (!school) {
      return [];
    }

    return [
      {
        school,
        values: {
          class1Count: normalizeLunchBoxCountValue(row.class1Count),
          class2Count: normalizeLunchBoxCountValue(row.class2Count),
          class3Count: normalizeLunchBoxCountValue(row.class3Count),
          class4Count: normalizeLunchBoxCountValue(row.class4Count),
          linkedCount: normalizeLunchBoxCountValue(row.linkedCount),
        },
      },
    ];
  });

  if (normalizedRows.length === 0) {
    return {
      ok: true,
      data: {
        grid: await getLunchBoxCountGrid({ date }),
      },
    };
  }

  const existingCounts = await prisma.lunchBoxCount.findMany({
    where: {
      date: parseLunchBoxDateValue(date),
      schoolId: { in: normalizedRows.map((row) => row.school.id) },
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
  const existingBySchoolId = new Map(
    existingCounts.map((count) => [count.schoolId, count]),
  );
  const changedRows = normalizedRows.filter(({ school, values }) => {
    const previous = existingBySchoolId.get(school.id);

    return (
      !previous ||
      lunchBoxCountFields.some((field) => previous[field] !== values[field])
    );
  });

  if (changedRows.length === 0) {
    return {
      ok: true,
      data: {
        grid: await getLunchBoxCountGrid({ date }),
      },
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    for (const { school, values } of changedRows) {
      await tx.lunchBoxCount.upsert({
        where: {
          schoolId_date: {
            schoolId: school.id,
            date: parseLunchBoxDateValue(date),
          },
        },
        create: {
          schoolId: school.id,
          date: parseLunchBoxDateValue(date),
          ...values,
        },
        update: values,
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
        targetType: "LunchBoxCount",
        targetId: date,
        message: `${date} 도시락 개수를 ${changedRows.length}개교 반영했습니다.`,
        metadata: {
          changeType: "lunchBoxCount.upsert",
          date,
          schools: changedRows.map(({ school, values }) => ({
            schoolId: school.id,
            schoolName: school.name,
            previous: existingBySchoolId.get(school.id) ?? null,
            next: values,
          })),
          source: "lunch-box-count",
        },
      },
    });
  });

  revalidatePath(lunchBoxManagementPath);

  return {
    ok: true,
    data: {
      grid: await getLunchBoxCountGrid({ date }),
    },
  };
}

export async function createLunchBoxSchoolAction(
  _previousState: LunchBoxSchoolFormState,
  formData: FormData,
): Promise<LunchBoxSchoolFormState> {
  const user = await requireUser();

  const values = normalizeLunchBoxSchoolFormValues(formData);
  const validationError = validateLunchBoxSchoolValues(values);

  if (validationError) {
    return {
      error: validationError,
      values,
    };
  }

  const existing = await prisma.lunchBoxSchool.findUnique({
    where: { name: values.name },
    select: { id: true },
  });

  if (existing) {
    return {
      error: "이미 등록된 학교명입니다.",
      values,
    };
  }

  const maxOrder = await prisma.lunchBoxSchool.aggregate({
    _max: { order: true },
  });
  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    const school = await tx.lunchBoxSchool.create({
      data: {
        name: values.name,
        type: values.type,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
        targetType: "LunchBoxSchool",
        targetId: school.id,
        message: `${school.name} 학교를 등록했습니다.`,
        metadata: {
          changeType: "lunchBoxSchool.create",
          next: { name: school.name, type: school.type },
          previous: null,
          source: "lunch-box-school",
        },
      },
    });
  });

  revalidatePath(lunchBoxManagementPath);

  return {
    resetKey: `${Date.now()}:${Math.random()}`,
    success: "학교를 등록했습니다.",
  };
}

export async function updateLunchBoxSchoolAction(
  schoolId: string,
  _previousState: LunchBoxSchoolFormState,
  formData: FormData,
): Promise<LunchBoxSchoolFormState> {
  const user = await requireUser();

  const values = normalizeLunchBoxSchoolFormValues(formData);
  const validationError = validateLunchBoxSchoolValues(values);

  if (validationError) {
    return {
      error: validationError,
      values,
    };
  }

  const existingSchool = await prisma.lunchBoxSchool.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, type: true },
  });

  if (!existingSchool) {
    return {
      error: "수정할 학교를 찾을 수 없습니다.",
      values,
    };
  }

  const duplicate = await prisma.lunchBoxSchool.findFirst({
    where: { name: values.name, NOT: { id: schoolId } },
    select: { id: true },
  });

  if (duplicate) {
    return {
      error: "이미 등록된 학교명입니다.",
      values,
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    const school = await tx.lunchBoxSchool.update({
      where: { id: schoolId },
      data: {
        name: values.name,
        type: values.type,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
        targetType: "LunchBoxSchool",
        targetId: school.id,
        message: `${school.name} 학교 정보를 수정했습니다.`,
        metadata: {
          changeType: "lunchBoxSchool.update",
          next: { name: school.name, type: school.type },
          previous: { name: existingSchool.name, type: existingSchool.type },
          source: "lunch-box-school",
        },
      },
    });
  });

  revalidatePath(lunchBoxManagementPath);

  return {
    resetKey: `${Date.now()}:${Math.random()}`,
    success: "학교 정보를 수정했습니다.",
  };
}

export async function setLunchBoxSchoolActiveAction(
  schoolId: string,
  active: boolean,
) {
  const user = await requireUser();

  const existingSchool = await prisma.lunchBoxSchool.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, type: true, active: true },
  });

  if (!existingSchool || existingSchool.active === active) {
    revalidatePath(lunchBoxManagementPath);
    return;
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    await tx.lunchBoxSchool.update({
      where: { id: schoolId },
      data: { active },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
        targetType: "LunchBoxSchool",
        targetId: existingSchool.id,
        message: active
          ? `${existingSchool.name} 학교를 다시 활성화했습니다.`
          : `${existingSchool.name} 학교를 목록에서 비활성화했습니다.`,
        metadata: {
          changeType: active
            ? "lunchBoxSchool.activate"
            : "lunchBoxSchool.deactivate",
          next: { active },
          previous: { active: existingSchool.active },
          source: "lunch-box-school",
        },
      },
    });
  });

  revalidatePath(lunchBoxManagementPath);
}

function validateLunchBoxSchoolValues(values: {
  name: string;
  type: string;
}) {
  if (!values.name) {
    return "학교명을 입력하세요.";
  }

  if (values.name.length > maxLunchBoxSchoolNameLength) {
    return `학교명은 ${maxLunchBoxSchoolNameLength}자 이하로 입력하세요.`;
  }

  if (!isLunchBoxSchoolType(values.type)) {
    return "학교 구분을 다시 선택하세요.";
  }

  return "";
}

