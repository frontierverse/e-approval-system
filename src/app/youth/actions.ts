"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { defaultAllowedAttachmentExtensions } from "@/lib/attachment-policy-core";
import {
  type AttachmentPolicyConfig,
  defaultMaxAttachmentFileSizeMb,
  type PreparedAttachmentFile,
  prepareAttachmentFiles,
  persistAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import {
  isYouthLearningScheduleDate,
  isYouthNoteCategory,
  isYouthNotePriority,
  type YouthActionResult,
  type YouthCreateInput,
  type YouthDischargeExtension,
  type YouthDischargeExtensionInput,
  type YouthFamilyContact,
  youthDecisionDocumentFormFieldName,
  youthDischargeExtensionReasonMaxLength,
  type YouthFamilyContactInput,
  type YouthNoteInput,
  type YouthProfile,
  type YouthSpecialNote,
  type YouthUpdateInput,
} from "@/lib/youth-management-core";
import {
  mapYouthProfile,
  mapYouthSpecialNote,
} from "@/lib/youth-management";
import {
  getYouthRosterChangeLogs,
  type YouthRosterChangeLogsResult,
} from "@/lib/youth-roster";

export async function getYouthRosterChangeLogsAction(
  page: number,
): Promise<YouthActionResult<{ changeLogResult: YouthRosterChangeLogsResult }>> {
  await requireUser();
  const changeLogResult = await getYouthRosterChangeLogs({ page });

  return {
    ok: true,
    data: {
      changeLogResult,
    },
  };
}

// Views of a youth's detail (contacts, family, decision documents) leave no
// trace on their own since all staff can open them, so record who looked. To
// keep volume sane, repeated views of the same youth by the same person within
// this window collapse into a single log entry. These entries stay out of the
// roster change-log feed (not in youthRosterAuditActions) and live only in the
// audit log for accountability.
const youthDetailViewDedupWindowMs = 30 * 60 * 1000;

export async function recordYouthDetailViewAction(
  youthId: string,
): Promise<void> {
  const user = await requireUser();

  const youth = await prisma.youth.findUnique({
    where: {
      id: youthId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!youth) {
    return;
  }

  const recentView = await prisma.auditLog.findFirst({
    where: {
      actorId: user.id,
      action: AuditAction.VIEW_YOUTH_DETAIL,
      targetType: "Youth",
      targetId: youth.id,
      createdAt: {
        gte: new Date(Date.now() - youthDetailViewDedupWindowMs),
      },
    },
    select: {
      id: true,
    },
  });

  if (recentView) {
    return;
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      ...auditRequestData,
      action: AuditAction.VIEW_YOUTH_DETAIL,
      targetType: "Youth",
      targetId: youth.id,
      message: `${youth.name} 청소년의 상세정보를 열람했습니다.`,
      metadata: {
        youthId: youth.id,
      },
    },
  });
}

export async function recordYouthContactViewAction(
  youthId: string,
): Promise<
  YouthActionResult<{
    familyContacts: YouthFamilyContact[];
    phone: string | null;
  }>
> {
  const user = await requireUser();

  const youth = await prisma.youth.findUnique({
    where: {
      id: youthId,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      familyContact: true,
      familyContacts: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          phone: true,
          relationship: true,
        },
      },
      familyPhone: true,
      familyRelationship: true,
    },
  });

  if (!youth) {
    return {
      ok: false,
      error: "연락처를 확인할 청소년을 찾을 수 없습니다.",
    };
  }

  const phone = normalizeBlank(youth.phone);
  const familyContacts = getYouthFamilyContactPayload(youth);
  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      ...auditRequestData,
      action: AuditAction.VIEW_YOUTH_CONTACT,
      targetType: "Youth",
      targetId: youth.id,
      message: `${youth.name} 청소년의 연락처를 열람했습니다.`,
      metadata: {
        youthId: youth.id,
        hasPhone: Boolean(phone),
        familyContactCount: familyContacts.length,
      },
    },
  });

  return {
    ok: true,
    data: {
      familyContacts,
      phone,
    },
  };
}

const youthDecisionDocumentPolicy: AttachmentPolicyConfig = {
  maxFileCount: 5,
  maxFileSizeMb: defaultMaxAttachmentFileSizeMb,
  allowedExtensions: defaultAllowedAttachmentExtensions,
};
const youthDecisionDocumentStorageKeyPrefix = "youth-decision-documents/";

