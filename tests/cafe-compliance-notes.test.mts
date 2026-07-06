import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CafeComplianceNoteList } from "../src/components/cafe-compliance-board.tsx";
import {
  cafeComplianceNoteMaxLength,
  createCafeCompliancePageHref,
  normalizeCafeComplianceNoteContent,
  normalizeCafeComplianceNotePage,
  validateCafeComplianceNoteContent,
  type CafeComplianceNotePage,
} from "../src/lib/cafe-compliance-notes-core.ts";

const notePage: CafeComplianceNotePage = {
  notes: [
    {
      id: "note-001",
      content: "마감 시 에스프레소 머신을 청소하고 전원을 차단합니다.",
      createdAt: "2026-07-03T09:00:00.000Z",
      createdBy: {
        id: "user-001",
        name: "김민준",
      },
    },
    {
      id: "note-002",
      content: "우유는 개봉 후 냉장 보관하고 개봉일을 표기합니다.",
      createdAt: "2026-07-02T09:00:00.000Z",
      createdBy: null,
    },
  ],
  page: 1,
  pageSize: 7,
  total: 2,
  totalPages: 1,
};

describe("cafe compliance note core", () => {
  test("normalizes content by trimming and stringifying", () => {
    assert.equal(normalizeCafeComplianceNoteContent("  내용  "), "내용");
    assert.equal(normalizeCafeComplianceNoteContent(null), "");
    assert.equal(normalizeCafeComplianceNoteContent(undefined), "");
  });

  test("rejects empty content", () => {
    assert.equal(
      validateCafeComplianceNoteContent(""),
      "준수사항 내용을 입력하세요.",
    );
  });

  test("rejects content over the max length", () => {
    const error = validateCafeComplianceNoteContent(
      "가".repeat(cafeComplianceNoteMaxLength + 1),
    );

    assert.match(error, /이하로 입력하세요/);
  });

  test("accepts content within the max length", () => {
    assert.equal(
      validateCafeComplianceNoteContent("가".repeat(cafeComplianceNoteMaxLength)),
      "",
    );
  });

  test("normalizes note page numbers", () => {
    assert.equal(normalizeCafeComplianceNotePage(undefined), 1);
    assert.equal(normalizeCafeComplianceNotePage("0"), 1);
    assert.equal(normalizeCafeComplianceNotePage("2.5"), 1);
    assert.equal(normalizeCafeComplianceNotePage("3"), 3);
  });

  test("builds compliance tab hrefs", () => {
    assert.equal(
      createCafeCompliancePageHref(1),
      "/work-schedule/cafe?tab=compliance",
    );
    assert.equal(
      createCafeCompliancePageHref(2),
      "/work-schedule/cafe?tab=compliance&notePage=2",
    );
  });
});

describe("CafeComplianceNoteList", () => {
  test("renders note content, author, and count summary", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CafeComplianceNoteList, { notePage }),
    );

    assert.match(markup, /준수사항 목록/);
    assert.match(markup, /2건 중 1-2건 표시/);
    assert.match(markup, /마감 시 에스프레소 머신을 청소하고/);
    assert.match(markup, /김민준/);
  });

  test("renders an empty state without notes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CafeComplianceNoteList, {
        notePage: {
          notes: [],
          page: 1,
          pageSize: 7,
          total: 0,
          totalPages: 1,
        },
      }),
    );

    assert.match(markup, /등록된 준수사항이 없습니다/);
  });

  test("renders pagination links when there are multiple pages", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CafeComplianceNoteList, {
        notePage: {
          ...notePage,
          page: 2,
          total: 15,
          totalPages: 3,
        },
      }),
    );

    assert.match(markup, /2 \/ 3 페이지/);
    assert.match(markup, /tab=compliance&amp;notePage=3/);
  });
});
