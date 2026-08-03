"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import {
  getLunchBoxCountGrid,
  getLunchBoxCountMonth,
  getLunchBoxDailyCheckHistoryPage,
  getLunchBoxDailySchoolChecklist,
  getLunchBoxSchoolChecklist,
  getLunchBoxSchools,
} from "@/lib/lunch-box-counts";
import {
  getLunchBoxCountTotal,
  hasLunchBoxCountChanges,
  isLunchBoxDate,
  isLunchBoxMonth,
  isLunchBoxPreservationClassValue,
  isLunchBoxSchoolType,
  normalizeLunchBoxCountValue,
  normalizeLunchBoxDeliveryDriverCountForSave,
  normalizeLunchBoxPreservationClass,
  normalizeLunchBoxPreservationCountForSave,
  normalizeLunchBoxSchoolFormValues,
  parseLunchBoxDateValue,
  resolveLunchBoxPreservationClassForUpdate,
  type LunchBoxActionResult,
  type LunchBoxCountGrid,
  type LunchBoxCountMonth,
  type LunchBoxCountRowInput,
  type LunchBoxDailyCheckHistoryPage,
  type LunchBoxDailySchoolChecklistData,
  type LunchBoxSchoolChecklistData,
  type LunchBoxSchool,
  type LunchBoxSchoolFormState,
} from "@/lib/lunch-box-counts-core";
import { prisma } from "@/lib/prisma";

const lunchBoxManagementPath = "/work-schedule/lunch-boxes";
const maxLunchBoxSchoolNameLength = 100;
const maxLunchBoxSchoolIdLength = 191;
const lunchBoxPositiveCountFilters: Prisma.LunchBoxCountWhereInput[] = [
  { class1Count: { gt: 0 } },
  { class2Count: { gt: 0 } },
  { class3Count: { gt: 0 } },
  { class4Count: { gt: 0 } },
  { linkedCount: { gt: 0 } },
  { preservationCount: { gt: 0 } },
  { deliveryDriverCount: { gt: 0 } },
];

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

export async function getLunchBoxCountMonthAction(
  month: string,
): Promise<LunchBoxActionResult<{ monthData: LunchBoxCountMonth }>> {
  await requireUser();

  if (!isLunchBoxMonth(month)) {
    return {
      ok: false,
      error: "월을 다시 선택하세요.",
    };
  }

  return {
    ok: true,
    data: {
      monthData: await getLunchBoxCountMonth({ month }),
    },
  };
}

