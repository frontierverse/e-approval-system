"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireAdmin } from "@/lib/auth";
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

  const update = await prisma.workFeatureUpdate.create({
    data: {
      createdById: admin.id,
      description: description || null,
      title,
    },
    select: {
      id: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      ...(await getCurrentAuditLogRequestData()),
      action: AuditAction.CREATE_WORK_FEATURE_UPDATE,
      targetType: "WorkFeatureUpdate",
      targetId: update.id,
      message: `업무 기능 안내 "${title}"을(를) 등록했습니다.`,
    },
  });

  revalidatePath(homePath);
  redirect(homePath);
}
