import { getKoreanDateValue } from "@/lib/document-archive-policy";

export const cafeItemCategories = [
  { value: "food", label: "식품" },
  { value: "consumable", label: "소모품" },
  { value: "supply", label: "비품" },
  { value: "equipment", label: "장비" },
  { value: "other", label: "기타" },
] as const;

export const cafeItemDeadlineFilters = [
  { value: "all", label: "전체 상태" },
  { value: "expired", label: "유통기한 경과" },
  { value: "dueSoon", label: "유통기한 30일 이내" },
  { value: "over100", label: "구매 100일 이상" },
] as const;

export const cafeItemChangeLogActionFilters = [
  { value: "all", label: "전체 작업" },
  { value: "create", label: "등록" },
  { value: "update", label: "수정" },
  { value: "delete", label: "삭제" },
] as const;

export type CafeItemCategory = (typeof cafeItemCategories)[number]["value"];
export type CafeItemCategoryFilter = "all" | CafeItemCategory;
export type CafeItemDeadlineFilter =
  (typeof cafeItemDeadlineFilters)[number]["value"];
export type CafeItemChangeLogAction =
  Exclude<(typeof cafeItemChangeLogActionFilters)[number]["value"], "all">;
export type CafeItemChangeLogActionFilter =
  (typeof cafeItemChangeLogActionFilters)[number]["value"];

export type CafeItem = {
  id: string;
  name: string;
  category: CafeItemCategory;
  purchasedAt: string;
  priceWon: number | null;
  purchaseReason: string | null;
  expirationDate: string | null;
  createdAt: string;
};

export type CafeItemPageFilters = {
  category: CafeItemCategoryFilter;
  deadline: CafeItemDeadlineFilter;
  page: number;
  query: string;
};

