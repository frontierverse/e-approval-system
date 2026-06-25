"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { ResourceCategoryFilter } from "@/lib/resource-library-core";

type ResourceLibraryFilterControlsProps = {
  category: ResourceCategoryFilter;
  leadingControl?: ReactNode;
  query: string;
};

export function ResourceLibraryFilterControls(
  props: ResourceLibraryFilterControlsProps,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <ResourceLibraryFilterControlsContent
      {...props}
      isPending={isPending}
      navigate={navigate}
    />
  );
}

export function ResourceLibraryFilterControlsContent({
  category,
  isPending = false,
  leadingControl,
  navigate,
  query,
}: ResourceLibraryFilterControlsProps & {
  isPending?: boolean;
  navigate: (href: string) => void;
}) {
  const hasActiveFilter = Boolean(query);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    navigate(
      createResourceLibraryFilterHref({
        category,
        page: 1,
        query: String(formData.get("q") ?? ""),
      }),
    );
  }

  return (
    <form
      key={`${category}:${query}`}
      className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={submitFilters}
    >
      <input type="hidden" name="category" value={category} />
      {leadingControl ? leadingControl : null}
      <label htmlFor="resourceSearch" className="sr-only">
        검색
      </label>
      <input
        id="resourceSearch"
        name="q"
        type="search"
        defaultValue={query}
        disabled={isPending}
        placeholder="제목, 내용, 작성자, 첨부파일"
        className="h-9 min-w-0 flex-1 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
      />

      <div className="flex shrink-0 gap-2">
        <button
          type="submit"
          disabled={isPending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.filter,
            "h-9 flex-1 px-3 text-sm sm:flex-none",
          )}
        >
          {isPending ? "검색 중" : "검색"}
        </button>

        {hasActiveFilter ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              navigate(
                createResourceLibraryFilterHref({
                  category,
                  page: 1,
                  query: "",
                }),
              )
            }
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-9 flex-1 px-3 text-sm sm:flex-none",
            )}
          >
            초기화
          </button>
        ) : null}
      </div>
    </form>
  );
}

function createResourceLibraryFilterHref({
  category,
  page,
  query,
}: {
  category: ResourceCategoryFilter;
  page: number;
  query: string;
}) {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  if (category !== "all") {
    params.set("category", category);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `/resources?${queryString}` : "/resources";
}
