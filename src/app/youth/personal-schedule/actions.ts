"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { prisma } from "@/lib/prisma";
import {
  getYouthPersonalScheduleDateIntersection,
  normalizeYouthPersonalScheduleInput,
  parseYouthPersonalScheduleWeekdays,
  type NormalizedYouthPersonalScheduleInput,
  type YouthPersonalScheduleInput,
} from "@/lib/youth-personal-schedule-core";
import {
  mapYouthPersonalSchedule,
  youthPersonalScheduleSelect,
  type YouthPersonalSchedule,
} from "@/lib/youth-personal-schedules";
import type { YouthActionResult } from "@/lib/youth-management-core";
import { requireYouthPermission } from "@/lib/youth-permissions";

const youthPersonalSchedulePath = "/youth/personal-schedule";
const workSchedulePath = "/work-schedule";
const workLogPath = "/work-schedule/work-log";

class YouthPersonalScheduleConflictError extends Error {
  constructor(
    readonly conflict: {
      occurrenceDates: string[];
      startMinute: number;
      endMinute: number;
    },
  ) {
    super("Youth personal schedule conflict");
    this.name = "YouthPersonalScheduleConflictError";
  }
}

class YouthPersonalScheduleNotFoundError extends Error {
  constructor(readonly target: "escort" | "schedule" | "youth") {
    super(`Youth personal schedule ${target} not found`);
    this.name = "YouthPersonalScheduleNotFoundError";
  }
}

class YouthPersonalScheduleStalePayloadError extends Error {
  constructor() {
    super("Youth personal schedule type is missing from a hospital update");
    this.name = "YouthPersonalScheduleStalePayloadError";
  }
}

