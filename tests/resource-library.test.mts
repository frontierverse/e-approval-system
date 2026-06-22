import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
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
