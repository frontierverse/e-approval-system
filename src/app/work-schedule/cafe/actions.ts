"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  isCafeItemCategory,
  isCafeItemDate,
  normalizeCafeItemFormValues,
  parseCafeItemDateValue,
  type CafeItemFormState,
} from "@/lib/cafe-items-core";
import { prisma } from "@/lib/prisma";

const cafeManagementPath = "/work-schedule/cafe";
const maxCafeItemNameLength = 100;
const maxCafeItemPurchaseReasonLength = 500;
const maxCafeItemPriceWon = 999_999_999;

export async function createCafeItemAction(
  _previousState: CafeItemFormState,
  formData: FormData,
): Promise<CafeItemFormState> {
  await requireUser();

  const values = normalizeCafeItemFormValues(formData);
  const validationError = validateCafeItemValues(values);

  if (validationError) {
    return {
      error: validationError,
      values,
    };
  }

  const priceWon = values.priceWon ? Number(values.priceWon) : null;
  const purchaseReason = values.purchaseReason || null;
  const expirationDate =
    values.category === "food"
      ? parseCafeItemDateValue(values.expirationDate)
      : null;

  await prisma.cafeItem.create({
    data: {
      category: values.category,
      expirationDate,
      name: values.name,
      priceWon,
      purchaseReason,
      purchasedAt: parseCafeItemDateValue(values.purchasedAt),
    },
  });

  revalidatePath(cafeManagementPath);

  return {
    resetKey: `${Date.now()}:${Math.random()}`,
    success: "물품을 등록했습니다.",
  };
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
