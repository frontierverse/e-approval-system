"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isYouthNoteCategory,
  isYouthNotePriority,
  type YouthActionResult,
  type YouthCreateInput,
  type YouthFamilyContactInput,
  type YouthNoteInput,
  type YouthProfile,
  type YouthSpecialNote,
} from "@/lib/youth-management-core";
import {
  mapYouthProfile,
  mapYouthSpecialNote,
} from "@/lib/youth-management";

export async function createYouthAction(
  values: YouthCreateInput,
): Promise<YouthActionResult<{ youth: YouthProfile }>> {
  await requireUser();

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

  const parsedAge = parseOptionalAge(values.age);
  const normalizedPhone = normalizeOptionalPhone(values.phone);
  const normalizedFamilyContacts = normalizeFamilyContacts(
    values.familyContacts,
  );
  const normalizedAdmissionDate = normalizeOptionalDate(values.admissionDate);
  const normalizedDischargeDate = normalizeOptionalDate(values.dischargeDate);

  if (parsedAge.error) {
    return {
      ok: false,
      error: parsedAge.error,
    };
  }

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

  if (normalizedAdmissionDate.error || normalizedDischargeDate.error) {
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
        dischargeDate: normalizedDischargeDate.value,
        age: parsedAge.value,
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

    return {
      ...createdYouth,
      familyContacts,
    };
  });

  revalidatePath("/youth");

  return {
    ok: true,
    data: {
      youth: mapYouthProfile(youth),
    },
  };
}

export async function updateYouthNoteAction(
  noteId: string,
  values: YouthNoteInput,
): Promise<YouthActionResult<{ note: YouthSpecialNote }>> {
  await requireUser();

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
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "수정할 특이사항을 찾을 수 없습니다.",
    };
  }

  const note = await prisma.youthSpecialNote.update({
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

  revalidatePath("/youth");

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
  await requireUser();

  const note = await prisma.youthSpecialNote.findUnique({
    where: {
      id: noteId,
    },
    select: {
      id: true,
      youthId: true,
    },
  });

  if (!note) {
    return {
      ok: false,
      error: "삭제할 특이사항을 찾을 수 없습니다.",
    };
  }

  await prisma.youthSpecialNote.delete({
    where: {
      id: noteId,
    },
  });

  revalidatePath("/youth");

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

function parseOptionalAge(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      value: null,
    };
  }

  const age = Number(trimmed);

  if (!Number.isInteger(age) || age < 0 || age > 150) {
    return {
      error: "나이는 0-150 사이의 숫자로 입력하세요.",
      value: null,
    };
  }

  return {
    value: age,
  };
}

function normalizeOptionalDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      value: null,
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
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
