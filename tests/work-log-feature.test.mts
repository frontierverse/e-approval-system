import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WorkLogContributionGraph,
  WorkLogRecentList,
} from "../src/components/work-log-board.tsx";

const schemaSource = read("../prisma/schema.prisma");
const migrationSource = read(
  "../prisma/migrations-postgresql/20260902120000_add_work_logs/migration.sql",
);
const actionSource = read("../src/app/work-schedule/work-log/actions.ts");
const querySource = read("../src/lib/work-logs.ts");
const boardSource = read("../src/components/work-log-board.tsx");
const loadingSource = read("../src/app/work-schedule/work-log/loading.tsx");
const prismaSource = read("../src/lib/prisma.ts");

describe("work log feature", () => {
  test("defines a per-user daily work log with a protected migration", () => {
    assert.match(schemaSource, /model WorkLog \{[\s\S]*?workDate\s+DateTime\s+@db\.Date/);
    assert.match(schemaSource, /author\s+User\s+@relation\("WorkLogAuthor"[\s\S]*?onDelete: Restrict/);
    assert.match(schemaSource, /@@unique\(\[authorId, workDate\]\)/);
    assert.match(migrationSource, /ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_WORK_LOG'/);
    assert.match(migrationSource, /CHECK \(char_length\(btrim\("keyword"\)\) BETWEEN 1 AND 100\)/);
    assert.match(migrationSource, /CHECK \(char_length\(btrim\("content"\)\) BETWEEN 1 AND 5000\)/);
    assert.match(migrationSource, /ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(migrationSource, /ALTER TABLE "WorkLog" ENABLE ROW LEVEL SECURITY/);
    assert.match(prismaSource, /"workLog"/);
  });

  test("authenticates and scopes every save and read to the current user", () => {
    assert.match(actionSource, /const user = await requireUser\(\)/);
    assert.match(actionSource, /authorId: user\.id/);
    assert.match(actionSource, /tx\.workLog\.upsert/);
    assert.match(actionSource, /tx\.workLog\.findUnique/);
    assert.match(actionSource, /TransactionIsolationLevel\.Serializable/);
    assert.match(actionSource, /P2002[\s\S]*?P2034/);
    assert.match(actionSource, /revalidatePath\(workLogPath\)/);
    assert.doesNotMatch(actionSource, /formData\.get\("authorId"\)/);
    assert.match(querySource, /where: \{[\s\S]*?authorId,/);
    assert.match(querySource, /authorId_workDate/);
  });

  test("renders an accessible contribution graph with recorded and empty days", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkLogContributionGraph, {
        recordedDates: ["2026-09-01"],
        today: "2026-09-02",
      }),
    );

    assert.match(html, /최근 1년 업무일지/);
    assert.match(html, /1일 기록/);
    assert.match(html, /role="img"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /가로 스크롤 영역/);
    assert.match(html, /bg-\[var\(--brand\)\]/);
    assert.match(html, /bg-\[var\(--surface-muted\)\]/);
    assert.match(html, /작성 있음/);
  });

  test("renders compact empty and selected recent-work-log states", () => {
    const emptyHtml = renderToStaticMarkup(
      React.createElement(WorkLogRecentList, {
        entries: [],
        selectedDate: "2026-09-02",
      }),
    );
    const listHtml = renderToStaticMarkup(
      React.createElement(WorkLogRecentList, {
        entries: [
          {
            content: "보고 자료를 검토하고 최종본을 제출했습니다.",
            createdAt: "2026-09-02T01:00:00.000Z",
            id: "work-log-1",
            keyword: "월간 보고서",
            updatedAt: "2026-09-02T01:00:00.000Z",
            workDate: "2026-09-02",
          },
        ],
        selectedDate: "2026-09-02",
      }),
    );

    assert.match(emptyHtml, /첫 업무일지를 등록/);
    assert.match(listHtml, /aria-current="page"/);
    assert.match(listHtml, /월간 보고서/);
    assert.match(listHtml, /date=2026-09-02/);
  });

  test("keeps the contribution graph above the form and preserves safe form states", () => {
    assert.match(
      boardSource,
      /<WorkLogContributionGraph[\s\S]*?<WorkLogEntryForm/,
    );
    assert.match(boardSource, /name="workDate"[\s\S]*?required[\s\S]*?max=\{today\}/);
    assert.match(boardSource, /name="keyword"[\s\S]*?maxLength=\{workLogKeywordMaxLength\}/);
    assert.match(boardSource, /name="content"[\s\S]*?maxLength=\{workLogContentMaxLength\}/);
    assert.match(boardSource, /disabled=\{pending \|\| isDatePending\}/);
    assert.match(boardSource, /hasUnsavedChanges[\s\S]*?window\.confirm/);
    assert.match(boardSource, /role="alert"/);
    assert.match(loadingSource, /motion-reduce:animate-none/);
  });
});

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}