async function prepareYouthDecisionDocuments(
  documentsFormData: FormData | undefined,
) {
  return prepareAttachmentFiles(
    documentsFormData?.getAll(youthDecisionDocumentFormFieldName) ?? [],
    youthDecisionDocumentPolicy,
    {
      storageKeyPrefix: youthDecisionDocumentStorageKeyPrefix,
    },
  );
}

async function createYouthDecisionDocuments(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  youthId: string,
  uploadedById: string,
  files: PreparedAttachmentFile[],
) {
  if (files.length > 0) {
    await tx.youthDecisionDocument.createMany({
      data: files.map((file) => ({
        originalName: file.originalName,
        storageProvider: file.storageProvider,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        size: file.size,
        youthId,
        uploadedById,
      })),
    });
  }

  return tx.youthDecisionDocument.findMany({
    where: {
      youthId,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function cleanupYouthDecisionDocuments(files: PreparedAttachmentFile[]) {
  if (files.length === 0) {
    return;
  }

  await removeStoredAttachmentFiles(
    files.map((file) => ({
      storageProvider: file.storageProvider,
      storageKey: file.storageKey,
    })),
  ).catch(() => undefined);
}

export async function createYouthAction(
  values: YouthCreateInput,
  documentsFormData?: FormData,
): Promise<YouthActionResult<{ youth: YouthProfile }>> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();

  const normalizedName = values.name.trim();

  if (!normalizedName) {
    return {
      ok: false,
      error: "청소년 이름을 입력하세요.",
    };
  }

  const existing = await prisma.youth.findUnique({
    where: {
      name: normalizedName,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return {
      ok: false,
      error: "이미 등록된 청소년 이름입니다.",
    };
  }

  const normalizedBirthDate = normalizeOptionalDate(values.birthDate);
  const normalizedPhone = normalizeOptionalPhone(values.phone);
  const normalizedFamilyContacts = normalizeFamilyContacts(
    values.familyContacts,
  );
  const normalizedAdmissionDate = normalizeOptionalDate(values.admissionDate);
  const normalizedDischargeDate = normalizeOptionalDate(values.dischargeDate);

  if (normalizedPhone.error) {
    return {
      ok: false,
      error: normalizedPhone.error,
    };
  }

  if (normalizedFamilyContacts.error) {
    return {
      ok: false,
      error: normalizedFamilyContacts.error,
    };
  }

  if (
    normalizedAdmissionDate.error ||
    normalizedBirthDate.error ||
    normalizedDischargeDate.error
  ) {
    return {
      ok: false,
      error: "날짜는 YYYY-MM-DD 형식으로 입력하세요.",
    };
  }

  const preparedDocuments =
    await prepareYouthDecisionDocuments(documentsFormData);

  if (preparedDocuments.error) {
    return {
      ok: false,
      error: preparedDocuments.error,
    };
  }

  const firstFamilyContact = normalizedFamilyContacts.value[0];

  await persistAttachmentFiles(preparedDocuments.files);

  let youth;

  try {
    youth = await prisma.$transaction(async (tx) => {
      const createdYouth = await tx.youth.create({
        data: {
          name: normalizedName,
          admissionDate: normalizedAdmissionDate.value,
          birthDate: normalizedBirthDate.value,
          initialDischargeDate: normalizedDischargeDate.value,
          dischargeDate: normalizedDischargeDate.value,
          age: null,
          phone: normalizedPhone.value,
          familyRelationship: firstFamilyContact?.relationship ?? null,
          familyPhone: firstFamilyContact?.phone ?? null,
          familyContact: firstFamilyContact?.phone ?? null,
        },
        include: {
          dischargeExtensions: {
            orderBy: [{ extensionOrder: "asc" }],
            include: {
              processedBy: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          notes: {
            orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
          },
        },
      });

      const familyContacts = normalizedFamilyContacts.value.map(
        (contact, index) => ({
          id: `family-contact-${createdYouth.id}-${index + 1}`,
          youthId: createdYouth.id,
          relationship: contact.relationship,
          phone: contact.phone,
        }),
      );

      for (const contact of familyContacts) {
        await tx.$executeRaw`
          INSERT INTO "YouthFamilyContact" (
            "id",
            "relationship",
            "phone",
            "createdAt",
            "updatedAt",
            "youthId"
          )
          VALUES (
            ${contact.id},
            ${contact.relationship},
            ${contact.phone},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            ${contact.youthId}
          )
        `;
      }

      const decisionDocuments = await createYouthDecisionDocuments(
        tx,
        createdYouth.id,
        user.id,
        preparedDocuments.files,
      );

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.CREATE_YOUTH,
          targetType: "Youth",
          targetId: createdYouth.id,
          message: `${normalizedName} 청소년을 등록했습니다.`,
          metadata: {
            familyContactCount: familyContacts.length,
            hasPhone: Boolean(normalizedPhone.value),
            decisionDocumentCount: preparedDocuments.files.length,
          },
        },
      });

      return {
        ...createdYouth,
        familyContacts,
        decisionDocuments,
      };
    });
  } catch (error) {
    await cleanupYouthDecisionDocuments(preparedDocuments.files);
    throw error;
  }

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      youth: mapYouthProfile(youth),
    },
  };
}

export async function updateYouthAction(
  youthId: string,
  values: YouthUpdateInput,
  documentsFormData?: FormData,
): Promise<YouthActionResult<{ youth: YouthProfile }>> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();

  const normalizedName = values.name.trim();

  if (!normalizedName) {
    return {
      ok: false,
      error: "청소년 이름을 입력하세요.",
    };
  }

  const existingYouth = await prisma.youth.findUnique({
    where: {
      id: youthId,
    },
    select: {
      id: true,
      name: true,
      admissionDate: true,
      birthDate: true,
      initialDischargeDate: true,
      dischargeDate: true,
      phone: true,
      familyContacts: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          relationship: true,
          phone: true,
        },
      },
    },
  });

  if (!existingYouth) {
    return {
      ok: false,
      error: "수정할 청소년을 찾을 수 없습니다.",
    };
  }

  const existingName = await prisma.youth.findUnique({
    where: {
      name: normalizedName,
    },
    select: {
      id: true,
    },
  });

  if (existingName && existingName.id !== youthId) {
    return {
      ok: false,
      error: "이미 등록된 청소년 이름입니다.",
    };
  }

  const normalizedBirthDate = normalizeOptionalDate(values.birthDate);
  const normalizedPhone = normalizeOptionalPhone(values.phone);
  const normalizedFamilyContacts = normalizeFamilyContacts(
    values.familyContacts,
  );
  const normalizedAdmissionDate = normalizeOptionalDate(values.admissionDate);
  const normalizedDischargeDate = normalizeOptionalDate(values.dischargeDate);

  if (normalizedPhone.error) {
    return {
      ok: false,
      error: normalizedPhone.error,
    };
  }

  if (normalizedFamilyContacts.error) {
    return {
      ok: false,
      error: normalizedFamilyContacts.error,
    };
  }

  if (
    normalizedAdmissionDate.error ||
    normalizedBirthDate.error ||
    normalizedDischargeDate.error
  ) {
    return {
      ok: false,
      error: "날짜는 YYYY-MM-DD 형식으로 입력하세요.",
    };
  }

  const originalDischargeDate =
    existingYouth.initialDischargeDate ?? existingYouth.dischargeDate;

  if (normalizedDischargeDate.value !== originalDischargeDate) {
    return {
      ok: false,
      error: "기본 퇴소 예정일은 퇴소 연장 기능으로만 변경할 수 있습니다.",
    };
  }

  const preparedDocuments =
    await prepareYouthDecisionDocuments(documentsFormData);

  if (preparedDocuments.error) {
    return {
      ok: false,
      error: preparedDocuments.error,
    };
  }

  const firstFamilyContact = normalizedFamilyContacts.value[0];

  await persistAttachmentFiles(preparedDocuments.files);

  let youth;

  try {
    youth = await prisma.$transaction(async (tx) => {
      const updatedYouth = await tx.youth.update({
        where: {
          id: youthId,
        },
        data: {
          name: normalizedName,
          admissionDate: normalizedAdmissionDate.value,
          birthDate: normalizedBirthDate.value,
          age: null,
          phone: normalizedPhone.value,
          familyRelationship: firstFamilyContact?.relationship ?? null,
          familyPhone: firstFamilyContact?.phone ?? null,
          familyContact: firstFamilyContact?.phone ?? null,
        },
        include: {
          dischargeExtensions: {
            orderBy: [{ extensionOrder: "asc" }],
            include: {
              processedBy: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          notes: {
            orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
          },
        },
      });

      await tx.$executeRaw`
        DELETE FROM "YouthFamilyContact"
        WHERE "youthId" = ${youthId}
      `;

      const familyContacts = normalizedFamilyContacts.value.map(
        (contact, index) => ({
          id: `family-contact-${youthId}-${index + 1}`,
          youthId,
          relationship: contact.relationship,
          phone: contact.phone,
        }),
      );

      for (const contact of familyContacts) {
        await tx.$executeRaw`
          INSERT INTO "YouthFamilyContact" (
            "id",
            "relationship",
            "phone",
            "createdAt",
            "updatedAt",
            "youthId"
          )
          VALUES (
            ${contact.id},
            ${contact.relationship},
            ${contact.phone},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            ${contact.youthId}
          )
        `;
      }

      const decisionDocuments = await createYouthDecisionDocuments(
        tx,
        youthId,
        user.id,
        preparedDocuments.files,
      );

      const fieldChanges = getYouthFieldChanges(
        {
          name: existingYouth.name,
          admissionDate: existingYouth.admissionDate,
          birthDate: existingYouth.birthDate,
          dischargeDate: existingYouth.dischargeDate,
          phone: existingYouth.phone,
          familyContacts: existingYouth.familyContacts,
        },
        {
          name: normalizedName,
          admissionDate: normalizedAdmissionDate.value,
          birthDate: normalizedBirthDate.value,
          dischargeDate: existingYouth.dischargeDate,
          phone: normalizedPhone.value,
          familyContacts: normalizedFamilyContacts.value,
        },
      );
      const addedDocumentNames = preparedDocuments.files.map(
        (file) => file.originalName,
      );

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ...auditRequestData,
          action: AuditAction.UPDATE_YOUTH,
          targetType: "Youth",
          targetId: updatedYouth.id,
          message: buildYouthUpdateMessage(
            normalizedName,
            fieldChanges,
            addedDocumentNames,
          ),
          metadata: {
            changes: fieldChanges,
            addedDocumentNames,
            familyContactCount: familyContacts.length,
            hasPhone: Boolean(normalizedPhone.value),
            decisionDocumentCount: preparedDocuments.files.length,
          },
        },
      });

      return {
        ...updatedYouth,
        familyContacts,
        decisionDocuments,
      };
    });
  } catch (error) {
    await cleanupYouthDecisionDocuments(preparedDocuments.files);
    throw error;
  }

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      youth: mapYouthProfile(youth),
    },
  };
}

