import Link from "next/link";
import { cache, Suspense } from "react";
import { DocumentList } from "@/components/document-list";
import {
  DocumentListControls,
  DocumentListSummary,
  DocumentListSummarySkeleton,
  DocumentPagination,
  hasDocumentListFilter,
} from "@/components/document-list-controls";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { DocumentResultsSkeleton } from "@/components/route-loading-shell";
import {
  getDraftDocumentPage,
  type DocumentPageSort,
  type DraftDocumentStatusFilter,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type DraftsPageSearchParams = {
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
  { value: "draft", label: "임시저장" },
  { value: "recalled", label: "회수" },
];

type DraftDocumentFilters = {
  query: string;
  status: DraftDocumentStatusFilter;
  sort: DocumentPageSort;
  dateFrom: string;
  dateTo: string;
  page: number;
};

const getCachedDraftDocumentPage = cache(
  async (
    userId: string,
    query: string,
    status: DraftDocumentStatusFilter,
    sort: DocumentPageSort,
    dateFrom: string,
    dateTo: string,
    page: number,
  ) =>
    getDraftDocumentPage(userId, {
      query,
      status,
      sort,
      dateFrom,
      dateTo,
      page,
      pageSize,
    }),
);

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<DraftsPageSearchParams>;
}) {
  const filters = getFilters(await searchParams);

  return (
    <>
      <PageTitle
        title="임시저장함"
        description="작성 중이거나 회수한 문서를 이어서 수정하고 결재 요청합니다."
        action={
          <Link
            href="/drafts/new"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-10 px-4 text-sm",
            )}
          >
            새 기안 작성
          </Link>
        }
      />

      <DocumentListControls
        basePath="/drafts"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        statusOptions={statusOptions}
        summary={
          <Suspense fallback={<DocumentListSummarySkeleton />}>
            <DraftDocumentSummary filters={filters} />
          </Suspense>
        }
      />

      <Suspense fallback={<DocumentResultsSkeleton />}>
        <DraftDocumentContent filters={filters} />
      </Suspense>
    </>
  );
}

async function DraftDocumentContent({
  filters,
}: {
  filters: DraftDocumentFilters;
}) {
  const user = await requireUser();
  const draftPage = await getCachedDraftDocumentPage(
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
        documents={draftPage.documents}
        empty={
          <EmptyState
            title={
              hasActiveFilter
                ? "조건에 맞는 임시저장 문서가 없습니다"
                : "임시저장 문서가 없습니다"
            }
            description={
              hasActiveFilter
                ? "검색어나 필터를 조정하면 다른 문서를 찾을 수 있습니다."
                : "기안을 임시저장하거나 결재 요청을 회수하면 이곳에 표시됩니다."
            }
          />
        }
      />

      <DocumentPagination
        ariaLabel="임시저장함 페이지"
        basePath="/drafts"
        query={filters.query}
        status={filters.status}
        sort={filters.sort}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        page={draftPage.page}
        totalPages={draftPage.totalPages}
      />
    </>
  );
}

async function DraftDocumentSummary({
  filters,
}: {
  filters: DraftDocumentFilters;
}) {
  const user = await requireUser();
  const draftPage = await getCachedDraftDocumentPage(
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
      total={draftPage.total}
      page={draftPage.page}
      pageSize={pageSize}
    />
  );
}

function getFilters(params: DraftsPageSearchParams): DraftDocumentFilters {
  return {
    query: String(params.q ?? "").trim(),
    status: normalizeStatus(params.status),
    sort: normalizeSort(params.sort),
    dateFrom: normalizeDate(params.dateFrom),
    dateTo: normalizeDate(params.dateTo),
    page: normalizePage(params.page),
  };
}

function normalizeStatus(value: string | undefined): DraftDocumentStatusFilter {
  if (value === "draft" || value === "recalled") {
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
