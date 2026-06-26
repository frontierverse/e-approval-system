"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ChangeEvent } from "react";
import {
  resourceEducationLevelOptions,
  type ResourceEducationLevel,
  type ResourceEducationLevelFilter,
} from "@/lib/resource-library-core";

const educationTopics = ["검정고시", "기출문제", "개념"] as const;
const highSchoolSubjects = [
  "국어",
  "수학",
  "영어",
  "한국사",
  "과학",
  "사회",
  "윤리",
] as const;
const middleSchoolSubjects = [
  "국어",
  "수학",
  "영어",
  "사회",
  "역사",
  "도덕",
  "과학",
  "기술·가정",
  "정보",
  "체육",
  "음악",
  "미술",
] as const;

type EducationTopic = (typeof educationTopics)[number];
type HighSchoolSubject = (typeof highSchoolSubjects)[number];
type MiddleSchoolSubject = (typeof middleSchoolSubjects)[number];
type EducationSubcategory =
  | EducationTopic
  | HighSchoolSubject
  | MiddleSchoolSubject;

type EducationResourceQuickFiltersProps = {
  educationLevel: ResourceEducationLevelFilter;
  query: string;
};

export function EducationResourceQuickFilters(
  props: EducationResourceQuickFiltersProps,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <EducationResourceQuickFiltersContent
      {...props}
      disabled={isPending}
      navigate={navigate}
    />
  );
}

export function EducationResourceQuickFiltersContent({
  disabled = false,
  educationLevel,
  navigate,
  query,
}: EducationResourceQuickFiltersProps & {
  disabled?: boolean;
  navigate: (href: string) => void;
}) {
  const subcategoryOptions = getEducationSubcategoryOptions(educationLevel);
  const selectedSubcategory = getSelectedEducationSubcategory(
    query,
    subcategoryOptions,
  );

  function handleLevelChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextEducationLevel = normalizeEducationLevel(
      event.currentTarget.value,
    );

    navigate(
      getEducationResourceQuickFilterHref({
        educationLevel: nextEducationLevel || "all",
        query,
      }),
    );
  }

  function handleSubcategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    const subcategory = normalizeEducationSubcategory(
      event.currentTarget.value,
      subcategoryOptions,
    );

    navigate(
      getEducationResourceQuickFilterHref({
        educationLevel,
        query: subcategory,
      }),
    );
  }

  return (
    <div
      aria-label="교육 자료 카테고리 검색"
      className="flex min-w-0 gap-2 sm:shrink-0"
      role="group"
    >
      <label className="min-w-0 flex-1 sm:flex-none">
        <span className="sr-only">대상</span>
        <select
          value={educationLevel === "all" ? "" : educationLevel}
          disabled={disabled}
          onChange={handleLevelChange}
          className="h-9 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#8a95a6] sm:w-24"
        >
          {resourceEducationLevelOptions.map((option) => (
            <option
              key={option.value}
              value={option.value === "all" ? "" : option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0 flex-1 sm:flex-none">
        <span className="sr-only">분류</span>
        <select
          value={selectedSubcategory}
          disabled={disabled}
          onChange={handleSubcategoryChange}
          className="h-9 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#8a95a6] sm:w-28"
        >
          <option value="">
            {isSubjectEducationLevel(educationLevel) ? "과목" : "분류"}
          </option>
          {subcategoryOptions.map((subcategory) => (
            <option key={subcategory} value={subcategory}>
              {subcategory}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function getEducationSubcategoryOptions(
  educationLevel: ResourceEducationLevelFilter,
): readonly EducationSubcategory[] {
  if (educationLevel === "high") {
    return highSchoolSubjects;
  }

  if (educationLevel === "middle") {
    return middleSchoolSubjects;
  }

  return educationTopics;
}

function isSubjectEducationLevel(
  educationLevel: ResourceEducationLevelFilter,
) {
  return educationLevel === "high" || educationLevel === "middle";
}

function getSelectedEducationSubcategory(
  query: string,
  options: readonly EducationSubcategory[],
): EducationSubcategory | "" {
  const terms = query.trim().split(/\s+/).filter(Boolean);

  return options.find((candidate) => terms.includes(candidate)) ?? "";
}

function getEducationResourceQuickFilterHref({
  educationLevel,
  query,
}: {
  educationLevel: ResourceEducationLevelFilter;
  query: string;
}) {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();

  params.set("category", "education");

  if (educationLevel !== "all") {
    params.set("level", educationLevel);
  }

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  return `/resources?${params.toString()}`;
}

function normalizeEducationLevel(value: string): ResourceEducationLevel | "" {
  return resourceEducationLevelOptions.find(
    (option): option is { value: ResourceEducationLevel; label: string } =>
      option.value !== "all" && option.value === value,
  )?.value ?? "";
}

function normalizeEducationSubcategory(
  value: string,
  options: readonly EducationSubcategory[],
): EducationSubcategory | "" {
  return options.find((subcategory) => subcategory === value) ?? "";
}