export async function extendYouthDischargeAction(
  youthId: string,
  values: YouthDischargeExtensionInput,
): Promise<
  YouthActionResult<{
    dischargeDate: string;
    extension: YouthDischargeExtension;
    initialDischargeDate: string;
    youthId: string;
  }>
> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();
  const normalizedDischargeDate = normalizeOptionalDate(
    values.extendedDischargeDate,
  );
  const reason = values.reason.trim();

  if (normalizedDischargeDate.error || !normalizedDischargeDate.value) {
    return {
      ok: false,
      error: "연장 퇴소일은 YYYY-MM-DD 형식으로 입력하세요.",
    };
  }

  if (!reason) {
    return {
      ok: false,
      error: "퇴소 연장 사유를 입력하세요.",
    };
  }

  if (reason.length > youthDischargeExtensionReasonMaxLength) {
    return {
      ok: false,
      error: `퇴소 연장 사유는 ${youthDischargeExtensionReasonMaxLength}자 이내로 입력하세요.`,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const youth = await tx.youth.findUnique({
      where: {
        id: youthId,
      },
      select: {
        id: true,
        name: true,
        initialDischargeDate: true,
        dischargeDate: true,
        dischargeExtensions: {
          orderBy: [{ extensionOrder: "asc" }],
          select: {
            extensionOrder: true,
          },
        },
      },
    });

    if (!youth) {
      return {
        error: "수정할 청소년을 찾을 수 없습니다.",
      } as const;
    }

    const currentDischargeDate = youth.dischargeDate;
    const initialDischargeDate =
      youth.initialDischargeDate ?? currentDischargeDate;

    if (!currentDischargeDate || !initialDischargeDate) {
      return {
        error: "기본 퇴소 예정일이 등록된 청소년만 퇴소 연장할 수 있습니다.",
      } as const;
    }

    if (youth.dischargeExtensions.length >= 2) {
      return {
        error: "퇴소 연장은 최대 2회까지만 등록할 수 있습니다.",
      } as const;
    }

    if (normalizedDischargeDate.value <= currentDischargeDate) {
      return {
        error: "연장 퇴소일은 현재 적용 퇴소 예정일보다 뒤여야 합니다.",
      } as const;
    }

    const extensionOrder = youth.dischargeExtensions.length + 1;
    const extension = await tx.youthDischargeExtension.create({
      data: {
        youthId,
        processedById: user.id,
        extensionOrder,
        previousDischargeDate: currentDischargeDate,
        extendedDischargeDate: normalizedDischargeDate.value,
        reason,
      },
      include: {
        processedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await tx.youth.update({
      where: {
        id: youthId,
      },
      data: {
        initialDischargeDate,
        dischargeDate: normalizedDischargeDate.value,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.EXTEND_YOUTH_DISCHARGE,
        targetType: "Youth",
        targetId: youthId,
        message: `${youth.name} 청소년의 퇴소 예정일을 ${extensionOrder}차 연장했습니다.`,
        metadata: {
          extensionOrder,
          previousDischargeDate: currentDischargeDate,
          extendedDischargeDate: normalizedDischargeDate.value,
          reason,
          processedAt: extension.processedAt.toISOString(),
          processedBy: extension.processedBy.name,
        },
      },
    });

    return {
      dischargeDate: normalizedDischargeDate.value,
      extension: {
        id: extension.id,
        extensionOrder: extension.extensionOrder,
        previousDischargeDate: extension.previousDischargeDate,
        extendedDischargeDate: extension.extendedDischargeDate,
        reason: extension.reason,
        processedAt: extension.processedAt.toISOString(),
        processedBy: extension.processedBy,
      },
      initialDischargeDate,
      youthId,
    };
  });

  if ("error" in result && result.error) {
    return {
      ok: false,
      error: result.error,
    };
  }

  revalidateYouthPaths();

  return {
    ok: true,
    data: result,
  };
}

export async function deleteYouthAction(
  youthId: string,
): Promise<YouthActionResult<{ youthId: string }>> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();

  const existingYouth = await prisma.youth.findUnique({
    where: {
      id: youthId,
    },
    select: {
      id: true,
      name: true,
      decisionDocuments: {
        select: {
          storageProvider: true,
          storageKey: true,
        },
      },
    },
  });

  if (!existingYouth) {
    return {
      ok: false,
      error: "삭제할 청소년을 찾을 수 없습니다.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "Youth",
        targetId: existingYouth.id,
        message: `${existingYouth.name} 청소년을 삭제했습니다.`,
        metadata: {
          changeType: "youth.delete",
          previousName: existingYouth.name,
        },
      },
    });

    await tx.youth.delete({
      where: {
        id: existingYouth.id,
      },
    });
  });

  await removeStoredAttachmentFiles(existingYouth.decisionDocuments).catch(
    () => undefined,
  );

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      youthId: existingYouth.id,
    },
  };
}

