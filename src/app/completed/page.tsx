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
  getCompletedDocumentPage,
  type CompletedDocumentStatusFilter,
  type DocumentPageSort,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";

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

export default function CompletedPage({
  searchParams,
}: {
  searchParams: Promise<CompletedPageSearchParams>;
}) {
  return (
    <>
      <PageTitle
        title="완료문서함"
        description="승인완료 또는 반려로 처리가 끝난 문서를 확인하는 화면입니다."
      />

      <Suspense fallback={<DocumentPageFallback />}>
        <CompletedDocumentContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CompletedDocumentContent({
  searchParams,
}: {
  searchParams: Promise<CompletedPageSearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const status = normalizeStatus(params.status);
  const sort = normalizeSort(params.sort);
  const dateFrom = normalizeDate(params.dateFrom);
  const dateTo = normalizeDate(params.dateTo);
  const page = normalizePage(params.page);
  const completedPage = await getCompletedDocumentPage(user.id, {
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
        basePath="/completed"
        query={query}
        status={status}
        sort={sort}
        dateFrom={dateFrom}
        dateTo={dateTo}
        total={completedPage.total}
        page={completedPage.page}
        pageSize={pageSize}
        statusOptions={statusOptions}
      />

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
        query={query}
        status={status}
        sort={sort}
        dateFrom={dateFrom}
        dateTo={dateTo}
        page={completedPage.page}
        totalPages={completedPage.totalPages}
      />
    </>
  );
}

function DocumentPageFallback() {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5">
      <p className="text-sm font-semibold text-[#394150]">
        문서 목록을 불러오는 중입니다.
      </p>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#edf1f5]">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[#196b69]" />
      </div>
    </section>
  );
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
