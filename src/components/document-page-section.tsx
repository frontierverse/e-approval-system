"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { DocumentList } from "@/components/document-list";
import {
  DocumentListControls,
  DocumentListSummary,
  DocumentPagination,
  getDocumentListHref,
} from "@/components/document-list-controls";
import { EmptyState } from "@/components/empty-state";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { DocumentListStatusOption } from "@/components/document-list-filter-controls";
import type { ApprovalDocument } from "@/lib/mock-data";

type DocumentPageFilters = {
  dateFrom: string;
  dateTo: string;
  extraParams?: Record<string, string>;
  page: number;
  query: string;
  sort: string;
  status: string;
};

type DocumentPageData = {
  documents: ApprovalDocument[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type DocumentPageActionResult = Promise<
  | {
      ok: true;
      data: {
        documentPage: DocumentPageData;
      };
    }
  | { ok: false; error: string }
>;

type DocumentPageSectionProps = {
  ariaLabel: string;
  basePath: string;
  documentPage: DocumentPageData;
  emptyDescription: string;
  emptyTitle: string;
  extraParamNames?: string[];
  filters: DocumentPageFilters;
  loadPage: (filters: DocumentPageFilters) => DocumentPageActionResult;
  searchPlaceholder?: string;
  statusOptions: DocumentListStatusOption[];
  summaryBadgeLabel?: string;
};

export function DocumentPageSection({
  ariaLabel,
  basePath,
  documentPage,
  emptyDescription,
  emptyTitle,
  filters,
  extraParamNames = Object.keys(filters.extraParams ?? {}),
  loadPage,
  searchPlaceholder,
  statusOptions,
  summaryBadgeLabel,
}: DocumentPageSectionProps) {
  const [pageState, setPageState] = useState({
    documentPage,
    filters,
  });
  const [pageError, setPageError] = useState("");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [isPagePending, startPageTransition] = useTransition();

  const loadDocumentPage = useCallback(
    (
      nextPage: number,
      options?: {
        filters?: DocumentPageFilters;
        updateHistory?: boolean;
      },
    ) => {
      const nextFilters = {
        ...pageState.filters,
        ...(options?.filters ?? {}),
        page: nextPage,
      };
      const updateHistory = options?.updateHistory ?? true;

      setPendingPage(nextPage);
      startPageTransition(async () => {
        try {
          const result = await loadPage(nextFilters);

          if (!result.ok) {
            setPageError(result.error);
            return;
          }

          const { documentPage: nextDocumentPage } = result.data;
          const normalizedFilters = {
            ...nextFilters,
            page: nextDocumentPage.page,
          };

          setPageState({
            documentPage: nextDocumentPage,
            filters: normalizedFilters,
          });
          setPageError("");

          if (updateHistory) {
            window.history.pushState(
              { documentListPage: nextDocumentPage.page },
              "",
              getDocumentListHref({
                basePath,
                dateFrom: normalizedFilters.dateFrom,
                dateTo: normalizedFilters.dateTo,
                extraParams: normalizedFilters.extraParams,
                page: nextDocumentPage.page,
                query: normalizedFilters.query,
                sort: normalizedFilters.sort,
                status: normalizedFilters.status,
              }),
            );
          }
        } finally {
          setPendingPage(null);
        }
      });
    },
    [basePath, loadPage, pageState.filters],
  );

  useEffect(() => {
    function loadFromHistory() {
      if (window.location.pathname !== basePath) {
        return;
      }

      const nextFilters = getDocumentFiltersFromLocation(extraParamNames);

      loadDocumentPage(nextFilters.page, {
        filters: nextFilters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [basePath, extraParamNames, loadDocumentPage]);

  const currentFilters = pageState.filters;
  const currentPage = pageState.documentPage;
  const hasActiveFilters = Boolean(
    currentFilters.query ||
      currentFilters.dateFrom ||
      currentFilters.dateTo ||
      currentFilters.status !== "all" ||
      currentFilters.sort !== "latest" ||
      Object.values(currentFilters.extraParams ?? {}).some(Boolean),
  );

  return (
    <>
      <DocumentListControls
        basePath={basePath}
        dateFrom={currentFilters.dateFrom}
        dateTo={currentFilters.dateTo}
        extraParams={currentFilters.extraParams}
        query={currentFilters.query}
        searchPlaceholder={searchPlaceholder}
        sort={currentFilters.sort}
        status={currentFilters.status}
        statusOptions={statusOptions}
        summary={
          <div
            aria-live="polite"
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
            role="status"
          >
            <DocumentListSummary
              page={currentPage.page}
              pageSize={currentPage.pageSize}
              total={currentPage.total}
            />
            {summaryBadgeLabel ? (
              <span className="inline-flex rounded-md border border-[#ead8a8] bg-[#fff8df] px-2 py-0.5 text-xs font-semibold text-[#82620d]">
                {summaryBadgeLabel}
              </span>
            ) : null}
          </div>
        }
      />

      {pageError ? (
        <p
          className="mb-4 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]"
          role="alert"
        >
          {pageError}
        </p>
      ) : null}

      <div
        aria-busy={isPagePending || undefined}
        className={isPagePending ? "opacity-60" : undefined}
      >
        <DocumentList
          documents={currentPage.documents}
          empty={
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={
                hasActiveFilters ? (
                  <Link
                    href={basePath}
                    className={buttonClass(
                      buttonStyles.base,
                      buttonStyles.neutral,
                      "h-10 px-4 text-sm",
                    )}
                  >
                    모든 필터 초기화
                  </Link>
                ) : undefined
              }
            />
          }
        />
      </div>

      <DocumentPagination
        ariaLabel={ariaLabel}
        basePath={basePath}
        dateFrom={currentFilters.dateFrom}
        dateTo={currentFilters.dateTo}
        extraParams={currentFilters.extraParams}
        isPending={isPagePending}
        onPageChange={loadDocumentPage}
        page={currentPage.page}
        pendingPage={pendingPage}
        query={currentFilters.query}
        sort={currentFilters.sort}
        status={currentFilters.status}
        totalPages={currentPage.totalPages}
      />
    </>
  );
}

function getDocumentFiltersFromLocation(
  extraParamNames: string[],
): DocumentPageFilters {
  const params = new URLSearchParams(window.location.search);
  const extraParams = Object.fromEntries(
    extraParamNames
      .map((name) => [name, String(params.get(name) ?? "").trim()] as const)
      .filter(([, value]) => Boolean(value)),
  );

  return {
    dateFrom: normalizeDate(params.get("dateFrom")),
    dateTo: normalizeDate(params.get("dateTo")),
    extraParams,
    page: normalizePositivePage(params.get("page")),
    query: String(params.get("q") ?? "").trim(),
    sort: params.get("sort") === "oldest" ? "oldest" : "latest",
    status: String(params.get("status") ?? "all").trim() || "all",
  };
}

function normalizeDate(value: string | null | undefined) {
  const date = String(value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizePositivePage(value: string | null | undefined) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}
