import { DocumentPageSection } from "@/components/document-page-section";
import { PageTitle } from "@/components/page-title";
import { getCompletedDocumentPageAction } from "@/app/document-list-actions";
import {
  getCompletedDocumentPage,
  type CompletedDocumentArchiveReviewFilter,
  type CompletedDocumentStatusFilter,
  type DocumentPageSort,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { hasDocumentListFilter } from "@/lib/document-list-filters";

type CompletedPageSearchParams = {
  q?: string;
  status?: string;
  sort?: string;
  dateFrom?: string;
  dateTo?: string;
  archiveReview?: string;
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
  archiveReview: CompletedDocumentArchiveReviewFilter;
  todayDate: string;
  page: number;
};

export default async function CompletedPage({
  searchParams,
}: {
  searchParams: Promise<CompletedPageSearchParams>;
}) {
  const filters = getFilters(await searchParams);
  const user = await requireUser();
  const completedPage = await getCompletedDocumentPage(user.id, {
    query: filters.query,
    status: filters.status,
    sort: filters.sort,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    archiveReview: filters.archiveReview,
    page: filters.page,
    pageSize,
  });
  const archiveReviewParams = getArchiveReviewParams(filters);
  const isArchiveReviewFilter = filters.archiveReview === "review";
  const isTodayArchiveReview = isTodayArchiveReviewFilter(filters);
  const hasActiveFilter =
    hasDocumentListFilter(
      filters.query,
      filters.status,
      filters.sort,
      filters.dateFrom,
      filters.dateTo,
    ) || filters.archiveReview !== "none";

  return (
    <>
      <PageTitle
        title={isArchiveReviewFilter ? "보관 검토 목록" : "완료문서함"}
        description={
          isArchiveReviewFilter
            ? isTodayArchiveReview
              ? "오늘 보관 검토가 필요한 문서를 확인합니다."
              : "선택한 날짜 기준으로 보관 검토가 필요한 문서를 확인합니다."
            : "승인완료 또는 반려로 처리가 끝난 문서를 확인합니다."
        }
      />

      <DocumentPageSection
        key={[
          filters.query,
          filters.status,
          filters.sort,
          filters.dateFrom,
          filters.dateTo,
          filters.archiveReview,
          completedPage.page,
        ].join(":")}
        ariaLabel="완료문서함 페이지"
        basePath="/completed"
        documentPage={completedPage}
        emptyDescription={
          filters.archiveReview === "review"
            ? isTodayArchiveReview
              ? "오늘 보관 검토가 필요한 문서가 생기면 여기에 표시됩니다."
              : "선택한 날짜에 보관 검토가 필요한 문서가 생기면 여기에 표시됩니다."
            : hasActiveFilter
            ? "검색어나 필터를 조정하면 다른 문서를 찾을 수 있습니다."
            : "처리가 끝난 문서가 생기면 최종 상태와 처리일이 표시됩니다."
        }
        emptyTitle={
          filters.archiveReview === "review"
            ? isTodayArchiveReview
              ? "오늘 보관 검토 문서가 없습니다"
              : "보관 검토 문서가 없습니다"
            : hasActiveFilter
            ? "조건에 맞는 완료 문서가 없습니다"
            : "완료한 문서가 없습니다"
        }
        extraParamNames={["archiveReview"]}
        filters={{
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          extraParams: archiveReviewParams,
          page: filters.page,
          query: filters.query,
          sort: filters.sort,
          status: filters.status,
        }}
        loadPage={getCompletedDocumentPageAction}
        statusOptions={statusOptions}
        summaryBadgeLabel={
          filters.archiveReview === "review"
            ? isTodayArchiveReview
              ? "오늘 보관 검토"
              : "보관 검토"
            : undefined
        }
      />
    </>
  );
}

function getFilters(
  params: CompletedPageSearchParams,
): CompletedDocumentFilters {
  const archiveReview = normalizeArchiveReview(params.archiveReview);
  const todayDate = getKoreanDateValue();
  const dateFrom = normalizeDate(params.dateFrom);
  const dateTo = normalizeDate(params.dateTo);
  const shouldDefaultArchiveReviewDates =
    archiveReview === "review" && !dateFrom && !dateTo;

  return {
    query: String(params.q ?? "").trim(),
    status: normalizeStatus(params.status),
    sort: normalizeSort(params.sort),
    dateFrom: shouldDefaultArchiveReviewDates ? todayDate : dateFrom,
    dateTo: shouldDefaultArchiveReviewDates ? todayDate : dateTo,
    archiveReview,
    todayDate,
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

function normalizeArchiveReview(
  value: string | undefined,
): CompletedDocumentArchiveReviewFilter {
  return value === "review" || value === "today" ? "review" : "none";
}

function getArchiveReviewParams(filters: CompletedDocumentFilters) {
  return filters.archiveReview === "review"
    ? {
        archiveReview: "review",
      }
    : undefined;
}

function isTodayArchiveReviewFilter(filters: CompletedDocumentFilters) {
  return (
    filters.archiveReview === "review" &&
    filters.dateFrom === filters.todayDate &&
    filters.dateTo === filters.todayDate
  );
}
