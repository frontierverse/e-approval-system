import Link from "next/link";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemCategories,
  cafeItemDeadlineFilters,
  formatCafeItemDate,
  getCafeItemCategoryLabel,
  getCafeItemUsageDday,
  type CafeItem,
  type CafeItemCategoryFilter,
  type CafeItemDeadlineFilter,
  type CafeItemPage,
} from "@/lib/cafe-items-core";

type CafeItemListProps = {
  itemPage: CafeItemPage;
  today: string;
};

export function CafeItemList({ itemPage, today }: CafeItemListProps) {
  const firstItem =
    itemPage.total === 0 ? 0 : (itemPage.page - 1) * itemPage.pageSize + 1;
  const lastItem = Math.min(itemPage.page * itemPage.pageSize, itemPage.total);

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white shadow-sm">
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              물품 목록
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              {itemPage.total > 0
                ? `${itemPage.total}건 중 ${firstItem}-${lastItem}건 표시`
                : "등록된 물품이 없습니다."}
            </p>
          </div>
          <span className="rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 py-1.5 text-xs font-semibold text-[#394150]">
            기준일 {formatCafeItemDate(today)}
          </span>
        </div>

        <CafeItemFilterControls filters={itemPage.filters} />
      </div>

      {itemPage.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#eef1f5] bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
                <th className="w-[18rem] px-6 py-3.5">물품</th>
                <th className="w-[8rem] px-6 py-3.5">종류</th>
                <th className="w-[9rem] px-6 py-3.5">구매일</th>
                <th className="w-[10rem] px-6 py-3.5">사용 기한</th>
                <th className="w-[9rem] px-6 py-3.5">유통기한</th>
                <th className="w-[8rem] px-6 py-3.5">가격</th>
                <th className="min-w-[16rem] px-6 py-3.5">구매 사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f5]">
              {itemPage.items.map((item) => (
                <CafeItemRow key={item.id} item={item} today={today} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          조건에 맞는 물품이 없습니다.
        </p>
      )}

      <CafeItemPagination itemPage={itemPage} />
    </section>
  );
}

function CafeItemFilterControls({
  filters,
}: {
  filters: CafeItemPage["filters"];
}) {
  const hasFilters =
    filters.query ||
    filters.category !== "all" ||
    filters.deadline !== "all";

  return (
    <form className="mt-4 flex min-w-0 flex-wrap items-end gap-2">
      <label className="block min-w-0">
        <span className="text-xs font-semibold text-[#697386]">검색</span>
        <input
          name="q"
          defaultValue={filters.query}
          placeholder="물품명 또는 구매 사유"
          className="mt-2 h-10 w-56 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      </label>
      <label className="block min-w-0">
        <span className="text-xs font-semibold text-[#697386]">종류</span>
        <select
          name="category"
          defaultValue={filters.category}
          className="mt-2 h-10 w-36 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        >
          <option value="all">전체 종류</option>
          {cafeItemCategories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0">
        <span className="text-xs font-semibold text-[#697386]">
          사용 기한
        </span>
        <select
          name="deadline"
          defaultValue={filters.deadline}
          className="mt-2 h-10 w-44 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        >
          {cafeItemDeadlineFilters.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.filter,
          "h-10 px-4 text-sm",
        )}
      >
        적용
      </button>
      {hasFilters ? (
        <Link
          href="/work-schedule/cafe"
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-10 px-4 text-sm",
          )}
        >
          초기화
        </Link>
      ) : null}
    </form>
  );
}

function CafeItemRow({ item, today }: { item: CafeItem; today: string }) {
  const usageDday = getCafeItemUsageDday(item, today);

  return (
    <tr className="align-top">
      <td className="px-6 py-5">
        <p className="break-words font-semibold text-[#16181d] [overflow-wrap:anywhere]">
          {item.name}
        </p>
        <p className="mt-2 text-xs text-[#9aa4b2]">
          등록 {formatDateTime(item.createdAt)}
        </p>
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {getCafeItemCategoryLabel(item.category)}
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {formatCafeItemDate(item.purchasedAt)}
      </td>
      <td className="px-6 py-5">
        <span
          className={[
            "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
            getUsageDdayClassName(usageDday.status),
          ].join(" ")}
        >
          {usageDday.label}
        </span>
        <p className="mt-2 text-xs leading-5 text-[#697386]">
          {usageDday.basisLabel}
        </p>
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {item.category === "food"
          ? formatCafeItemDate(item.expirationDate)
          : "해당 없음"}
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {formatPrice(item.priceWon)}
      </td>
      <td className="max-w-sm px-6 py-5">
        <p className="whitespace-pre-line break-words leading-6 text-[#394150] [overflow-wrap:anywhere]">
          {item.purchaseReason || "미입력"}
        </p>
      </td>
    </tr>
  );
}

function CafeItemPagination({ itemPage }: { itemPage: CafeItemPage }) {
  if (itemPage.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="카페 물품 목록 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4"
    >
      <p className="text-sm text-[#697386]">
        {itemPage.page} / {itemPage.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <CafeItemPaginationLink
          disabled={itemPage.page <= 1}
          href={getCafeItemPageHref(itemPage.filters, itemPage.page - 1)}
        >
          이전
        </CafeItemPaginationLink>
        <CafeItemPaginationLink
          disabled={itemPage.page >= itemPage.totalPages}
          href={getCafeItemPageHref(itemPage.filters, itemPage.page + 1)}
        >
          다음
        </CafeItemPaginationLink>
      </div>
    </nav>
  );
}

function CafeItemPaginationLink({
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

function getCafeItemPageHref(
  filters: {
    category: CafeItemCategoryFilter;
    deadline: CafeItemDeadlineFilter;
    query: string;
  },
  page: number,
) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.category !== "all") {
    params.set("category", filters.category);
  }

  if (filters.deadline !== "all") {
    params.set("deadline", filters.deadline);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `/work-schedule/cafe?${queryString}` : "/work-schedule/cafe";
}

function getUsageDdayClassName(status: ReturnType<typeof getCafeItemUsageDday>["status"]) {
  if (status === "expired") {
    return "border-[#efb4b4] bg-[#fff1f1] text-[#a13a3a]";
  }

  if (status === "soon") {
    return "border-[#f0d28a] bg-[#fff8e8] text-[#7a5200]";
  }

  if (status === "safe") {
    return "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]";
  }

  return "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]";
}

function formatPrice(value: number | null) {
  if (value === null) {
    return "미입력";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
