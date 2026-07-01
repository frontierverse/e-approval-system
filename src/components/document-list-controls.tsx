"use client";

import type { MouseEvent } from "react";
import {
  DocumentListFilterControls,
  type DocumentListStatusOption,
} from "@/components/document-list-filter-controls";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type DocumentListControlsProps = {
  basePath: string;
  query: string;
  status: string;
  sort: string;
  dateFrom: string;
  dateTo: string;
  extraParams?: Record<string, string>;
  filterControls?: React.ReactNode;
  summary: React.ReactNode;
  statusOptions: DocumentListStatusOption[];
  searchPlaceholder?: string;
};

type DocumentPaginationProps = {
  ariaLabel: string;
  basePath: string;
  query: string;
  status: string;
  sort: string;
  dateFrom: string;
  dateTo: string;
  extraParams?: Record<string, string>;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  page: number;
  pendingPage?: number | null;
  totalPages: number;
};

export function DocumentListControls({
  basePath,
  query,
  status,
  sort,
  dateFrom,
  dateTo,
  extraParams,
  filterControls,
  summary,
  statusOptions,
  searchPlaceholder = "제목, 문서번호, 분류, 작성자",
}: DocumentListControlsProps) {
  return (
    <section className="mb-4 rounded-md border border-[#d9dee7] bg-white p-4">
      {filterControls ?? (
        <DocumentListFilterControls
          basePath={basePath}
          query={query}
          status={status}
          sort={sort}
          dateFrom={dateFrom}
          dateTo={dateTo}
          extraParams={extraParams}
          statusOptions={statusOptions}
          searchPlaceholder={searchPlaceholder}
        />
      )}

      <div className="mt-3 min-h-4">{summary}</div>
    </section>
  );
}

export function DocumentListSummary({
  total,
  page,
  pageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
}) {
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <p className="text-xs text-[#697386]">
      {total > 0
        ? `${total}건 중 ${firstItem}-${lastItem}건 표시`
        : "표시할 문서가 없습니다."}
    </p>
  );
}

export function DocumentListSummarySkeleton() {
  return (
    <div
      aria-label="문서 건수 불러오는 중"
      className="h-3 w-36 animate-pulse rounded-md bg-[#edf1f5]"
    />
  );
}

export function DocumentPagination({
  ariaLabel,
  basePath,
  query,
  status,
  sort,
  dateFrom,
  dateTo,
  extraParams,
  isPending = false,
  onPageChange,
  page,
  pendingPage = null,
  totalPages,
}: DocumentPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={ariaLabel}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-[#697386]">
        {page} / {totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <PaginationLink
          disabled={page <= 1 || isPending}
          href={getDocumentListHref({
            basePath,
            query,
            status,
            sort,
            dateFrom,
            dateTo,
            extraParams,
            page: page - 1,
          })}
          onPageChange={onPageChange}
          page={page - 1}
          pending={pendingPage === page - 1}
        >
          이전
        </PaginationLink>
        <PaginationLink
          disabled={page >= totalPages || isPending}
          href={getDocumentListHref({
            basePath,
            query,
            status,
            sort,
            dateFrom,
            dateTo,
            extraParams,
            page: page + 1,
          })}
          onPageChange={onPageChange}
          page={page + 1}
          pending={pendingPage === page + 1}
        >
          다음
        </PaginationLink>
      </div>
    </nav>
  );
}

function PaginationLink({
  children,
  disabled,
  href,
  onPageChange,
  page,
  pending,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
  onPageChange?: (page: number) => void;
  page: number;
  pending: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {pending ? "..." : children}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-busy={pending || undefined}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "h-10 px-4 text-sm",
      )}
      onClick={(event) => {
        if (!onPageChange || shouldUseNativeNavigation(event)) {
          return;
        }

        event.preventDefault();
        onPageChange(page);
      }}
    >
      {pending ? "..." : children}
    </a>
  );
}

export function getDocumentListHref({
  basePath,
  query,
  status,
  sort,
  dateFrom,
  dateTo,
  extraParams,
  page,
}: {
  basePath: string;
  query: string;
  status: string;
  sort: string;
  dateFrom: string;
  dateTo: string;
  extraParams?: Record<string, string>;
  page: number;
}) {
  const params = new URLSearchParams();

  for (const [name, value] of getVisibleExtraParams(extraParams)) {
    params.set(name, value);
  }

  if (query) {
    params.set("q", query);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  if (sort !== "latest") {
    params.set("sort", sort);
  }

  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }

  if (dateTo) {
    params.set("dateTo", dateTo);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

function getVisibleExtraParams(extraParams?: Record<string, string>) {
  return Object.entries(extraParams ?? {}).filter(([, value]) => Boolean(value));
}

function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
