import { EmptyState } from "@/components/empty-state";
import { DocumentList } from "@/components/document-list";
import {
  DocumentListControls,
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
  { value: "draft", label: "임시저장" },
  { value: "submitted", label: "결재 요청" },
  { value: "in_progress", label: "진행중" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
  { value: "recalled", label: "회수" },
];

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<SentPageSearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const status = normalizeStatus(params.status);
  const sort = normalizeSort(params.sort);
  const dateFrom = normalizeDate(params.dateFrom);
  const dateTo = normalizeDate(params.dateTo);
  const page = normalizePage(params.page);
  const sentPage = await getSentDocumentPage(user.id, {
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
      <PageTitle
        title="제출 문서함"
        description="내가 작성하고 결재 요청한 문서의 진행 상태를 확인하는 화면입니다."
      />

      <DocumentListControls
        basePath="/sent"
        query={query}
        status={status}
        sort={sort}
        dateFrom={dateFrom}
        dateTo={dateTo}
        total={sentPage.total}
        page={sentPage.page}
        pageSize={pageSize}
        statusOptions={statusOptions}
      />

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
        query={query}
        status={status}
        sort={sort}
        dateFrom={dateFrom}
        dateTo={dateTo}
        page={sentPage.page}
        totalPages={sentPage.totalPages}
      />
    </>
  );
}

function normalizeStatus(value: string | undefined): SentDocumentStatusFilter {
  if (
    value === "draft" ||
    value === "submitted" ||
    value === "in_progress" ||
    value === "approved" ||
    value === "rejected" ||
    value === "recalled"
  ) {
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
