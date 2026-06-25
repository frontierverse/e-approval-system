import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultResourceLibraryPageSize,
  educationResourceLibraryPageSize,
  getResourceCategoryDisplayLabel,
  getResourceLibraryPageSize,
  getResourceSearchTerms,
  normalizeResourceEducationLevel,
  normalizeResourceEducationLevelFilter,
  normalizeResourceCategoryFilter,
  paginateResourceItems,
  type ResourceLibraryItem,
} from "../src/lib/resource-library-core.ts";

const resources: ResourceLibraryItem[] = [
  createResource("resource-001"),
  createResource("resource-002"),
  createResource("resource-003"),
  createResource("resource-004"),
];

describe("resource library", () => {
  test("normalizes category filters", () => {
    assert.equal(normalizeResourceCategoryFilter("cafe"), "cafe");
    assert.equal(normalizeResourceCategoryFilter("bajaul"), "bajaul");
    assert.equal(normalizeResourceCategoryFilter("education"), "education");
    assert.equal(normalizeResourceCategoryFilter("unknown"), "all");
    assert.equal(normalizeResourceCategoryFilter(undefined), "all");
  });

  test("uses ten items per page for education resources", () => {
    assert.equal(getResourceLibraryPageSize("education"), 10);
    assert.equal(educationResourceLibraryPageSize, 10);
    assert.equal(getResourceLibraryPageSize("corporation"), 3);
    assert.equal(getResourceLibraryPageSize("cafe"), 3);
    assert.equal(getResourceLibraryPageSize("bajaul"), 3);
    assert.equal(getResourceLibraryPageSize("all"), 3);
    assert.equal(defaultResourceLibraryPageSize, 3);
  });

  test("normalizes education level filters", () => {
    assert.equal(normalizeResourceEducationLevel("common"), "common");
    assert.equal(normalizeResourceEducationLevel("high"), "high");
    assert.equal(normalizeResourceEducationLevel("middle"), "middle");
    assert.equal(normalizeResourceEducationLevel("unknown"), "");
    assert.equal(normalizeResourceEducationLevel(undefined), "");
    assert.equal(normalizeResourceEducationLevelFilter("common"), "common");
    assert.equal(normalizeResourceEducationLevelFilter("high"), "high");
    assert.equal(normalizeResourceEducationLevelFilter("middle"), "middle");
    assert.equal(normalizeResourceEducationLevelFilter("unknown"), "all");
    assert.equal(normalizeResourceEducationLevelFilter(undefined), "all");
  });

  test("formats education resource category labels with the level", () => {
    assert.equal(
      getResourceCategoryDisplayLabel({
        category: "education",
        educationLevel: "common",
      }),
      "교육 · 공통",
    );
    assert.equal(
      getResourceCategoryDisplayLabel({
        category: "education",
        educationLevel: "high",
      }),
      "교육 · 고등",
    );
    assert.equal(
      getResourceCategoryDisplayLabel({
        category: "education",
        educationLevel: "middle",
      }),
      "교육 · 중등",
    );
    assert.equal(
      getResourceCategoryDisplayLabel({
        category: "education",
        educationLevel: null,
      }),
      "교육",
    );
  });

  test("splits resource search queries into terms", () => {
    assert.deepEqual(getResourceSearchTerms("고등 검정고시"), [
      "고등",
      "검정고시",
    ]);
    assert.deepEqual(getResourceSearchTerms("  중등   기출문제  "), [
      "중등",
      "기출문제",
    ]);
    assert.deepEqual(getResourceSearchTerms(""), []);
  });

  test("paginates resource results", () => {
    const page = paginateResourceItems({
      items: resources,
      page: 2,
      pageSize: 3,
    });

    assert.equal(page.page, 2);
    assert.equal(page.total, 4);
    assert.equal(page.totalPages, 2);
    assert.equal(page.items.length, 1);
  });
});

function createResource(id: string): ResourceLibraryItem {
  return {
    id,
    title: id,
    summary: "테스트 자료",
    category: "bajaul",
    educationLevel: null,
    authorId: "user-001",
    authorName: "김민준",
    departmentName: "바자울",
    createdAt: "2026-05-11T12:02:00+09:00",
    updatedAt: "2026-05-11T12:02:00+09:00",
    viewCount: 0,
    pinned: false,
    attachments: [],
  };
}
