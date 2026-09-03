"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatWorkLogDateLabel,
  getWorkLogToday,
  hasWorkLogFormErrors,
  hasWorkLogSaveConflict,
  normalizeWorkLogFormValues,
  parseWorkLogDateValue,
  validateWorkLogFormValues,
  type WorkLogDeleteFormState,
  type WorkLogEntry,
  type WorkLogFormState,
} from "@/lib/work-log-core";
import { mapWorkLogRecord, workLogSelect } from "@/lib/work-logs";

const workLogPath = "/work-schedule/work-log";
const workLogTransactionMaxAttempts = 3;

type WorkLogSaveResult = {
  change: "create" | "unchanged" | "update";
  entry: WorkLogEntry;
};

type WorkLogDeleteResult =
  | { kind: "conflict" }
  | { kind: "deleted"; entry: WorkLogEntry }
  | { kind: "missing" };

export async function saveWorkLogAction(
  _previousState: WorkLogFormState,
  formData: FormData,
): Promise<WorkLogFormState> {
  const user = await requireUser();
  const values = normalizeWorkLogFormValues(formData);
  const expectedUpdatedAt = String(
    formData.get("expectedUpdatedAt") ?? "",
  ).trim();
  const fieldErrors = validateWorkLogFormValues(values, getWorkLogToday());

  if (hasWorkLogFormErrors(fieldErrors)) {
    return {
      error: "입력 내용을 확인해 주세요.",
      fieldErrors,
      values,
    };
  }

  const workDate = parseWorkLogDateValue(values.workDate);
  const auditRequestData = await getCurrentAuditLogRequestData();
  let savedResult: WorkLogSaveResult | null = null;

  try {
    for (let attempt = 0; attempt < workLogTransactionMaxAttempts; attempt += 1) {
      try {
        savedResult = await prisma.$transaction(
          async (tx) => {
            const existingLog = await tx.workLog.findUnique({
              where: {
                authorId_workDate: {
                  authorId: user.id,
                  workDate,
                },
              },
              select: workLogSelect,
            });

            const currentUpdatedAt = existingLog?.updatedAt.toISOString() ?? null;

            if (
              hasWorkLogSaveConflict(expectedUpdatedAt, currentUpdatedAt)
            ) {
              throw new WorkLogSaveConflictError(currentUpdatedAt ?? "");
            }

            if (
              existingLog &&
              existingLog.keyword === values.keyword &&
              existingLog.content === values.content
            ) {
              return {
                change: "unchanged" as const,
                entry: mapWorkLogRecord(existingLog),
              };
            }

            const changeType = existingLog ? "update" : "create";
            const savedLog = await tx.workLog.upsert({
              where: {
                authorId_workDate: {
                  authorId: user.id,
                  workDate,
                },
              },
              create: {
                authorId: user.id,
                content: values.content,
                keyword: values.keyword,
                workDate,
              },
              update: {
                content: values.content,
                keyword: values.keyword,
                updatedById: user.id,
              },
              select: workLogSelect,
            });

            await tx.auditLog.create({
              data: {
                actorId: user.id,
                ...auditRequestData,
                action: AuditAction.UPDATE_WORK_LOG,
                targetId: savedLog.id,
                targetType: "WorkLog",
                message: `${formatWorkLogDateLabel(values.workDate)} 업무일지를 ${
                  changeType === "update" ? "수정" : "등록"
                }했습니다.`,
                metadata: {
                  changeType: `workLog.${changeType}`,
                  workDate: values.workDate,
                },
              },
            });

            return {
              change: changeType,
              entry: mapWorkLogRecord(savedLog),
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
        break;
      } catch (error) {
        const canRetry =
          attempt < workLogTransactionMaxAttempts - 1 &&
          isRetryableWorkLogTransactionError(error);

        if (!canRetry) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof WorkLogSaveConflictError) {
      return {
        conflictUpdatedAt: error.currentUpdatedAt,
        error:
          "다른 창에서 이 업무일지가 먼저 저장되었습니다. 현재 입력은 유지했습니다. 확인 후 다시 저장하면 현재 내용으로 덮어씁니다.",
        values,
      };
    }

    console.error("Failed to save work log", error);

    return {
      error: "업무일지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      values,
    };
  }

  if (!savedResult) {
    return {
      error: "업무일지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      values,
    };
  }

  if (savedResult.change !== "unchanged") {
    revalidatePath(workLogPath);
  }

  return {
    success:
      savedResult.change === "update"
        ? "업무일지를 수정했습니다."
        : savedResult.change === "create"
          ? "업무일지를 등록했습니다."
          : "변경된 내용이 없습니다.",
    entry: savedResult.entry,
    values,
  };
}

export async function deleteWorkLogAction(
  _previousState: WorkLogDeleteFormState,
  formData: FormData,
): Promise<WorkLogDeleteFormState> {
  const user = await requireUser();
  const workLogId = String(formData.get("workLogId") ?? "").trim();
  const expectedUpdatedAt = String(
    formData.get("expectedUpdatedAt") ?? "",
  ).trim();

  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(workLogId) ||
    !isExactIsoDateTime(expectedUpdatedAt)
  ) {
    return {
      error:
        "삭제할 업무일지 정보를 확인할 수 없습니다. 창을 닫고 다시 시도해 주세요.",
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();
  let deleteResult: WorkLogDeleteResult | null = null;

  try {
    for (let attempt = 0; attempt < workLogTransactionMaxAttempts; attempt += 1) {
      try {
        deleteResult = await prisma.$transaction(
          async (tx) => {
            const existingLog = await tx.workLog.findFirst({
              where: {
                authorId: user.id,
                id: workLogId,
              },
              select: workLogSelect,
            });

            if (!existingLog) {
              return { kind: "missing" as const };
            }

            const entry = mapWorkLogRecord(existingLog);

            if (entry.updatedAt !== expectedUpdatedAt) {
              return { kind: "conflict" as const };
            }

            const deleted = await tx.workLog.deleteMany({
              where: {
                authorId: user.id,
                id: workLogId,
                updatedAt: existingLog.updatedAt,
              },
            });

            if (deleted.count !== 1) {
              throw new WorkLogDeleteRaceError();
            }

            await tx.auditLog.create({
              data: {
                actorId: user.id,
                ...auditRequestData,
                action: AuditAction.UPDATE_WORK_LOG,
                targetId: entry.id,
                targetType: "WorkLog",
                message: `${formatWorkLogDateLabel(entry.workDate)} 업무일지를 삭제했습니다.`,
                metadata: {
                  changeType: "workLog.delete",
                  next: null,
                  previous: {
                    authorName: entry.authorName,
                    createdAt: entry.createdAt,
                    keyword: entry.keyword,
                    updatedAt: entry.updatedAt,
                    updatedByName: entry.updatedByName,
                    workDate: entry.workDate,
                  },
                  source: "work-log",
                  workDate: entry.workDate,
                },
              },
            });

            return { entry, kind: "deleted" as const };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
        break;
      } catch (error) {
        const canRetry =
          attempt < workLogTransactionMaxAttempts - 1 &&
          isRetryableWorkLogTransactionError(error);

        if (!canRetry) {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error("Failed to delete work log", error);

    return {
      error: "업무일지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!deleteResult) {
    return {
      error: "업무일지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (deleteResult.kind === "conflict") {
    return {
      conflict: true,
      error:
        "다른 창에서 이 업무일지가 수정되었습니다. 최신 내용을 확인한 뒤 다시 삭제해 주세요.",
    };
  }

  revalidatePath(workLogPath);

  return {
    deletedId: workLogId,
    success:
      deleteResult.kind === "deleted"
        ? "업무일지를 삭제했습니다."
        : "업무일지가 이미 삭제되었습니다.",
  };
}

class WorkLogSaveConflictError extends Error {
  constructor(readonly currentUpdatedAt: string) {
    super("The work log changed after this form was loaded.");
    this.name = "WorkLogSaveConflictError";
  }
}

class WorkLogDeleteRaceError extends Error {
  constructor() {
    super("The work log changed while it was being deleted.");
    this.name = "WorkLogDeleteRaceError";
  }
}

function isRetryableWorkLogTransactionError(error: unknown) {
  return (
    error instanceof WorkLogDeleteRaceError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034"))
  );
}

function isExactIsoDateTime(value: string) {
  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}
