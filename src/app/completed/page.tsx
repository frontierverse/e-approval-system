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
  getCompletedDocumentPage,
  type CompletedDocumentStatusFilter,
  type DocumentPageSort,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { DocumentResultsSkeleton } from "@/components/route-loading-shell";

type CompletedPageSearchParams = {
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
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
];

type CompletedDocumentFilters = {
  query: string;
  status: CompletedDocumentStatusFilter;
  sort: DocumentPageSort;
  dateFrom: string;
  dateTo: string;
  page: number;
};

const getCachedCompletedDocumentPage = cache(
  async (
    userId: string,
    query: string,
    status: CompletedDocumentStatusFilter,
    sort: DocumentPageSort,
    dateFrom: string,
    dateTo: string,
    page: number,
  ) =>
    getCompletedDocumentPage(userId, {
      query,
      status,
      sort,
      dateFrom,
      dateTo,
      page,
      pageSize,
    }),
);

export default async function CompletedPage({
  searchParams,
}: {
  searchParams: Promise<CompletedPageSearchParams>;
}) {
  const filters = getFilters(await searchParams);

  return (
    <>
      <PageTitle
        title="완료문서함"
        description="승인완료 또는 반려로 처리가 끝난 문서를 확인하는 화면입니다."
      />

      <DocumentListControls
        basePath="/completed"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        statusOptions={statusOptions}
        summary={
          <Suspense fallback={<DocumentListSummarySkeleton />}>
            <CompletedDocumentSummary filters={filters} />
          </Suspense>
        }
      />

      <Suspense fallback={<DocumentResultsSkeleton />}>
        <CompletedDocumentContent filters={filters} />
      </Suspense>
    </>
  );
}

async function CompletedDocumentContent({
  filters,
}: {
  filters: CompletedDocumentFilters;
}) {
  const user = await requireUser();
  const completedPage = await getCachedCompletedDocumentPage(
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
        documents={completedPage.documents}
        empty={
          <EmptyState
            title={
              hasActiveFilter
                ? "조건에 맞는 완료 문서가 없습니다"
                : "완료된 문서가 없습니다"
            }
            description={
              hasActiveFilter
                ? "검색어나 필터를 조정하면 다른 문서를 찾을 수 있습니다."
                : "처리가 끝난 문서가 생기면 최종 상태와 처리일이 표시됩니다."
            }
          />
        }
      />

      <DocumentPagination
        ariaLabel="완료문서함 페이지"
        basePath="/completed"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        page={completedPage.page}
        totalPages={completedPage.totalPages}
      />
    </>
  );
}

async function CompletedDocumentSummary({
  filters,
}: {
  filters: CompletedDocumentFilters;
}) {
  const user = await requireUser();
  const completedPage = await getCachedCompletedDocumentPage(
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
      total={completedPage.total}
      page={completedPage.page}
      pageSize={pageSize}
    />
  );
}

function getFilters(
  params: CompletedPageSearchParams,
): CompletedDocumentFilters {
  return {
    query: String(params.q ?? "").trim(),
    status: normalizeStatus(params.status),
    sort: normalizeSort(params.sort),
    dateFrom: normalizeDate(params.dateFrom),
    dateTo: normalizeDate(params.dateTo),
    page: normalizePage(params.page),
  };
}

function normalizeStatus(
  value: string | undefined,
): CompletedDocumentStatusFilter {
  if (value === "approved" || value === "rejected") {
    return value;
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
