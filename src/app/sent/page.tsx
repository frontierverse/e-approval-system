import { DocumentPageSection } from "@/components/document-page-section";
import { PageTitle } from "@/components/page-title";
import { getSentDocumentPageAction } from "@/app/document-list-actions";
import {
  getSentDocumentPage,
  type DocumentPageSort,
  type SentDocumentStatusFilter,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { hasDocumentListFilter } from "@/lib/document-list-filters";

type SentPageSearchParams = {
  q?: string;
  status?: string;
  sort?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
};

const pageSize = 8;
const statusOptions = [
  { value: "all", label: "전체" },
  { value: "active", label: "진행중" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
];

type SentDocumentFilters = {
  query: string;
  status: SentDocumentStatusFilter;
  sort: DocumentPageSort;
  dateFrom: string;
  dateTo: string;
  page: number;
};

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<SentPageSearchParams>;
}) {
  const filters = getFilters(await searchParams);
  const user = await requireUser();
  const sentPage = await getSentDocumentPage(user.id, {
    query: filters.query,
    status: filters.status,
    sort: filters.sort,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    page: filters.page,
    pageSize,
  });
  const hasActiveFilter = hasDocumentListFilter(
    filters.query,
    filters.status,
    filters.sort,
    filters.dateFrom,
    filters.dateTo,
  );

  return (
    <>
      <PageTitle
        title="제출 문서함"
        description="내가 작성하고 결재 요청한 문서의 진행 상태를 확인합니다."
      />

      <DocumentPageSection
        key={[
          filters.query,
          filters.status,
          filters.sort,
          filters.dateFrom,
          filters.dateTo,
          sentPage.page,
        ].join(":")}
        ariaLabel="제출 문서함 페이지"
        basePath="/sent"
        documentPage={sentPage}
        emptyDescription={
          hasActiveFilter
            ? "검색어나 필터를 조정하면 다른 문서를 찾을 수 있습니다."
            : "결재 요청한 문서가 생기면 진행 상태와 현재 결재자가 표시됩니다."
        }
        emptyTitle={
          hasActiveFilter
            ? "조건에 맞는 제출 문서가 없습니다"
            : "제출한 문서가 없습니다"
        }
        filters={filters}
        loadPage={getSentDocumentPageAction}
        statusOptions={statusOptions}
      />
    </>
  );
}

function getFilters(params: SentPageSearchParams): SentDocumentFilters {
  return {
    query: String(params.q ?? "").trim(),
    status: normalizeStatus(params.status),
    sort: normalizeSort(params.sort),
    dateFrom: normalizeDate(params.dateFrom),
    dateTo: normalizeDate(params.dateTo),
    page: normalizePage(params.page),
  };
}

function normalizeStatus(value: string | undefined): SentDocumentStatusFilter {
  if (
    value === "active" ||
    value === "submitted" ||
    value === "in_progress" ||
    value === "approved" ||
    value === "rejected"
  ) {
    return value === "submitted" || value === "in_progress" ? "active" : value;
  }

  return "all";
}

function normalizeSort(value: string | undefined): DocumentPageSort {
  return value === "oldest" ? "oldest" : "latest";
}

function normalizePage(value: string | undefined) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
