import Link from "next/link";
import { DatePickerInput } from "@/components/date-picker-input";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type StatusOption = {
  value: string;
  label: string;
};

type DocumentListControlsProps = {
  basePath: string;
  query: string;
  status: string;
  sort: string;
  dateFrom: string;
  dateTo: string;
  extraParams?: Record<string, string>;
  summary: React.ReactNode;
  statusOptions: StatusOption[];
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
  page: number;
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
  summary,
  statusOptions,
  searchPlaceholder = "제목, 문서번호, 분류, 작성자",
}: DocumentListControlsProps) {
  const hiddenParams = getVisibleExtraParams(extraParams);
  const hasActiveFilter = hasDocumentListFilter(
    query,
    status,
    sort,
    dateFrom,
    dateTo,
  ) || hiddenParams.length > 0;
  return (
    <section className="mb-4 rounded-md border border-[#d9dee7] bg-white p-4">
      <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_10rem_10rem_auto_auto]">
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
            placeholder={searchPlaceholder}
            className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
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
            className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
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
            className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
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
            className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="sort"
            className="text-xs font-semibold text-[#697386]"
          >
            정렬
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={sort}
            className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.filter,
              "h-10 w-full px-4 text-sm",
            )}
          >
            적용
          </button>
        </div>

        <div className="flex items-end">
          {hasActiveFilter ? (
            <Link
              href={basePath}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-10 w-full px-4 text-sm",
              )}
            >
              초기화
            </Link>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>
      </form>

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
  page,
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
          disabled={page <= 1}
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
        >
          이전
        </PaginationLink>
        <PaginationLink
          disabled={page >= totalPages}
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
        >
          다음
        </PaginationLink>
      </div>
    </nav>
  );
}

export function hasDocumentListFilter(
  query: string,
  status: string,
  sort: string,
  dateFrom = "",
  dateTo = "",
) {
  return (
    Boolean(query) ||
    status !== "all" ||
    sort !== "latest" ||
    Boolean(dateFrom) ||
    Boolean(dateTo)
  );
}

function PaginationLink({
  children,
  disabled,
  href,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "h-10 px-4 text-sm",
      )}
    >
      {children}
    </Link>
  );
}

function getDocumentListHref({
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
