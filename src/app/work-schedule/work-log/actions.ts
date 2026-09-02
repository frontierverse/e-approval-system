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
  normalizeWorkLogFormValues,
  parseWorkLogDateValue,
  validateWorkLogFormValues,
  type WorkLogFormState,
} from "@/lib/work-log-core";

const workLogPath = "/work-schedule/work-log";
const workLogTransactionMaxAttempts = 3;

export async function saveWorkLogAction(
  _previousState: WorkLogFormState,
  formData: FormData,
): Promise<WorkLogFormState> {
  const user = await requireUser();
  const values = normalizeWorkLogFormValues(formData);
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
  let savedChange: "create" | "update" | null = null;

  try {
    for (let attempt = 0; attempt < workLogTransactionMaxAttempts; attempt += 1) {
      try {
        savedChange = await prisma.$transaction(
          async (tx) => {
            const existingLog = await tx.workLog.findUnique({
              where: {
                authorId_workDate: {
                  authorId: user.id,
                  workDate,
                },
              },
              select: {
                id: true,
              },
            });
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
              },
              select: {
                id: true,
              },
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

            return changeType;
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
    console.error("Failed to save work log", error);

    return {
      error: "업무일지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      values,
    };
  }

  if (!savedChange) {
    return {
      error: "업무일지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      values,
    };
  }

  revalidatePath(workLogPath);

  return {
    success:
      savedChange === "update"
        ? "업무일지를 수정했습니다."
        : "업무일지를 등록했습니다.",
    values,
  };
}

function isRetryableWorkLogTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}
