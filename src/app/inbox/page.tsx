import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { DocumentList } from "@/components/document-list";
import {
  DocumentListControls,
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
import { RouteContentSkeleton } from "@/components/route-loading-shell";

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
  { value: "submitted", label: "결재 요청" },
  { value: "in_progress", label: "진행중" },
];

export default function InboxPage({
  searchParams,
}: {
  searchParams: Promise<InboxPageSearchParams>;
}) {
  return (
    <>
      <PageTitle
        title="받은결재함"
        description="현재 로그인한 사용자가 승인 또는 반려해야 할 결재 문서를 모아보는 화면입니다."
      />

      <Suspense fallback={<RouteContentSkeleton variant="document" />}>
        <InboxDocumentContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InboxDocumentContent({
  searchParams,
}: {
  searchParams: Promise<InboxPageSearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const status = normalizeStatus(params.status);
  const sort = normalizeSort(params.sort);
  const dateFrom = normalizeDate(params.dateFrom);
  const dateTo = normalizeDate(params.dateTo);
  const page = normalizePage(params.page);
  const inboxPage = await getInboxDocumentPage(user.id, {
    query,
    status,
    sort,
    dateFrom,
    dateTo,
    page,
    pageSize,
  });
  const hasActiveFilter = hasDocumentListFilter(
    query,
    status,
    sort,
    dateFrom,
    dateTo,
  );

  return (
    <>
      <DocumentListControls
        basePath="/inbox"
        query={query}
        status={status}
        sort={sort}
        dateFrom={dateFrom}
        dateTo={dateTo}
        total={inboxPage.total}
        page={inboxPage.page}
        pageSize={pageSize}
        statusOptions={statusOptions}
      />

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
        query={query}
        status={status}
        sort={sort}
        dateFrom={dateFrom}
        dateTo={dateTo}
        page={inboxPage.page}
        totalPages={inboxPage.totalPages}
      />
    </>
  );
}

function normalizeStatus(value: string | undefined): InboxDocumentStatusFilter {
  if (value === "submitted" || value === "in_progress") {
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
