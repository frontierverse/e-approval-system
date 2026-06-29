import { DocumentPageSection } from "@/components/document-page-section";
import { hasDocumentListFilter } from "@/components/document-list-controls";
import { PageTitle } from "@/components/page-title";
import { getInboxDocumentPageAction } from "@/app/document-list-actions";
import {
  getInboxDocumentPage,
  type DocumentPageSort,
  type InboxDocumentStatusFilter,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";

type InboxPageSearchParams = {
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
];

type InboxDocumentFilters = {
  query: string;
  status: InboxDocumentStatusFilter;
  sort: DocumentPageSort;
  dateFrom: string;
  dateTo: string;
  page: number;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<InboxPageSearchParams>;
}) {
  const filters = getFilters(await searchParams);
  const user = await requireUser();
  const inboxPage = await getInboxDocumentPage(user.id, {
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
        title="받은 결재함"
        description="현재 로그인한 사용자가 승인 또는 반려해야 할 결재 문서를 모아봅니다."
      />

      <DocumentPageSection
        key={[
          filters.query,
          filters.status,
          filters.sort,
          filters.dateFrom,
          filters.dateTo,
          inboxPage.page,
        ].join(":")}
        ariaLabel="받은 결재함 페이지"
        basePath="/inbox"
        documentPage={inboxPage}
        emptyDescription={
          hasActiveFilter
            ? "검색어나 필터를 조정하면 다른 문서를 찾을 수 있습니다."
            : "새로 도착한 결재 요청이 있으면 여기에 표시됩니다."
        }
        emptyTitle={
          hasActiveFilter
            ? "조건에 맞는 결재 문서가 없습니다"
            : "결재 대기 문서가 없습니다"
        }
        filters={filters}
        loadPage={getInboxDocumentPageAction}
        statusOptions={statusOptions}
      />
    </>
  );
}

function getFilters(params: InboxPageSearchParams): InboxDocumentFilters {
  return {
    query: String(params.q ?? "").trim(),
    status: normalizeStatus(params.status),
    sort: normalizeSort(params.sort),
    dateFrom: normalizeDate(params.dateFrom),
    dateTo: normalizeDate(params.dateTo),
    page: normalizePage(params.page),
  };
}

function normalizeStatus(value: string | undefined): InboxDocumentStatusFilter {
  if (value === "active" || value === "submitted" || value === "in_progress") {
    return "active";
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
