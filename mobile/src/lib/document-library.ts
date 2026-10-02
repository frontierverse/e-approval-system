export type DocumentFolder = "sent" | "completed" | "drafts";
export type DocumentLibraryFilters = {
  folder: DocumentFolder;
  status: string;
  query: string;
  dateFrom: string;
  dateTo: string;
  sort: "latest" | "oldest";
  page: number;
};
export type LibraryDocument = {
  id: string;
  title: string;
  documentNo: string;
  category: string;
  status: string;
  drafterName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  completedAt: string | null;
  attachmentCount: number;
  currentApproverName: string | null;
};
export type DocumentLibraryPage = {
  folder: DocumentFolder;
  documents: LibraryDocument[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
export const documentFolders: { value: DocumentFolder; label: string }[] = [
  { value: "sent", label: "제출 문서" }, { value: "completed", label: "완료 문서" }, { value: "drafts", label: "기안함" },
];
export const documentStatuses = {
  sent: [{ value: "all", label: "전체" }, { value: "active", label: "진행 중" }, { value: "approved", label: "승인" }, { value: "rejected", label: "반려" }],
  completed: [{ value: "all", label: "전체" }, { value: "approved", label: "승인" }, { value: "rejected", label: "반려" }],
  drafts: [{ value: "all", label: "전체" }, { value: "draft", label: "임시저장" }, { value: "recalled", label: "회수" }],
};
export const documentStatusLabels: Record<string, string> = {
  submitted: "상신", in_progress: "결재 중", approved: "승인", rejected: "반려", draft: "임시저장", recalled: "회수",
};
export function documentLibraryPath(filters: DocumentLibraryFilters) {
  const params = new URLSearchParams({ folder: filters.folder, status: filters.status, sort: filters.sort, page: String(filters.page) });
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return `/documents?${params}`;
}
export function documentPeriodError(from: string, to: string): string | null {
  for (const date of [from, to]) {
    if (!date) continue;
    const value = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
      return "기간은 실제 날짜를 YYYY-MM-DD 형식으로 입력하세요.";
    }
  }
  return from && to && from > to ? "시작일은 종료일보다 늦을 수 없습니다." : null;
}

export function formatDocumentDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