export async function getLunchBoxDailySchoolChecklistAction(
  date: string,
): Promise<LunchBoxActionResult<LunchBoxDailySchoolChecklistData>> {
  await requireUser();

  if (!isLunchBoxDate(date)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  return {
    ok: true,
    data: await getLunchBoxDailySchoolChecklist({ date }),
  };
}

export async function getLunchBoxSchoolChecklistAction(): Promise<
  LunchBoxActionResult<LunchBoxSchoolChecklistData>
> {
  await requireUser();

  return {
    ok: true,
    data: await getLunchBoxSchoolChecklist(),
  };
}

export async function setLunchBoxSchoolCheckAction(
  schoolId: string,
  isChecked: boolean,
): Promise<
  LunchBoxActionResult<{
    isChecked: boolean;
    schoolId: string;
  }>
> {
  const user = await requireUser();

  if (
    typeof schoolId !== "string" ||
    schoolId.trim().length === 0 ||
    schoolId.length > maxLunchBoxSchoolIdLength
  ) {
    return {
      ok: false,
      error: "학교를 다시 선택하세요.",
    };
  }

  if (typeof isChecked !== "boolean") {
    return {
      ok: false,
      error: "체크 상태를 다시 선택하세요.",
    };
  }

  const normalizedSchoolId = schoolId.trim();
  const auditRequestData = await getCurrentAuditLogRequestData();
  const mutationResult = await prisma.$transaction(async (tx) => {
    const [lockedSchool] = await tx.$queryRaw<
      Array<{ active: boolean; id: string; name: string }>
    >`
      SELECT "id", "name", "active"
      FROM "LunchBoxSchool"
      WHERE "id" = ${normalizedSchoolId}
      FOR UPDATE
    `;

    if (!lockedSchool?.active) {
      return { kind: "unavailable" as const };
    }

    const hasAssignedCount = await tx.lunchBoxCount.findFirst({
      where: {
        schoolId: normalizedSchoolId,
        OR: lunchBoxPositiveCountFilters,
      },
      select: { id: true },
    });

    if (!hasAssignedCount) {
      return { kind: "unavailable" as const };
    }

    const currentCheck = await tx.lunchBoxSchoolCheck.findUnique({
      where: { schoolId: normalizedSchoolId },
      select: { id: true },
    });

    if ((isChecked && currentCheck) || (!isChecked && !currentCheck)) {
      return {
        kind: "current" as const,
        schoolId: normalizedSchoolId,
      };
    }

    const changedAt = new Date();

    if (isChecked) {
      const createdCheck = await tx.lunchBoxSchoolCheck.create({
        data: {
          schoolId: normalizedSchoolId,
          checkedAt: changedAt,
          checkedById: user.id,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
          targetType: "LunchBoxSchoolCheck",
          targetId: createdCheck.id,
          message: `${lockedSchool.name} 전체 학교 목록 준비 상태를 완료로 표시했습니다.`,
          metadata: {
            changeType: "lunchBoxSchoolCheck.set",
            nextChecked: true,
            previousChecked: false,
            schoolId: normalizedSchoolId,
            schoolName: lockedSchool.name,
            source: "lunch-box-school-checklist",
          },
          createdAt: changedAt,
        },
      });
    } else {
      if (!currentCheck) {
        throw new Error("체크 해제할 준비 완료 상태를 찾을 수 없습니다.");
      }

      await tx.lunchBoxSchoolCheck.delete({
        where: { id: currentCheck.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
          targetType: "LunchBoxSchoolCheck",
          targetId: currentCheck.id,
          message: `${lockedSchool.name} 전체 학교 목록 준비 상태를 미완료로 표시했습니다.`,
          metadata: {
            changeType: "lunchBoxSchoolCheck.set",
            nextChecked: false,
            previousChecked: true,
            schoolId: normalizedSchoolId,
            schoolName: lockedSchool.name,
            source: "lunch-box-school-checklist",
          },
          createdAt: changedAt,
        },
      });
    }

    return {
      kind: "changed" as const,
      schoolId: normalizedSchoolId,
    };
  });

  if (mutationResult.kind === "unavailable") {
    return {
      ok: false,
      error: "도시락 수량이 등록된 활성 학교를 찾을 수 없습니다.",
    };
  }

  revalidatePath(lunchBoxManagementPath);

  return {
    ok: true,
    data: {
      isChecked,
      schoolId: mutationResult.schoolId,
    },
  };
}

export async function clearLunchBoxSchoolChecksAction(): Promise<
  LunchBoxActionResult<{ checkedSchoolIds: string[] }>
> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    const checks = await tx.lunchBoxSchoolCheck.findMany({
      select: {
        id: true,
        schoolId: true,
        school: {
          select: {
            name: true,
          },
        },
      },
    });

    if (checks.length === 0) {
      return;
    }

    const clearedAt = new Date();

    await tx.lunchBoxSchoolCheck.deleteMany({
      where: {
        id: {
          in: checks.map((check) => check.id),
        },
      },
    });

    await tx.auditLog.createMany({
      data: checks.map((check) => ({
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
        targetType: "LunchBoxSchoolCheck",
        targetId: check.id,
        message: `${check.school.name} 전체 학교 목록 준비 상태를 미완료로 표시했습니다.`,
        metadata: {
          changeType: "lunchBoxSchoolCheck.clear",
          nextChecked: false,
          previousChecked: true,
          schoolId: check.schoolId,
          schoolName: check.school.name,
          source: "lunch-box-school-checklist",
        },
        createdAt: clearedAt,
      })),
    });
  });

  revalidatePath(lunchBoxManagementPath);

  return {
    ok: true,
    data: {
      checkedSchoolIds: [],
    },
  };
}

