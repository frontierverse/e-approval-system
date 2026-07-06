export const cafeComplianceNoteMaxLength = 2000;

export type CafeComplianceNote = {
  content: string;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  } | null;
  id: string;
};

export type CafeComplianceNotePage = {
  notes: CafeComplianceNote[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CafeComplianceNoteFormState = {
  error?: string;
  resetKey?: string;
  success?: string;
  values?: {
    content: string;
  };
};

export function normalizeCafeComplianceNoteContent(value: unknown) {
  return String(value ?? "").trim();
}

export function validateCafeComplianceNoteContent(content: string) {
  if (!content) {
    return "준수사항 내용을 입력하세요.";
  }

  if (content.length > cafeComplianceNoteMaxLength) {
    return `준수사항은 ${cafeComplianceNoteMaxLength}자 이하로 입력하세요.`;
  }

  return "";
}

export function normalizeCafeComplianceNotePage(value: string | undefined) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function createCafeCompliancePageHref(page: number) {
  const params = new URLSearchParams({ tab: "compliance" });

  if (page > 1) {
    params.set("notePage", String(page));
  }

  return `/work-schedule/cafe?${params.toString()}`;
}