export type CafeItemPage = {
  expiredFoodCount: number;
  filters: CafeItemPageFilters;
  items: CafeItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CafeItemChangeLogActor = {
  id: string;
  name: string;
  email: string | null;
};

export type CafeItemChangeLog = {
  id: string;
  actionType: CafeItemChangeLogAction;
  actor: CafeItemChangeLogActor;
  createdAt: string;
  itemId: string;
  itemName: string;
  message: string;
};

export type CafeItemChangeLogPageFilters = {
  action: CafeItemChangeLogActionFilter;
  actorId: string;
  page: number;
  query: string;
};

export type CafeItemChangeLogPage = {
  actors: CafeItemChangeLogActor[];
  filters: CafeItemChangeLogPageFilters;
  logs: CafeItemChangeLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CafeItemFormValues = {
  category: string;
  expirationDate: string;
  name: string;
  priceWon: string;
  purchaseReason: string;
  purchasedAt: string;
};

export type CafeItemFormState = {
  error?: string;
  resetKey?: string;
  success?: string;
  values?: CafeItemFormValues;
};

export type CafeItemUsageDday = {
  basisLabel: string;
  label: string;
  status: "expired" | "neutral" | "safe" | "soon";
};

export type CafeItemExpirationAlert = {
  ddayLabel: string;
  href: string;
  itemName: string;
};

const dayInMs = 24 * 60 * 60 * 1000;

export function isCafeItemCategory(value: string): value is CafeItemCategory {
  return cafeItemCategories.some((category) => category.value === value);
}

export function isCafeItemDeadlineFilter(
  value: string,
): value is CafeItemDeadlineFilter {
  return cafeItemDeadlineFilters.some((filter) => filter.value === value);
}

export function isCafeItemChangeLogActionFilter(
  value: string,
): value is CafeItemChangeLogActionFilter {
  return cafeItemChangeLogActionFilters.some(
    (filter) => filter.value === value,
  );
}

export function normalizeCafeItemCategory(
  value: string | undefined,
): CafeItemCategoryFilter {
  if (!value || value === "all") {
    return "all";
  }

  return isCafeItemCategory(value) ? value : "all";
}

export function normalizeCafeItemDeadlineFilter(
  value: string | undefined,
): CafeItemDeadlineFilter {
  return value && isCafeItemDeadlineFilter(value) ? value : "all";
}

export function normalizeCafeItemChangeLogAction(
  value: string | undefined,
): CafeItemChangeLogActionFilter {
  return value && isCafeItemChangeLogActionFilter(value) ? value : "all";
}

export function normalizeCafeItemPage(value: string | undefined) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function getCafeItemCategoryLabel(category: string) {
  return (
    cafeItemCategories.find((item) => item.value === category)?.label ??
    "기타"
  );
}

export function getCafeItemChangeLogActionLabel(
  action: CafeItemChangeLogActionFilter,
) {
  return (
    cafeItemChangeLogActionFilters.find((filter) => filter.value === action)
      ?.label ?? "수정"
  );
}

export function isCafeItemDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeCafeItemFormValues(
  formData: FormData,
): CafeItemFormValues {
  return {
    category: String(formData.get("category") ?? ""),
    expirationDate: String(formData.get("expirationDate") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    priceWon: String(formData.get("priceWon") ?? "").trim(),
    purchaseReason: String(formData.get("purchaseReason") ?? "").trim(),
    purchasedAt: String(formData.get("purchasedAt") ?? "").trim(),
  };
}

export function getCafeItemUsageDday(
  item: Pick<CafeItem, "category" | "expirationDate" | "purchasedAt">,
  today = getKoreanDateValue(),
): CafeItemUsageDday {
  if (item.category === "food") {
    if (!item.expirationDate || !isCafeItemDate(item.expirationDate)) {
      return {
        basisLabel: "유통기한 미확인",
        label: "미정",
        status: "neutral",
      };
    }

    const diff = getDateDiffInDays(today, item.expirationDate);

    return {
      basisLabel: "유통기한 기준",
      label: formatTargetDday(diff),
      status: diff < 0 ? "expired" : diff <= 30 ? "soon" : "safe",
    };
  }

  if (!isCafeItemDate(item.purchasedAt)) {
    return {
      basisLabel: "구매일 미확인",
      label: "미정",
      status: "neutral",
    };
  }

  const diff = getDateDiffInDays(item.purchasedAt, today);

  return {
    basisLabel: "구매일 기준",
    label: `D+${Math.max(0, diff)}`,
    status: diff >= 100 ? "soon" : "neutral",
  };
}

export function getCafeItemToday() {
  return getKoreanDateValue();
}

export function createCafeItemDueSoonHref(itemName: string) {
  const params = new URLSearchParams();
  const normalizedItemName = itemName.trim();

  params.set("category", "food");
  params.set("deadline", "dueSoon");

  if (normalizedItemName) {
    params.set("q", normalizedItemName);
  }

  return `/work-schedule/cafe?${params.toString()}`;
}

export function createCafeItemExpiredHref() {
  return "/work-schedule/cafe?category=food&deadline=expired";
}

export function shiftCafeItemDate(value: string, days: number) {
  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
  date.setUTCDate(date.getUTCDate() + days);

  return formatCafeItemDateValue(date);
}

export function formatCafeItemDate(value: string | null) {
  if (!value) {
    return "미입력";
  }

  if (!isCafeItemDate(value)) {
    return value;
  }

  const [year, month, day] = value.split("-");

  return `${year}.${month}.${day}`;
}

function getDateDiffInDays(from: string, to: string) {
  return Math.round(
    (parseCafeItemDateValue(to).getTime() -
      parseCafeItemDateValue(from).getTime()) /
      dayInMs,
  );
}

export function parseCafeItemDateValue(value: string) {
  const [yearText, monthText, dayText] = value.split("-");

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}

export function formatCafeItemDateValue(date: Date | string): string {
  if (typeof date === "string") {
    if (isCafeItemDate(date)) {
      return date;
    }

    const parsedDate = new Date(date);

    return Number.isNaN(parsedDate.getTime())
      ? date
      : formatCafeItemDateValue(parsedDate);
  }

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatTargetDday(diff: number) {
  if (diff === 0) {
    return "D-Day";
  }

  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}