export async function deleteYouthDecisionDocumentAction(
  documentId: string,
): Promise<YouthActionResult<{ documentId: string; youthId: string }>> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();

  const document = await prisma.youthDecisionDocument.findUnique({
    where: {
      id: documentId,
    },
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      youthId: true,
      youth: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!document) {
    return {
      ok: false,
      error: "삭제할 결정문 파일을 찾을 수 없습니다.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "Youth",
        targetId: document.youthId,
        message: `${document.youth.name} 청소년의 "${document.originalName}" 결정문 파일을 삭제했습니다.`,
        metadata: {
          changeType: "youth.decision-document.delete",
          documentId: document.id,
        },
      },
    });

    await tx.youthDecisionDocument.delete({
      where: {
        id: document.id,
      },
    });
  });

  await removeStoredAttachmentFiles([
    {
      storageProvider: document.storageProvider,
      storageKey: document.storageKey,
    },
  ]).catch(() => undefined);

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      documentId: document.id,
      youthId: document.youthId,
    },
  };
}

export async function updateYouthNoteAction(
  noteId: string,
  values: YouthNoteInput,
): Promise<YouthActionResult<{ note: YouthSpecialNote }>> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();

  const error = validateYouthNoteInput(values);

  if (error) {
    return {
      ok: false,
      error,
    };
  }

  const existing = await prisma.youthSpecialNote.findUnique({
    where: {
      id: noteId,
    },
    select: {
      id: true,
      title: true,
      youth: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "수정할 특이사항을 찾을 수 없습니다.",
    };
  }

  const note = await prisma.$transaction(async (tx) => {
    const updatedNote = await tx.youthSpecialNote.update({
      where: {
        id: noteId,
      },
      data: {
        title: values.title.trim(),
        summary: values.summary.trim(),
        detail: values.detail.trim(),
        category: values.category,
        recordedAt: values.recordedAt,
        author: values.author.trim(),
        priority: values.priority,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH_NOTE,
        targetType: "YouthSpecialNote",
        targetId: noteId,
        message: `${existing.youth.name} 청소년의 "${updatedNote.title}" 특이사항을 수정했습니다.`,
        metadata: {
          youthId: existing.youth.id,
          previousTitle: existing.title,
        },
      },
    });

    return updatedNote;
  });

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      note: mapYouthSpecialNote(note),
    },
  };
}

