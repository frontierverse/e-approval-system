"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireAdmin } from "@/lib/auth";
import { queueStaffPushEvent } from "@/lib/mobile-push-events";
import { prisma } from "@/lib/prisma";

const homePath = "/";

export type WorkFeatureUpdateFormState = {
  error?: string;
  success?: string;
  values?: {
    description?: string;
    title?: string;
  };
};

export async function createWorkFeatureUpdateAction(
  _state: WorkFeatureUpdateFormState,
  formData: FormData,
): Promise<WorkFeatureUpdateFormState> {
  const admin = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const values = {
    description,
    title,
  };

  if (!title) {
    return {
      error: "기능명을 입력해 주세요.",
      values,
    };
  }

  if (title.length > 100) {
    return {
      error: "기능명은 100자 이하로 입력해 주세요.",
      values,
    };
  }

  if (description.length > 500) {
    return {
      error: "설명은 500자 이하로 입력해 주세요.",
      values,
    };
  }

  const requestData = await getCurrentAuditLogRequestData();
  await prisma.$transaction(async tx => {
  const update = await tx.workFeatureUpdate.create({
    data: {
      createdById: admin.id,
      description: description || null,
      title,
    },
    select: {
      id: true,
    },
  });

  await tx.auditLog.create({
    data: {
      actorId: admin.id,
      ...requestData,
      action: AuditAction.CREATE_WORK_FEATURE_UPDATE,
      targetType: "WorkFeatureUpdate",
      targetId: update.id,
      message: `업무 기능 안내 "${title}"을(를) 등록했습니다.`,
    },
  });

  await queueStaffPushEvent(tx, { eventKey: `feature:${update.id}`, kind: "FEATURE_UPDATE", targetId: update.id, actorId: admin.id });
  });

  revalidatePath(homePath);
  redirect(homePath);
}