export async function getLunchBoxDailyCheckHistoryPageAction(
  date: string,
  page: number,
): Promise<LunchBoxActionResult<LunchBoxDailyCheckHistoryPage>> {
  await requireUser();

  if (!isLunchBoxDate(date)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  return {
    ok: true,
    data: await getLunchBoxDailyCheckHistoryPage({ date, page }),
  };
}

export async function setLunchBoxDailySchoolCheckAction(
  date: string,
  schoolId: string,
  isChecked: boolean,
): Promise<
  LunchBoxActionResult<{
    date: string;
    schoolId: string;
    isChecked: boolean;
  }>
> {
  const user = await requireUser();

  if (!isLunchBoxDate(date)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  if (
    typeof schoolId !== "string" ||
    schoolId.trim().length === 0 ||
    schoolId.length > maxLunchBoxSchoolIdLength
  ) {
    return {
      ok: false,
      error: "학교를 다시 선택하세요.",
    };
  }

  if (typeof isChecked !== "boolean") {
    return {
      ok: false,
      error: "체크 상태를 다시 선택하세요.",
    };
  }

  const normalizedSchoolId = schoolId.trim();
  const dateValue = parseLunchBoxDateValue(date);
  const checkedAt = isChecked ? new Date() : null;
  const auditRequestData = await getCurrentAuditLogRequestData();

  const mutationResult = await prisma.$transaction(async (tx) => {
    if (isChecked) {
      const [lockedSchool] = await tx.$queryRaw<
        Array<{ active: boolean; id: string }>
      >`
        SELECT "id", "active"
        FROM "LunchBoxSchool"
        WHERE "id" = ${normalizedSchoolId}
        FOR UPDATE
      `;

      if (!lockedSchool?.active) {
        return {
          kind: "unavailable" as const,
        };
      }
    }

    const [updatedCount] = await tx.lunchBoxCount.updateManyAndReturn({
      where: {
        schoolId: normalizedSchoolId,
        date: dateValue,
        checkedAt: isChecked ? null : { not: null },
        ...(isChecked
          ? {
              OR: lunchBoxPositiveCountFilters,
              school: { active: true },
            }
          : {}),
      },
      data: {
        checkedAt,
        checkedById: isChecked ? user.id : null,
      },
      select: {
        id: true,
        schoolId: true,
        school: {
          select: {
            name: true,
          },
        },
      },
    });

    if (updatedCount) {
      const changedAt = new Date();

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
          targetType: "LunchBoxDailySchoolCheck",
          targetId: updatedCount.id,
          message: `${date} ${updatedCount.school.name} 준비 상태를 ${
            isChecked ? "완료" : "미완료"
          }로 표시했습니다.`,
          metadata: {
            changeType: "lunchBoxDailySchoolCheck.set",
            date,
            nextChecked: isChecked,
            previousChecked: !isChecked,
            schoolId: updatedCount.schoolId,
            schoolName: updatedCount.school.name,
            source: "lunch-box-daily-school-checklist",
          },
          createdAt: changedAt,
        },
      });

      return {
        kind: "changed" as const,
        schoolId: updatedCount.schoolId,
      };
    }

    const currentCount = await tx.lunchBoxCount.findUnique({
      where: {
        schoolId_date: {
          schoolId: normalizedSchoolId,
          date: dateValue,
        },
      },
      select: {
        checkedAt: true,
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
            active: true,
          },
        },
      },
    });

    return {
      kind: "current" as const,
      count: currentCount,
    };
  });

  if (mutationResult.kind === "unavailable") {
    return {
      ok: false,
      error: "해당 날짜에 배정된 학교를 찾을 수 없습니다.",
    };
  }

  if (mutationResult.kind === "current") {
    const currentCount = mutationResult.count;
    const currentChecked = currentCount?.checkedAt != null;
    const hasActiveAssignment =
      Boolean(currentCount?.school.active) &&
      Boolean(currentCount && getLunchBoxCountTotal(currentCount) > 0);

    if (!currentCount || (isChecked && !hasActiveAssignment)) {
      return {
        ok: false,
        error: "해당 날짜에 배정된 학교를 찾을 수 없습니다.",
      };
    }

    if (currentChecked !== isChecked) {
      return {
        ok: false,
        error:
          "다른 기기에서 체크 상태가 변경되었습니다. 날짜를 다시 불러오세요.",
      };
    }

    revalidatePath(lunchBoxManagementPath);

    return {
      ok: true,
      data: {
        date,
        schoolId: currentCount.school.id,
        isChecked,
      },
    };
  }

  revalidatePath(lunchBoxManagementPath);

  return {
    ok: true,
    data: {
      date,
      schoolId: mutationResult.schoolId,
      isChecked,
    },
  };
}

export async function clearLunchBoxDailySchoolChecksAction(
  date: string,
): Promise<
  LunchBoxActionResult<{ checkedSchoolIds: string[]; date: string }>
