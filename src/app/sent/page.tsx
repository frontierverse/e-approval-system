import { cache, Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { DocumentList } from "@/components/document-list";
import {
  DocumentListControls,
  DocumentListSummary,
  DocumentListSummarySkeleton,
  DocumentPagination,
  hasDocumentListFilter,
} from "@/components/document-list-controls";
import { PageTitle } from "@/components/page-title";
import {
  getSentDocumentPage,
  type DocumentPageSort,
  type SentDocumentStatusFilter,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { DocumentResultsSkeleton } from "@/components/route-loading-shell";

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

const getCachedSentDocumentPage = cache(
  async (
    userId: string,
    query: string,
    status: SentDocumentStatusFilter,
    sort: DocumentPageSort,
    dateFrom: string,
    dateTo: string,
    page: number,
  ) =>
    getSentDocumentPage(userId, {
      query,
      status,
      sort,
      dateFrom,
      dateTo,
      page,
      pageSize,
    }),
);

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<SentPageSearchParams>;
}) {
  const filters = getFilters(await searchParams);

  return (
    <>
      <PageTitle
        title="제출 문서함"
        description="내가 작성하고 결재 요청한 문서의 진행 상태를 확인하는 화면입니다."
      />

      <DocumentListControls
        basePath="/sent"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        statusOptions={statusOptions}
        summary={
          <Suspense fallback={<DocumentListSummarySkeleton />}>
            <SentDocumentSummary filters={filters} />
          </Suspense>
        }
      />

      <Suspense fallback={<DocumentResultsSkeleton />}>
        <SentDocumentContent filters={filters} />
      </Suspense>
    </>
  );
}

async function SentDocumentContent({
  filters,
}: {
  filters: SentDocumentFilters;
}) {
  const user = await requireUser();
  const sentPage = await getCachedSentDocumentPage(
    user.id,
    filters.query,
    filters.status,
    filters.sort,
    filters.dateFrom,
    filters.dateTo,
    filters.page,
  );
  const hasActiveFilter = hasDocumentListFilter(
    filters.query,
    filters.status,
    filters.sort,
    filters.dateFrom,
    filters.dateTo,
  );

  return (
    <>
      <DocumentList
        documents={sentPage.documents}
        empty={
          <EmptyState
            title={
              hasActiveFilter
                ? "조건에 맞는 제출 문서가 없습니다"
                : "제출한 문서가 없습니다"
            }
            description={
              hasActiveFilter
                ? "검색어나 필터를 조정하면 다른 문서를 찾을 수 있습니다."
                : "결재 요청한 문서가 생기면 진행 상태와 현재 결재자가 표시됩니다."
            }
          />
        }
      />

      <DocumentPagination
        ariaLabel="제출 문서함 페이지"
        basePath="/sent"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        page={sentPage.page}
        totalPages={sentPage.totalPages}
      />
    </>
  );
}

async function SentDocumentSummary({
  filters,
}: {
  filters: SentDocumentFilters;
}) {
  const user = await requireUser();
  const sentPage = await getCachedSentDocumentPage(
    user.id,
    filters.query,
    filters.status,
    filters.sort,
    filters.dateFrom,
    filters.dateTo,
    filters.page,
  );

  return (
    <DocumentListSummary
      total={sentPage.total}
      page={sentPage.page}
      pageSize={pageSize}
    />
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
