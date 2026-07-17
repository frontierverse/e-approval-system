"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { getCafeItemChangeLogPage, getCafeItemPage } from "@/lib/cafe-items";
import {
  normalizeCafeItemChangeLogAction,
  formatCafeItemDateValue,
  getCafeItemCategoryLabel,
  getCafeItemToday,
  getCafeItemUsageDday,
  isCafeItemCategory,
  isCafeItemDate,
  normalizeCafeItemCategory,
  normalizeCafeItemDeadlineFilter,
  normalizeCafeItemFormValues,
  normalizeCafeItemPage,
  normalizeCafeItemSort,
  parseCafeItemDateValue,
  type CafeItemActionResult,
  type CafeItemChangeLogPage,
  type CafeItemChangeLogPageFilters,
  type CafeItemExpirationHoldFormState,
  type CafeItemPage,
  type CafeItemPageFilters,
  type CafeItemFormState,
} from "@/lib/cafe-items-core";
import {
  normalizeCafeComplianceNoteContent,
  validateCafeComplianceNoteContent,
  type CafeComplianceNoteFormState,
} from "@/lib/cafe-compliance-notes-core";
import { prisma } from "@/lib/prisma";

const cafeManagementPath = "/work-schedule/cafe";
const cafeItemPageSize = 7;
const cafeItemChangeLogPageSize = 5;
const maxCafeItemNameLength = 100;
const maxCafeItemPurchaseReasonLength = 500;
const maxCafeItemExpirationHoldReasonLength = 500;
const maxCafeItemPriceWon = 999_999_999;
const cafeItemAuditSelect = {
  id: true,
  category: true,
  expirationDate: true,
  expirationHoldReason: true,
  name: true,
  priceWon: true,
  purchaseReason: true,
  purchasedAt: true,
} as const;

type CafeItemAuditRecord = {
  id: string;
  category: string;
  expirationDate: Date | string | null;
  expirationHoldReason: string | null;
  name: string;
  priceWon: number | null;
  purchaseReason: string | null;
  purchasedAt: Date | string;
};

export async function getCafeItemPageAction(
  filters: CafeItemPageFilters,
): Promise<CafeItemActionResult<{ itemPage: CafeItemPage; today: string }>> {
  await requireUser();

  const today = getCafeItemToday();
  const itemPage = await getCafeItemPage({
    category: normalizeCafeItemCategory(filters.category),
    deadline: normalizeCafeItemDeadlineFilter(filters.deadline),
    page: normalizeCafeItemPage(String(filters.page)),
    pageSize: cafeItemPageSize,
    query: filters.query.trim(),
    sort: normalizeCafeItemSort(filters.sort),
    today,
  });

  return {
    ok: true,
    data: {
      itemPage,
      today,
    },
  };
}

export async function getCafeItemChangeLogPageAction(
  filters: CafeItemChangeLogPageFilters,
): Promise<CafeItemActionResult<{ logPage: CafeItemChangeLogPage }>> {
  await requireUser();

  const logPage = await getCafeItemChangeLogPage({
    action: normalizeCafeItemChangeLogAction(filters.action),
    actorId: String(filters.actorId ?? "all").trim() || "all",
    page: normalizeCafeItemPage(String(filters.page)),
    pageSize: cafeItemChangeLogPageSize,
    query: String(filters.query ?? "").trim(),
  });

  return {
    ok: true,
    data: {
      logPage,
    },
  };
}

export async function createCafeItemAction(
  _previousState: CafeItemFormState,
  formData: FormData,
): Promise<CafeItemFormState> {
  const user = await requireUser();

  const values = normalizeCafeItemFormValues(formData);
  const validationError = validateCafeItemValues(values);

  if (validationError) {
    return {
      error: validationError,
      values,
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    const item = await tx.cafeItem.create({
      data: createCafeItemMutationData(values),
      select: cafeItemAuditSelect,
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_CAFE_ITEM,
        targetType: "CafeItem",
        targetId: item.id,
        message: `${item.name} 물품을 등록했습니다.`,
        metadata: createCafeItemAuditMetadata({
          changeType: "create",
          item,
          next: createCafeItemSnapshotFromRecord(item),
          previous: null,
        }),
      },
    });
  });

  revalidatePath(cafeManagementPath);

  return {
    resetKey: `${Date.now()}:${Math.random()}`,
    success: "물품을 등록했습니다.",
  };
}