export async function createYouthPersonalScheduleAction(
  youthId: string,
  input: YouthPersonalScheduleInput,
): Promise<YouthActionResult<{ schedule: YouthPersonalSchedule }>> {
  const user = await requireYouthPermission("canManageYouth");
  const normalizedInput = normalizeYouthPersonalScheduleInput(input);
  const normalizedYouthId =
    typeof youthId === "string" ? youthId.trim() : "";

  if (!normalizedYouthId) {
    return {
      ok: false,
      error: "청소년을 다시 선택하세요.",
    };
  }

  if (!normalizedInput.ok) {
    return normalizedInput;
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  try {
    const schedule = await prisma.$transaction(
      async (tx) => {
        const youth = await tx.youth.findUnique({
          where: {
            id: normalizedYouthId,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!youth) {
          throw new YouthPersonalScheduleNotFoundError("youth");
        }

        const escortSnapshot =
          await resolveYouthPersonalScheduleEscortSnapshot(
            tx,
            normalizedInput.value,
          );

        const conflict = await findConflictingYouthPersonalSchedule(tx, {
          youthId: youth.id,
          input: normalizedInput.value,
        });

        if (conflict) {
          throw new YouthPersonalScheduleConflictError(conflict);
        }

        const createdSchedule = await tx.youthPersonalSchedule.create({
          data: {
            youthId: youth.id,
            ...createYouthPersonalScheduleData(
              normalizedInput.value,
              escortSnapshot,
            ),
          },
          select: youthPersonalScheduleSelect,
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            ...auditRequestData,
            action: AuditAction.UPDATE_YOUTH,
            targetType: "YouthPersonalSchedule",
            targetId: createdSchedule.id,
            message: `${youth.name} 청소년의 개인 일정을 등록했습니다.`,
            metadata: {
              changeType: "youthPersonalSchedule.create",
              source: "youth-personal-schedule",
              youthId: youth.id,
              youthName: youth.name,
              next: createYouthPersonalScheduleAuditSnapshot(
                {
                  ...normalizedInput.value,
                  ...escortSnapshot,
                },
              ),
            },
          },
        });

        return mapYouthPersonalSchedule(createdSchedule);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    revalidatePersonalScheduleConsumers();

    return {
      ok: true,
      data: {
        schedule,
      },
    };
  } catch (error) {
    return mapYouthPersonalScheduleMutationError(error);
  }
}

export async function updateYouthPersonalScheduleAction(
  scheduleId: string,
  input: YouthPersonalScheduleInput,
): Promise<YouthActionResult<{ schedule: YouthPersonalSchedule }>> {
  const user = await requireYouthPermission("canManageYouth");
  const hasExplicitScheduleType =
    input !== null &&
    typeof input === "object" &&
    Object.prototype.hasOwnProperty.call(input, "scheduleType") &&
    input.scheduleType !== undefined;
  const normalizedInput = normalizeYouthPersonalScheduleInput(input);
  const normalizedScheduleId =
    typeof scheduleId === "string" ? scheduleId.trim() : "";

  if (!normalizedScheduleId) {
    return {
      ok: false,
      error: "수정할 일정을 다시 선택하세요.",
    };
  }

  if (!normalizedInput.ok) {
    return normalizedInput;
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  try {
    const schedule = await prisma.$transaction(
      async (tx) => {
        const existingSchedule = await tx.youthPersonalSchedule.findUnique({
          where: {
            id: normalizedScheduleId,
          },
          select: {
            ...youthPersonalScheduleSelect,
            youth: {
              select: {
                name: true,
              },
            },
          },
        });

        if (!existingSchedule) {
          throw new YouthPersonalScheduleNotFoundError("schedule");
        }

        if (
          existingSchedule.scheduleType === "HOSPITAL" &&
          !hasExplicitScheduleType
        ) {
          throw new YouthPersonalScheduleStalePayloadError();
        }

        const escortSnapshot =
          await resolveYouthPersonalScheduleEscortSnapshot(
            tx,
            normalizedInput.value,
            {
              escortName: existingSchedule.escortName,
              escortType: existingSchedule.escortType,
              escortUserId: existingSchedule.escortUserId,
              scheduleType: existingSchedule.scheduleType,
            },
          );

        const conflict = await findConflictingYouthPersonalSchedule(tx, {
          youthId: existingSchedule.youthId,
          input: normalizedInput.value,
          excludeScheduleId: existingSchedule.id,
        });

        if (conflict) {
          throw new YouthPersonalScheduleConflictError(conflict);
        }

        const updatedSchedule = await tx.youthPersonalSchedule.update({
          where: {
            id: existingSchedule.id,
          },
          data: createYouthPersonalScheduleData(
            normalizedInput.value,
            escortSnapshot,
          ),
          select: youthPersonalScheduleSelect,
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            ...auditRequestData,
            action: AuditAction.UPDATE_YOUTH,
            targetType: "YouthPersonalSchedule",
            targetId: updatedSchedule.id,
            message: `${existingSchedule.youth.name} 청소년의 개인 일정을 수정했습니다.`,
            metadata: {
              changeType: "youthPersonalSchedule.update",
              source: "youth-personal-schedule",
              youthId: existingSchedule.youthId,
              youthName: existingSchedule.youth.name,
              previous: createYouthPersonalScheduleAuditSnapshot(
                mapYouthPersonalSchedule(existingSchedule),
              ),
              next: createYouthPersonalScheduleAuditSnapshot(
                {
                  ...normalizedInput.value,
                  ...escortSnapshot,
                },
              ),
            },
          },
        });

        return mapYouthPersonalSchedule(updatedSchedule);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    revalidatePersonalScheduleConsumers();

    return {
      ok: true,
      data: {
        schedule,
      },
    };
  } catch (error) {
    return mapYouthPersonalScheduleMutationError(error);
  }
}

export async function deleteYouthPersonalScheduleAction(
  scheduleId: string,
): Promise<YouthActionResult<{ scheduleId: string }>> {
  const user = await requireYouthPermission("canManageYouth");
  const normalizedScheduleId =
    typeof scheduleId === "string" ? scheduleId.trim() : "";

  if (!normalizedScheduleId) {
    return {
      ok: false,
      error: "삭제할 일정을 다시 선택하세요.",
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  try {
    await prisma.$transaction(
      async (tx) => {
        const schedule = await tx.youthPersonalSchedule.findUnique({
          where: {
            id: normalizedScheduleId,
          },
          select: {
            ...youthPersonalScheduleSelect,
            youth: {
              select: {
                name: true,
              },
            },
          },
        });

        if (!schedule) {
          throw new YouthPersonalScheduleNotFoundError("schedule");
        }

        await tx.youthPersonalSchedule.delete({
          where: {
            id: schedule.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            ...auditRequestData,
            action: AuditAction.UPDATE_YOUTH,
            targetType: "YouthPersonalSchedule",
            targetId: schedule.id,
            message: `${schedule.youth.name} 청소년의 개인 일정을 삭제했습니다.`,
            metadata: {
              changeType: "youthPersonalSchedule.delete",
              source: "youth-personal-schedule",
              youthId: schedule.youthId,
              youthName: schedule.youth.name,
              previous: createYouthPersonalScheduleAuditSnapshot(
                mapYouthPersonalSchedule(schedule),
              ),
              next: null,
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    revalidatePersonalScheduleConsumers();

    return {
      ok: true,
      data: {
        scheduleId: normalizedScheduleId,
      },
    };
  } catch (error) {
    return mapYouthPersonalScheduleMutationError(error);
  }
}

function revalidatePersonalScheduleConsumers() {
  revalidatePath(youthPersonalSchedulePath);
  revalidatePath(workSchedulePath);
  revalidatePath(workLogPath);
}

function createYouthPersonalScheduleData(
  input: NormalizedYouthPersonalScheduleInput,
  escortSnapshot: YouthPersonalScheduleEscortSnapshot,
) {
  return {
    content: input.content,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    selectionMode: input.selectionMode,
    occurrenceDates: input.occurrenceDates,
    recurrenceWeekdays: input.recurrenceWeekdays,
    recurrenceStartDate: input.recurrenceStartDate,
    recurrenceEndDate: input.recurrenceEndDate,
    scheduleType: input.scheduleType,
    hospitalName: input.hospitalName,
    escortType: input.escortType,
    escortUserId: escortSnapshot.escortUserId,
    escortName: escortSnapshot.escortName,
    nextAppointmentDate: input.nextAppointmentDate,
  };
}

type YouthPersonalScheduleEscortSnapshot = {
  escortUserId: string | null;
  escortName: string | null;
};

type ExistingYouthPersonalScheduleEscort = Pick<
  YouthPersonalSchedule,
  "escortName" | "escortType" | "escortUserId" | "scheduleType"
>;

async function resolveYouthPersonalScheduleEscortSnapshot(
  tx: Prisma.TransactionClient,
  input: NormalizedYouthPersonalScheduleInput,
  existingSchedule?: ExistingYouthPersonalScheduleEscort,
): Promise<YouthPersonalScheduleEscortSnapshot> {
  if (input.scheduleType !== "HOSPITAL") {
    return {
      escortUserId: null,
      escortName: null,
    };
  }

  if (input.escortType === "OTHER") {
    if (!input.escortOtherName) {
      throw new YouthPersonalScheduleNotFoundError("escort");
    }

    return {
      escortUserId: null,
      escortName: input.escortOtherName,
    };
  }

  const appointmentDate = input.occurrenceDates[0];

  if (
    input.escortType !== "STAFF" ||
    !input.escortUserId ||
    !appointmentDate
  ) {
    throw new YouthPersonalScheduleNotFoundError("escort");
  }

  const escortUser = await tx.user.findFirst({
    where: {
      id: input.escortUserId,
      AND: [
        {
          OR: [
            { hireDate: null },
            { hireDate: "" },
            { hireDate: { lte: appointmentDate } },
          ],
        },
        {
          OR: [
            { resignationDate: null },
            { resignationDate: "" },
            { resignationDate: { gte: appointmentDate } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!escortUser) {
    throw new YouthPersonalScheduleNotFoundError("escort");
  }

  const existingEscortName =
    existingSchedule?.scheduleType === "HOSPITAL" &&
    existingSchedule.escortType === "STAFF" &&
    existingSchedule.escortUserId === escortUser.id &&
    existingSchedule.escortName?.trim()
      ? existingSchedule.escortName
      : null;

  return {
    escortUserId: escortUser.id,
    escortName: existingEscortName ?? escortUser.name,
  };
}

async function findConflictingYouthPersonalSchedule(
  tx: Prisma.TransactionClient,
  {
    youthId,
    input,
    excludeScheduleId,
  }: {
    youthId: string;
    input: NormalizedYouthPersonalScheduleInput;
    excludeScheduleId?: string;
  },
) {
  const conflict = await tx.youthPersonalSchedule.findFirst({
    where: {
      youthId,
      occurrenceDates: {
        hasSome: input.occurrenceDates,
      },
      startMinute: {
        lt: input.endMinute,
      },
      endMinute: {
        gt: input.startMinute,
      },
      ...(excludeScheduleId
        ? {
            NOT: {
              id: excludeScheduleId,
            },
          }
        : {}),
    },
    orderBy: [{ startMinute: "asc" }, { endMinute: "asc" }],
    select: {
      occurrenceDates: true,
      startMinute: true,
      endMinute: true,
    },
  });

  if (!conflict) {
    return null;
  }

  return {
    ...conflict,
    occurrenceDates: getYouthPersonalScheduleDateIntersection(
      conflict.occurrenceDates,
      input.occurrenceDates,
    ),
  };
}

function createYouthPersonalScheduleAuditSnapshot(input: {
  content: string;
  escortName: string | null;
  escortType: string | null;
  escortUserId: string | null;
  startMinute: number;
  endMinute: number;
  hospitalName: string | null;
  nextAppointmentDate: string | null;
  scheduleType: string;
  selectionMode: string;
  occurrenceDates: readonly string[];
  recurrenceWeekdays:
    | string
    | null
    | readonly number[];
  recurrenceStartDate: string | null;
  recurrenceEndDate: string | null;
}) {
  const recurrenceWeekdays = input.recurrenceWeekdays;

  return {
    content: input.content,
    scheduleType: input.scheduleType,
    hospitalName: input.hospitalName,
    escortType: input.escortType,
    escortUserId: input.escortUserId,
    escortName: input.escortName,
    nextAppointmentDate: input.nextAppointmentDate,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    selectionMode: input.selectionMode,
    occurrenceDates: [...input.occurrenceDates],
    occurrenceCount: input.occurrenceDates.length,
    recurrenceWeekdays:
      typeof recurrenceWeekdays === "string" || recurrenceWeekdays === null
        ? parseYouthPersonalScheduleWeekdays(recurrenceWeekdays)
        : [...recurrenceWeekdays],
    recurrenceStartDate: input.recurrenceStartDate,
    recurrenceEndDate: input.recurrenceEndDate,
  };
}

function mapYouthPersonalScheduleMutationError(
  error: unknown,
): YouthActionResult<never> {
  if (error instanceof YouthPersonalScheduleStalePayloadError) {
    return {
      ok: false,
      error:
        "병원 진료 예약 수정 정보에 일정 종류가 누락되었습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
    };
  }

  if (error instanceof YouthPersonalScheduleConflictError) {
    const conflictDate = error.conflict.occurrenceDates[0];
    const dateLabel = conflictDate ? `${conflictDate} ` : "";

    return {
      ok: false,
      error: `${dateLabel}${formatMinuteRange(
        error.conflict.startMinute,
        error.conflict.endMinute,
      )} 일정과 시간이 겹칩니다.`,
    };
  }

  if (error instanceof YouthPersonalScheduleNotFoundError) {
    return {
      ok: false,
      error: getYouthPersonalScheduleNotFoundMessage(error.target),
    };
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2034"
  ) {
    return {
      ok: false,
      error: "다른 일정이 동시에 변경되었습니다. 다시 시도하세요.",
    };
  }

  throw error;
}

function getYouthPersonalScheduleNotFoundMessage(
  target: YouthPersonalScheduleNotFoundError["target"],
) {
  if (target === "youth") {
    return "선택한 청소년을 찾을 수 없습니다.";
  }

  if (target === "escort") {
    return "선택한 인솔자를 찾을 수 없거나 진료일에 재직 중이 아닙니다.";
  }

  return "일정을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.";
}

function formatMinuteRange(startMinute: number, endMinute: number) {
  return `${formatMinute(startMinute)}~${formatMinute(endMinute)}`;
}

function formatMinute(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