export async function deleteYouthNoteAction(
  noteId: string,
): Promise<YouthActionResult<{ noteId: string; youthId: string }>> {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();

  const note = await prisma.youthSpecialNote.findUnique({
    where: {
      id: noteId,
    },
    select: {
      id: true,
      title: true,
      youthId: true,
      youth: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!note) {
    return {
      ok: false,
      error: "삭제할 특이사항을 찾을 수 없습니다.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.DELETE_YOUTH_NOTE,
        targetType: "YouthSpecialNote",
        targetId: note.id,
        message: `${note.youth.name} 청소년의 "${note.title}" 특이사항을 삭제했습니다.`,
        metadata: {
          youthId: note.youthId,
        },
      },
    });

    await tx.youthSpecialNote.delete({
      where: {
        id: noteId,
      },
    });
  });

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      noteId: note.id,
      youthId: note.youthId,
    },
  };
}

function validateYouthNoteInput(values: YouthNoteInput) {
  if (!values.title.trim()) {
    return "특이사항 제목을 입력하세요.";
  }

  if (!values.summary.trim()) {
    return "요약을 입력하세요.";
  }

  if (!values.detail.trim()) {
    return "세부사항을 입력하세요.";
  }

  if (!isYouthNoteCategory(values.category)) {
    return "분류를 선택하세요.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.recordedAt)) {
    return "기록일을 선택하세요.";
  }

  if (!values.author.trim()) {
    return "기록자를 입력하세요.";
  }

  if (!isYouthNotePriority(values.priority)) {
    return "중요도를 선택하세요.";
  }

  return "";
}

