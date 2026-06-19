"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { FormEvent } from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { ResourceCategoryFilter } from "@/lib/resource-library-core";

type ResourceLibraryFilterControlsProps = {
  category: ResourceCategoryFilter;
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
      className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]"
      onSubmit={submitFilters}
    >
      <input type="hidden" name="category" value={category} />
      <div>
        <label
          htmlFor="resourceSearch"
          className="text-xs font-semibold text-[#697386]"
        >
          검색
        </label>
        <input
          id="resourceSearch"
          name="q"
          type="search"
          defaultValue={query}
          disabled={isPending}
          placeholder="제목, 내용, 작성자, 첨부파일"
          className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
        />
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
          {isPending ? "검색 중" : "검색"}
        </button>
      </div>

      <div className="flex items-end">
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
              "h-10 w-full px-4 text-sm",
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