> {
  const user = await requireUser();

  if (!isLunchBoxDate(date)) {
    return {
      ok: false,
      error: "날짜를 다시 선택하세요.",
    };
  }

  const dateValue = parseLunchBoxDateValue(date);
  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    const clearedCounts = await tx.lunchBoxCount.updateManyAndReturn({
      where: {
        date: dateValue,
        checkedAt: { not: null },
      },
      data: {
        checkedAt: null,
        checkedById: null,
      },
      select: {
        id: true,
        schoolId: true,
        school: {
          select: {
            name: true,
          },
        },
      },
    });

    if (clearedCounts.length === 0) {
      return;
    }

    const clearedAt = new Date();

    await tx.auditLog.createMany({
      data: clearedCounts.map((count) => ({
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_LUNCH_BOX_COUNT,
        targetType: "LunchBoxDailySchoolCheck",
        targetId: count.id,
        message: `${date} ${count.school.name} 준비 상태를 미완료로 표시했습니다.`,
        metadata: {
          changeType: "lunchBoxDailySchoolCheck.clear",
          date,
          nextChecked: false,
          previousChecked: true,
          schoolId: count.schoolId,
          schoolName: count.school.name,
          source: "lunch-box-daily-school-checklist",
        },
        createdAt: clearedAt,
      })),
    });
  });

  revalidatePath(lunchBoxManagementPath);

  return {
    ok: true,
    data: {
      checkedSchoolIds: [],
      date,
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
  const submittedRowsBySchoolId = new Map<
    string,
    { row: LunchBoxCountRowInput; school: LunchBoxSchool }
  >();

  for (const row of rows) {
    const school = schoolsById.get(row.schoolId);

    if (school) {
      submittedRowsBySchoolId.set(school.id, { row, school });
    }
  }

  const submittedRows = Array.from(submittedRowsBySchoolId.values());

  if (submittedRows.length === 0) {
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
      schoolId: { in: submittedRows.map((item) => item.school.id) },
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
  const existingBySchoolId = new Map(
    existingCounts.map((count) => [count.schoolId, count]),
  );
  const normalizedRows = submittedRows.map(({ row, school }) => {
    const previous = existingBySchoolId.get(school.id);

    return {
      school,
      values: {
        class1Count: normalizeLunchBoxCountValue(row.class1Count),
        class2Count: normalizeLunchBoxCountValue(row.class2Count),
        class3Count: normalizeLunchBoxCountValue(row.class3Count),
        class4Count: normalizeLunchBoxCountValue(row.class4Count),
        linkedCount: normalizeLunchBoxCountValue(row.linkedCount),
        preservationCount: normalizeLunchBoxPreservationCountForSave(
          row,
          previous?.preservationCount ?? 0,
        ),
        deliveryDriverCount: normalizeLunchBoxDeliveryDriverCountForSave(
          row,
          previous?.deliveryDriverCount ?? 0,
        ),
      },
    };
  });
  const changedRows = normalizedRows.filter(({ school, values }) =>
    hasLunchBoxCountChanges(existingBySchoolId.get(school.id), values),
  );

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
        update: {
          ...values,
          checkedAt: null,
          checkedById: null,
        },
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
        preservationClass: normalizeLunchBoxPreservationClass(
          values.preservationClass,
        ),
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
          next: {
            name: school.name,
            preservationClass: school.preservationClass,
            type: school.type,
          },
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
  const preservationClassWasSubmitted = formData.has("preservationClass");
  const validationError = validateLunchBoxSchoolValues(values);

  if (validationError) {
    return {
      error: validationError,
      values,
    };
  }

  const existingSchool = await prisma.lunchBoxSchool.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      preservationClass: true,
      type: true,
    },
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
        preservationClass: resolveLunchBoxPreservationClassForUpdate({
          previousClass: existingSchool.preservationClass,
          submitted: preservationClassWasSubmitted,
          value: values.preservationClass,
        }),
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
          next: {
            name: school.name,
            preservationClass: school.preservationClass,
            type: school.type,
          },
          previous: {
            name: existingSchool.name,
            preservationClass: existingSchool.preservationClass,
            type: existingSchool.type,
          },
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

    if (!active) {
      await tx.lunchBoxCount.updateMany({
        where: {
          schoolId,
          checkedAt: { not: null },
        },
        data: {
          checkedAt: null,
          checkedById: null,
        },
      });
    }

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
  preservationClass: string;
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

  if (
    values.preservationClass !== "" &&
    !isLunchBoxPreservationClassValue(Number(values.preservationClass))
  ) {
    return "보존식 지정 반을 다시 선택하세요.";
  }

  return "";
}