function getYouthFamilyContactPayload(record: {
  familyContact: string | null;
  familyContacts: Array<{
    id: string;
    phone: string | null;
    relationship: string | null;
  }>;
  familyPhone: string | null;
  familyRelationship: string | null;
  id: string;
}) {
  if (record.familyContacts.length > 0) {
    return record.familyContacts.map((contact) => ({
      id: contact.id,
      phone: normalizeBlank(contact.phone),
      relationship: normalizeBlank(contact.relationship),
    }));
  }

  const legacyPhone =
    normalizeBlank(record.familyPhone) ?? normalizeBlank(record.familyContact);
  const legacyRelationship = normalizeBlank(record.familyRelationship);

  if (!legacyPhone && !legacyRelationship) {
    return [];
  }

  return [
    {
      id: `legacy-family-${record.id}`,
      phone: legacyPhone,
      relationship: legacyRelationship,
    },
  ];
}

function normalizeBlank(value: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeOptionalDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      value: null,
    };
  }

  if (!isYouthLearningScheduleDate(trimmed)) {
    return {
      error: "invalid date",
      value: null,
    };
  }

  return {
    value: trimmed,
  };
}

function normalizeOptionalPhone(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      value: null,
    };
  }

  if (!/^010-\d{3,4}-\d{4}$/.test(trimmed)) {
    return {
      error: "핸드폰 번호는 010-0000-0000 형식으로 입력하세요.",
      value: null,
    };
  }

  return {
    value: trimmed,
  };
}