export async function updateCafeItemAction(
  itemId: string,
  _previousState: CafeItemFormState,
  formData: FormData,
): Promise<CafeItemFormState> {
  const user = await requireUser();

  const values = normalizeCafeItemFormValues(formData);
  const validationError = validateCafeItemValues(values);

  if (validationError) {
    return {
      error: validationError,
      values,
    };
  }

  const existingItem = await prisma.cafeItem.findUnique({
    where: {
      id: itemId,
    },
    select: cafeItemAuditSelect,
  });

  if (!existingItem) {
    return {
      error: "수정할 물품을 찾을 수 없습니다.",
      values,
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    const item = await tx.cafeItem.update({
      where: {
        id: itemId,
      },
      data: {
        ...createCafeItemMutationData(values),
        expirationHoldReason: shouldKeepCafeItemExpirationHold(
          values,
          existingItem.expirationHoldReason,
        )
          ? existingItem.expirationHoldReason
          : null,
      },
      select: cafeItemAuditSelect,
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_CAFE_ITEM,
        targetType: "CafeItem",
        targetId: item.id,
        message: `${item.name} 물품 정보를 수정했습니다.`,
        metadata: createCafeItemAuditMetadata({
          changeType: "update",
          item,
          next: createCafeItemSnapshotFromRecord(item),
          previous: createCafeItemSnapshotFromRecord(existingItem),
        }),
      },
    });
  });

  revalidatePath(cafeManagementPath);

  return {
    resetKey: `${Date.now()}:${Math.random()}`,
    success: "물품 정보를 수정했습니다.",
  };
}

export async function deleteCafeItemAction(itemId: string) {
  const user = await requireUser();

  const existingItem = await prisma.cafeItem.findUnique({
    where: {
      id: itemId,
    },
    select: cafeItemAuditSelect,
  });

  if (!existingItem) {
    revalidatePath(cafeManagementPath);
    return;
  }

  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction(async (tx) => {
    await tx.cafeItem.delete({
      where: {
        id: itemId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_CAFE_ITEM,
        targetType: "CafeItem",
        targetId: existingItem.id,
        message: `${existingItem.name} 물품을 삭제했습니다.`,
        metadata: createCafeItemAuditMetadata({
          changeType: "delete",
          item: existingItem,
          next: null,
          previous: createCafeItemSnapshotFromRecord(existingItem),
        }),
      },
    });
  });

  revalidatePath(cafeManagementPath);
}

export async function holdCafeItemExpirationAction(
  itemId: string,
  _previousState: CafeItemExpirationHoldFormState,
  formData: FormData,
): Promise<CafeItemExpirationHoldFormState> {
  const user = await requireUser();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return {
      error: "보류 사유를 입력하세요.",
      values: { reason },
    };
  }

  if (reason.length > maxCafeItemExpirationHoldReasonLength) {
    return {
      error: `보류 사유는 ${maxCafeItemExpirationHoldReasonLength}자 이하로 입력하세요.`,
      values: { reason },
    };
  }

  const existingItem = await prisma.cafeItem.findUnique({
    where: {
      id: itemId,
    },
    select: cafeItemAuditSelect,
  });

  if (!existingItem) {
    return {
      error: "보류 처리할 물품을 찾을 수 없습니다.",
      values: { reason },
    };
  }

  if (!isExpiredCafeFoodItem(existingItem, getCafeItemToday())) {
    return {
      error: "유통기한이 지난 식품만 보류 처리할 수 있습니다.",
      values: { reason },
    };
  }

  const auditRequestData = await getCurrentAuditLogRequestData();
  const isAlreadyHeld = Boolean(existingItem.expirationHoldReason);

  await prisma.$transaction(async (tx) => {
    const item = await tx.cafeItem.update({
      where: {
        id: itemId,
      },
      data: {
        expirationHoldReason: reason,
      },
      select: cafeItemAuditSelect,
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_CAFE_ITEM,
        targetType: "CafeItem",
        targetId: item.id,
        message: isAlreadyHeld
          ? `${item.name} 물품의 보류 사유를 수정했습니다. 사유: ${reason}`
          : `${item.name} 유통기한 경과 물품을 보류했습니다. 사유: ${reason}`,
        metadata: createCafeItemAuditMetadata({
          changeType: "hold",
          item,
          next: createCafeItemSnapshotFromRecord(item),
          previous: createCafeItemSnapshotFromRecord(existingItem),
        }),
      },
    });
  });

  revalidatePath(cafeManagementPath);

  return {
    success: isAlreadyHeld
      ? "보류 사유를 수정했습니다."
      : "유통기한 경과 물품을 보류했습니다.",
  };
}

