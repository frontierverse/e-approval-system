"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { FormEvent } from "react";
import { DatePickerInput } from "@/components/date-picker-input";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { hasDocumentListFilter } from "@/lib/document-list-filters";

export type DocumentListStatusOption = {
  value: string;
  label: string;
};

type DocumentListFilterControlsProps = {
  basePath: string;
  query: string;
  status: string;
  sort: string;
  dateFrom: string;
  dateTo: string;
  extraParams?: Record<string, string>;
  statusOptions: DocumentListStatusOption[];
  searchPlaceholder?: string;
};

export function DocumentListFilterControls(
  props: DocumentListFilterControlsProps,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <DocumentListFilterControlsContent
      {...props}
      isPending={isPending}
      navigate={navigate}
    />
  );
}

export function DocumentListFilterControlsContent({
  basePath,
  query,
  status,
  sort,
  dateFrom,
  dateTo,
  extraParams,
  isPending = false,
  navigate,
  statusOptions,
  searchPlaceholder = "제목, 문서번호, 분류, 작성자",
}: DocumentListFilterControlsProps & {
  isPending?: boolean;
  navigate: (href: string) => void;
}) {
  const hiddenParams = getVisibleExtraParams(extraParams);
  const hasActiveFilter =
    hasDocumentListFilter(query, status, sort, dateFrom, dateTo) ||
    hiddenParams.length > 0;
  const filterFormKey = [
    basePath,
    query,
    dateFrom,
    dateTo,
    status,
    sort,
    hiddenParams.map(([name, value]) => `${name}:${value}`).join("|"),
  ].join(":");

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    navigate(
      createDocumentListFilterHref({
        basePath,
        dateFrom: String(formData.get("dateFrom") ?? ""),
        dateTo: String(formData.get("dateTo") ?? ""),
        extraParams,
        page: 1,
        query: String(formData.get("q") ?? ""),
        sort: String(formData.get("sort") ?? "latest"),
        status: String(formData.get("status") ?? "all"),
      }),
    );
  }

  return (
    <form
      key={filterFormKey}
      className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_10rem_10rem_auto_auto]"
      onSubmit={submitFilters}
    >
      {hiddenParams.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div>
        <label htmlFor="q" className="text-xs font-semibold text-[#697386]">
          검색
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          disabled={isPending}
          placeholder={searchPlaceholder}
          className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
        />
      </div>

      <div>
        <label
          htmlFor="dateFrom"
          className="text-xs font-semibold text-[#697386]"
        >
          시작일
        </label>
        <DatePickerInput
          id="dateFrom"
          name="dateFrom"
          defaultValue={dateFrom}
          disabled={isPending}
          className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
        />
      </div>

      <div>
        <label
          htmlFor="dateTo"
          className="text-xs font-semibold text-[#697386]"
        >
          종료일
        </label>
        <DatePickerInput
          id="dateTo"
          name="dateTo"
          defaultValue={dateTo}
          disabled={isPending}
          className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
        />
      </div>

      <div>
        <label
          htmlFor="status"
          className="text-xs font-semibold text-[#697386]"
        >
          상태
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status}
          disabled={isPending}
          className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="sort" className="text-xs font-semibold text-[#697386]">
          정렬
        </label>
        <select
          id="sort"
          name="sort"
          defaultValue={sort}
          disabled={isPending}
          className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
        >
          <option value="latest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
      </div>

      <div className="flex items-end">
        <button
          type="submit"
          disabled={isPending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.filter,
            "h-10 w-full px-4 text-sm",
          )}
        >
          {isPending ? "적용 중" : "적용"}
        </button>
      </div>

      <div className="flex items-end">
        {hasActiveFilter ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => navigate(basePath)}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-10 w-full px-4 text-sm",
            )}
          >
            초기화
          </button>
        ) : (
          <span className="hidden lg:block" />
        )}
      </div>
    </form>
  );
}

function createDocumentListFilterHref({
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
  const normalizedQuery = query.trim();
  const normalizedStatus = status.trim() || "all";
  const normalizedSort = sort.trim() || "latest";
  const normalizedDateFrom = normalizeDateFilter(dateFrom);
  const normalizedDateTo = normalizeDateFilter(dateTo);

  for (const [name, value] of getVisibleExtraParams(extraParams)) {
    params.set(name, value);
  }

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  if (normalizedStatus !== "all") {
    params.set("status", normalizedStatus);
  }

  if (normalizedSort !== "latest") {
    params.set("sort", normalizedSort);
  }

  if (normalizedDateFrom) {
    params.set("dateFrom", normalizedDateFrom);
  }

  if (normalizedDateTo) {
    params.set("dateTo", normalizedDateTo);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

function normalizeDateFilter(value: string) {
  const date = value.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function getVisibleExtraParams(extraParams?: Record<string, string>) {
  return Object.entries(extraParams ?? {}).filter(([, value]) => Boolean(value));
}