function normalizeFamilyContacts(values: YouthFamilyContactInput[]): {
  error?: string;
  value: Array<{ relationship: string | null; phone: string | null }>;
} {
  const contacts: Array<{ relationship: string | null; phone: string | null }> =
    [];

  for (const [index, value] of values.entries()) {
    const relationship = value.relationship.trim();
    const normalizedPhone = normalizeOptionalPhone(value.phone);

    if (normalizedPhone.error) {
      return {
        error: `가족 연락처 ${index + 1}번 ${normalizedPhone.error}`,
        value: [],
      };
    }

    if (!relationship && !normalizedPhone.value) {
      continue;
    }

    contacts.push({
      relationship: relationship || null,
      phone: normalizedPhone.value,
    });
  }

  return {
    value: contacts,
  };
}

type YouthFieldSnapshot = {
  name: string;
  admissionDate: string | null;
  birthDate: string | null;
  dischargeDate: string | null;
  phone: string | null;
  familyContacts: Array<{ relationship: string | null; phone: string | null }>;
};

type YouthFieldChange = {
  field: string;
  label: string;
  from: string;
  to: string;
};

function getYouthFieldChanges(
  before: YouthFieldSnapshot,
  after: YouthFieldSnapshot,
): YouthFieldChange[] {
  const changes: YouthFieldChange[] = [];

  pushYouthFieldChange(changes, "name", "이름", before.name, after.name);
  pushYouthFieldChange(
    changes,
    "admissionDate",
    "입소 날짜",
    formatYouthDateForLog(before.admissionDate),
    formatYouthDateForLog(after.admissionDate),
  );
  pushYouthFieldChange(
    changes,
    "birthDate",
    "생년월일",
    formatYouthDateForLog(before.birthDate),
    formatYouthDateForLog(after.birthDate),
  );
  pushYouthFieldChange(
    changes,
    "dischargeDate",
    "퇴소 예정일",
    formatYouthDateForLog(before.dischargeDate),
    formatYouthDateForLog(after.dischargeDate),
  );
  pushYouthFieldChange(
    changes,
    "phone",
    "핸드폰 번호",
    before.phone ?? "미등록",
    after.phone ?? "미등록",
  );
  pushYouthFieldChange(
    changes,
    "familyContacts",
    "가족 연락처",
    formatYouthFamilyContactsForLog(before.familyContacts),
    formatYouthFamilyContactsForLog(after.familyContacts),
  );

  return changes;
}

function pushYouthFieldChange(
  changes: YouthFieldChange[],
  field: string,
  label: string,
  from: string,
  to: string,
) {
  if (from === to) {
    return;
  }

  changes.push({ field, label, from, to });
}

function formatYouthDateForLog(value: string | null) {
  return value ?? "미등록";
}

function formatYouthFamilyContactsForLog(
  contacts: Array<{ relationship: string | null; phone: string | null }>,
) {
  if (contacts.length === 0) {
    return "미등록";
  }

  return contacts
    .map((contact) => {
      const relationship = contact.relationship?.trim() || "관계 미등록";
      const phone = contact.phone?.trim() || "연락처 미등록";

      return `${relationship}(${phone})`;
    })
    .join(", ");
}

function buildYouthUpdateMessage(
  name: string,
  changes: YouthFieldChange[],
  addedDocumentNames: string[],
) {
  const lines = [`${name} 청소년 기본 정보를 수정했습니다.`];

  for (const change of changes) {
    lines.push(`- ${change.label}: ${change.from} → ${change.to}`);
  }

  if (addedDocumentNames.length > 0) {
    lines.push(`- 결정문 파일 추가: ${addedDocumentNames.join(", ")}`);
  }

  if (changes.length === 0 && addedDocumentNames.length === 0) {
    lines.push("- 변경된 항목이 없습니다.");
  }

  return lines.join("\n");
}

function revalidateYouthPaths() {
  revalidatePath("/youth");
  revalidatePath("/youth/roster");
  revalidatePath("/youth/learning-progress");
  revalidatePath("/company-info");
}