export async function createCafeComplianceNoteAction(
  _previousState: CafeComplianceNoteFormState,
  formData: FormData,
): Promise<CafeComplianceNoteFormState> {
  const user = await requireUser();

  const content = normalizeCafeComplianceNoteContent(formData.get("content"));
  const validationError = validateCafeComplianceNoteContent(content);

  if (validationError) {
    return {
      error: validationError,
      values: {
        content,
      },
    };
  }

  await prisma.cafeComplianceNote.create({
    data: {
      content,
      createdById: user.id,
    },
  });

  revalidatePath(cafeManagementPath);

  return {
    resetKey: `${Date.now()}:${Math.random()}`,
    success: "준수사항을 등록했습니다.",
  };
}

export async function deleteCafeComplianceNoteAction(noteId: string) {
  await requireUser();

  await prisma.cafeComplianceNote.deleteMany({
    where: {
      id: noteId,
    },
  });

  revalidatePath(cafeManagementPath);
}

function validateCafeItemValues(
  values: ReturnType<typeof normalizeCafeItemFormValues>,
) {
  if (!values.name) {
    return "물품명을 입력하세요.";
  }

  if (values.name.length > maxCafeItemNameLength) {
    return `물품명은 ${maxCafeItemNameLength}자 이하로 입력하세요.`;
  }

  if (!isCafeItemCategory(values.category)) {
    return "물품 종류를 다시 선택하세요.";
  }

  if (!isCafeItemDate(values.purchasedAt)) {
    return "구매일을 다시 입력하세요.";
  }

  if (values.priceWon && !/^\d+$/.test(values.priceWon)) {
    return "가격은 숫자로 입력하세요.";
  }

  if (values.priceWon && Number(values.priceWon) > maxCafeItemPriceWon) {
    return "가격은 999,999,999원 이하로 입력하세요.";
  }

  if (values.purchaseReason.length > maxCafeItemPurchaseReasonLength) {
    return `구매 사유는 ${maxCafeItemPurchaseReasonLength}자 이하로 입력하세요.`;
  }

  if (values.category === "food" && !values.expirationDate) {
    return "식품은 유통기한을 입력하세요.";
  }

  if (values.expirationDate && !isCafeItemDate(values.expirationDate)) {
    return "유통기한을 다시 입력하세요.";
  }

  return "";
}

function createCafeItemMutationData(
  values: ReturnType<typeof normalizeCafeItemFormValues>,
) {
  return {
    category: values.category,
    expirationDate:
      values.category === "food"
        ? parseCafeItemDateValue(values.expirationDate)
        : null,
    name: values.name,
    priceWon: values.priceWon ? Number(values.priceWon) : null,
    purchaseReason: values.purchaseReason || null,
    purchasedAt: parseCafeItemDateValue(values.purchasedAt),
  };
}

function shouldKeepCafeItemExpirationHold(
  values: ReturnType<typeof normalizeCafeItemFormValues>,
  holdReason: string | null,
) {
  if (!holdReason || values.category !== "food" || !values.expirationDate) {
    return false;
  }

  return getCafeItemUsageDday(
    {
      category: "food",
      expirationDate: values.expirationDate,
      purchasedAt: values.purchasedAt,
    },
    getCafeItemToday(),
  ).status === "expired";
}

function isExpiredCafeFoodItem(item: CafeItemAuditRecord, today: string) {
  if (item.category !== "food" || !item.expirationDate) {
    return false;
  }

  return getCafeItemUsageDday(
    {
      category: "food",
      expirationDate: formatCafeItemDateValue(item.expirationDate),
      purchasedAt: formatCafeItemDateValue(item.purchasedAt),
    },
    today,
  ).status === "expired";
}

function createCafeItemAuditMetadata({
  changeType,
  item,
  next,
  previous,
}: {
  changeType: "create" | "delete" | "hold" | "update";
  item: CafeItemAuditRecord;
  next: ReturnType<typeof createCafeItemSnapshotFromRecord> | null;
  previous: ReturnType<typeof createCafeItemSnapshotFromRecord> | null;
}) {
  return {
    changeType: `cafeItem.${changeType}`,
    itemId: item.id,
    itemName: item.name,
    next,
    nextName: next?.name ?? null,
    previous,
    previousName: previous?.name ?? null,
    source: "cafe-item",
  };
}

function createCafeItemSnapshotFromRecord(item: CafeItemAuditRecord) {
  return {
    category: item.category,
    categoryLabel: getCafeItemCategoryLabel(item.category),
    expirationDate: item.expirationDate
      ? formatCafeItemDateValue(item.expirationDate)
      : null,
    expirationHoldReason: item.expirationHoldReason,
    name: item.name,
    priceWon: item.priceWon,
    purchaseReason: item.purchaseReason,
    purchasedAt: formatCafeItemDateValue(item.purchasedAt),
  };
}
