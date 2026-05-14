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
  getInboxDocumentPage,
  type DocumentPageSort,
  type InboxDocumentStatusFilter,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { DocumentResultsSkeleton } from "@/components/route-loading-shell";

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

const getCachedInboxDocumentPage = cache(
  async (
    userId: string,
    query: string,
    status: InboxDocumentStatusFilter,
    sort: DocumentPageSort,
    dateFrom: string,
    dateTo: string,
    page: number,
  ) =>
    getInboxDocumentPage(userId, {
      query,
      status,
      sort,
      dateFrom,
      dateTo,
      page,
      pageSize,
    }),
);

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<InboxPageSearchParams>;
}) {
  const filters = getFilters(await searchParams);

  return (
    <>
      <PageTitle
        title="받은결재함"
        description="현재 로그인한 사용자가 승인 또는 반려해야 할 결재 문서를 모아보는 화면입니다."
      />

      <DocumentListControls
        basePath="/inbox"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        statusOptions={statusOptions}
        summary={
          <Suspense fallback={<DocumentListSummarySkeleton />}>
            <InboxDocumentSummary filters={filters} />
          </Suspense>
        }
      />

      <Suspense fallback={<DocumentResultsSkeleton />}>
        <InboxDocumentContent filters={filters} />
      </Suspense>
    </>
  );
}

async function InboxDocumentContent({
  filters,
}: {
  filters: InboxDocumentFilters;
}) {
  const user = await requireUser();
  const inboxPage = await getCachedInboxDocumentPage(
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
        documents={inboxPage.documents}
        empty={
          <EmptyState
            title={
              hasActiveFilter
                ? "조건에 맞는 결재 문서가 없습니다"
                : "결재 대기 문서가 없습니다"
            }
            description={
              hasActiveFilter
                ? "검색어나 필터를 조정하면 다른 문서를 찾을 수 있습니다."
                : "새로 도착한 결재 요청이 있으면 이곳에 표시됩니다."
            }
          />
        }
      />

      <DocumentPagination
        ariaLabel="받은결재함 페이지"
        basePath="/inbox"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        page={inboxPage.page}
        totalPages={inboxPage.totalPages}
      />
    </>
  );
}

async function InboxDocumentSummary({
  filters,
}: {
  filters: InboxDocumentFilters;
}) {
  const user = await requireUser();
  const inboxPage = await getCachedInboxDocumentPage(
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
      total={inboxPage.total}
      page={inboxPage.page}
      pageSize={pageSize}
    />
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
