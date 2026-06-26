"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isYouthLearningScheduleDate,
  isYouthNoteCategory,
  isYouthNotePriority,
  type YouthActionResult,
  type YouthCreateInput,
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

export async function createYouthAction(
  values: YouthCreateInput,
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

  const firstFamilyContact = normalizedFamilyContacts.value[0];

  const youth = await prisma.$transaction(async (tx) => {
    const createdYouth = await tx.youth.create({
      data: {
        name: normalizedName,
        admissionDate: normalizedAdmissionDate.value,
        birthDate: normalizedBirthDate.value,
        dischargeDate: normalizedDischargeDate.value,
        age: null,
        phone: normalizedPhone.value,
        familyRelationship: firstFamilyContact?.relationship ?? null,
        familyPhone: firstFamilyContact?.phone ?? null,
        familyContact: firstFamilyContact?.phone ?? null,
      },
      include: {
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
        },
      },
    });

    return {
      ...createdYouth,
      familyContacts,
    };
  });

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

  const firstFamilyContact = normalizedFamilyContacts.value[0];

  const youth = await prisma.$transaction(async (tx) => {
    const updatedYouth = await tx.youth.update({
      where: {
        id: youthId,
      },
      data: {
        name: normalizedName,
        admissionDate: normalizedAdmissionDate.value,
        birthDate: normalizedBirthDate.value,
        dischargeDate: normalizedDischargeDate.value,
        age: null,
        phone: normalizedPhone.value,
        familyRelationship: firstFamilyContact?.relationship ?? null,
        familyPhone: firstFamilyContact?.phone ?? null,
        familyContact: firstFamilyContact?.phone ?? null,
      },
      include: {
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

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "Youth",
        targetId: updatedYouth.id,
        message: `${normalizedName} 청소년 기본 정보를 수정했습니다.`,
        metadata: {
          familyContactCount: familyContacts.length,
          hasPhone: Boolean(normalizedPhone.value),
        },
      },
    });

    return {
      ...updatedYouth,
      familyContacts,
    };
  });

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      youth: mapYouthProfile(youth),
    },
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

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      youthId: existingYouth.id,
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

function revalidateYouthPaths() {
  revalidatePath("/youth");
  revalidatePath("/youth/roster");
  revalidatePath("/youth/learning-progress");
  revalidatePath("/company-info");
}
