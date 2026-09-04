import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canLeaveWorkLog,
  getWorkLogContributionTooltipPosition,
  hasWorkLogDraftChanges,
  WorkLogAuditMetadata,
  WorkLogContributionGraph,
  WorkLogDetailModal,
  WorkLogRecentList,
} from "../src/components/work-log-board.tsx";

const schemaSource = read("../prisma/schema.prisma");
const migrationSource = read(
  "../prisma/migrations-postgresql/20260902120000_add_work_logs/migration.sql",
);
const updaterMigrationSource = read(
  "../prisma/migrations-postgresql/20260903100000_add_work_log_updater/migration.sql",
);
const actionSource = read("../src/app/work-schedule/work-log/actions.ts");
const detailRouteSource = read("../src/app/api/work-logs/[date]/route.ts");
const querySource = read("../src/lib/work-logs.ts");
const boardSource = read("../src/components/work-log-board.tsx");
const loadingSource = read("../src/app/work-schedule/work-log/loading.tsx");
const prismaSource = read("../src/lib/prisma.ts");
const seedSource = read("../prisma/seed.ts");
const contributionGraphSource = boardSource.slice(
  boardSource.indexOf("export function WorkLogContributionGraph("),
  boardSource.indexOf("type WorkLogDetailLoadState"),
);
const detailModalSource = boardSource.slice(
  boardSource.indexOf("type WorkLogDetailLoadState"),
  boardSource.indexOf("function WorkLogEntryForm("),
);

const workLogEntry = {
  authorName: "홍길동",
  content: "보고 자료를 검토했습니다.\n후속 작업도 정리했습니다.",
  createdAt: "2026-09-03T00:15:00.000Z",
  id: "work-log-detail",
  keyword: "월간 보고서",
  updatedAt: "2026-09-03T05:30:00.000Z",
  updatedByName: "김민지",
  workDate: "2026-09-03",
};

describe("work log feature", () => {
  test("defines a per-user daily work log with a protected migration", () => {
    assert.match(schemaSource, /model WorkLog \{[\s\S]*?workDate\s+DateTime\s+@db\.Date/);
    assert.match(schemaSource, /author\s+User\s+@relation\("WorkLogAuthor"[\s\S]*?onDelete: Restrict/);
    assert.match(schemaSource, /updatedBy\s+User\?\s+@relation\("WorkLogUpdater"[\s\S]*?onDelete: SetNull/);
    assert.match(schemaSource, /@@unique\(\[authorId, workDate\]\)/);
    assert.match(schemaSource, /@@index\(\[updatedById\]\)/);
    assert.match(migrationSource, /ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_WORK_LOG'/);
    assert.match(migrationSource, /CHECK \(char_length\(btrim\("keyword"\)\) BETWEEN 1 AND 100\)/);
    assert.match(migrationSource, /CHECK \(char_length\(btrim\("content"\)\) BETWEEN 1 AND 5000\)/);
    assert.match(migrationSource, /ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(migrationSource, /ALTER TABLE "WorkLog" ENABLE ROW LEVEL SECURITY/);
    assert.match(updaterMigrationSource, /ADD COLUMN "updatedById" TEXT/);
    assert.match(updaterMigrationSource, /^BEGIN;[\s\S]*COMMIT;\s*$/);
    assert.match(updaterMigrationSource, /'workLog\.update'/);
    assert.match(updaterMigrationSource, /"WorkLog_updatedById_idx"/);
    assert.match(updaterMigrationSource, /ON DELETE SET NULL ON UPDATE CASCADE/);
    assert.match(prismaSource, /"workLog"/);
    assert.match(
      prismaSource,
      /requiredWorkLogFields\s*=\s*\["updatedById", "updatedBy"\]/,
    );
    assert.match(
      prismaSource,
      /hasRequiredWorkLogFields\(client\)[\s\S]*?hasRequiredLunchBoxFields\(client\)/,
    );
  });

  test("authenticates and scopes every save and read to the current user", () => {
    assert.match(actionSource, /const user = await requireUser\(\)/);
    assert.match(actionSource, /authorId: user\.id/);
    assert.match(actionSource, /updatedById: user\.id/);
    assert.match(actionSource, /tx\.workLog\.upsert/);
    assert.match(actionSource, /tx\.workLog\.findUnique/);
    assert.match(actionSource, /TransactionIsolationLevel\.Serializable/);
    assert.match(actionSource, /P2002[\s\S]*?P2034/);
    assert.match(actionSource, /revalidatePath\(workLogPath\)/);
    assert.doesNotMatch(actionSource, /formData\.get\("authorId"\)/);
    assert.match(querySource, /where: \{[\s\S]*?authorId,/);
    assert.match(querySource, /authorId_workDate/);
    assert.match(querySource, /author:[\s\S]*?name: true/);
    assert.match(querySource, /updatedBy:[\s\S]*?name: true/);
  });

  test("renders the author and latest editor with explicit timestamps", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkLogAuditMetadata, {
        entry: {
          authorName: "홍길동",
          content: "보고 자료를 검토했습니다.",
          createdAt: "2026-09-03T00:15:00.000Z",
          id: "work-log-audit",
          keyword: "월간 보고서",
          updatedAt: "2026-09-03T05:30:00.000Z",
          updatedByName: "김민지",
          workDate: "2026-09-03",
        },
      }),
    );

    assert.match(html, /업무일지 작성 및 수정 정보/);
    assert.match(html, /작성자/);
    assert.match(html, /홍길동/);
    assert.match(html, /작성일시 2026년 9월 3일 오전 9:15/);
    assert.match(html, /최종 수정자/);
    assert.match(html, /김민지/);
    assert.match(html, /최종 수정일시 2026년 9월 3일 오후 2:30/);
  });

  test("labels a work log that has never been edited", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkLogAuditMetadata, {
        entry: {
          authorName: "홍길동",
          content: "보고 자료를 검토했습니다.",
          createdAt: "2026-09-03T00:15:00.000Z",
          id: "work-log-created-only",
          keyword: "월간 보고서",
          updatedAt: "2026-09-03T00:15:00.000Z",
          updatedByName: null,
          workDate: "2026-09-03",
        },
      }),
    );

    assert.match(html, /수정 이력 없음/);
  });

  test("renders an accessible contribution graph with recorded and empty days", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkLogContributionGraph, {
        onOpenLog: () => undefined,
        recordedDates: ["2026-09-01"],
        today: "2026-09-02",
      }),
    );

    assert.match(html, /최근 1년 업무일지/);
    assert.match(html, /1일 기록/);
    assert.match(html, /role="group"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /tabindex="-1"/);
    assert.match(html, /aria-describedby=/);
    assert.match(html, /가로 스크롤 영역/);
    assert.match(html, /data-work-log-grass-cell="2026-09-01"/);
    assert.match(html, /bg-\[var\(--brand\)\]/);
    assert.match(html, /bg-\[var\(--surface-muted\)\]/);
    assert.match(html, /작성 있음/);
    assert.match(html, /grid-template-columns:1\.5rem repeat\(53, 2\.75rem\)/);
    assert.match(html, /class="[^"]*size-11[^"]*"/);
    assert.match(
      html,
      /<button[^>]*aria-label="2026년 9월 1일 \(화\) · 업무일지 보기"[^>]*aria-haspopup="dialog"[^>]*type="button"/,
    );
    const emptyCellTag = html.match(
      /<button[^>]*aria-label="2026년 9월 2일 \(수\) · 기록 없음"[^>]*>/,
    );

    assert.ok(emptyCellTag);
    assert.match(emptyCellTag[0], /aria-disabled="true"/);
    assert.match(emptyCellTag[0], /cursor:default/);
    assert.doesNotMatch(emptyCellTag[0], /aria-haspopup/);
  });

  test("renders an accessible work-log detail modal", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkLogDetailModal, {
        date: workLogEntry.workDate,
        deleteAction: async () => ({}),
        hasUnderlyingDraft: false,
        initialEntry: workLogEntry,
        initialLinkedScheduleState: { schedules: [], status: "ready" },
        onClose: () => undefined,
        onDeleted: () => undefined,
        onSaved: () => undefined,
        returnFocusTo: null,
        saveAction: async () => ({}),
      }),
    );

    assert.match(html, /data-app-modal="true"/);
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /업무일지 상세/);
    assert.match(html, /2026년 9월 3일 \(목\)/);
    assert.match(html, /월간 보고서/);
    assert.match(html, /보고 자료를 검토했습니다/);
    assert.match(html, /후속 작업도 정리했습니다/);
    assert.match(html, /whitespace-pre-wrap/);
    assert.match(html, /작성자/);
    assert.match(html, /최종 수정자/);
    assert.match(html, />삭제</);
    assert.match(html, />닫기</);
    assert.match(html, />수정</);
  });

  test("renders the full maximum-length work-log body without truncation", () => {
    const fullContent = "업".repeat(5000);
    const html = renderToStaticMarkup(
      React.createElement(WorkLogDetailModal, {
        date: workLogEntry.workDate,
        deleteAction: async () => ({}),
        hasUnderlyingDraft: false,
        initialEntry: { ...workLogEntry, content: fullContent },
        initialLinkedScheduleState: { schedules: [], status: "ready" },
        onClose: () => undefined,
        onDeleted: () => undefined,
        onSaved: () => undefined,
        returnFocusTo: null,
        saveAction: async () => ({}),
      }),
    );

    assert.ok(html.includes(fullContent));
  });

  test("shows an immediate custom tooltip for each non-future grass cell", () => {
    assert.match(contributionGraphSource, /onPointerEnter=/);
    assert.match(contributionGraphSource, /onPointerMove=/);
    assert.match(contributionGraphSource, /onPointerLeave=/);
    assert.match(contributionGraphSource, /onPointerCancel=/);
    assert.match(contributionGraphSource, /onFocus=/);
    assert.match(contributionGraphSource, /onBlur=/);
    assert.match(contributionGraphSource, /onKeyDown=/);
    assert.match(contributionGraphSource, /ArrowLeft: -7/);
    assert.match(contributionGraphSource, /ArrowRight: 7/);
    assert.match(
      contributionGraphSource,
      /event\.key === "ArrowDown" && weekday === 6/,
    );
    assert.match(
      contributionGraphSource,
      /event\.key === "ArrowUp" && weekday === 0/,
    );
    assert.match(contributionGraphSource, /event\.key === "Escape"/);
    assert.match(contributionGraphSource, /role="tooltip"/);
    assert.match(
      contributionGraphSource,
      /data-work-log-tooltip="true"/,
    );
    assert.match(contributionGraphSource, /pointer-events-none/);
    assert.match(contributionGraphSource, /createPortal\(/);
    assert.match(contributionGraphSource, /document\.body/);
    assert.match(contributionGraphSource, /event\.pointerType === "touch"/);
    assert.match(
      contributionGraphSource,
      /onScroll=\{\(\) => \{[\s\S]*?setPointerTooltip\(null\)/,
    );
    assert.match(
      contributionGraphSource,
      /window\.addEventListener\("scroll", updateTooltipForViewportChange, true\)/,
    );
    assert.match(
      contributionGraphSource,
      /document\.activeElement !== element[\s\S]*?getBoundingClientRect\(\)[\s\S]*?setFocusedTooltip\(\{ \.\.\.focusedCell, x, y \}\)/,
    );
    assert.doesNotMatch(contributionGraphSource, /\btitle=/);
    assert.doesNotMatch(
      contributionGraphSource,
      /setTimeout|transitionDelay|delay-/,
    );
  });

  test("keeps the custom grass tooltip inside the viewport", () => {
    assert.deepEqual(
      getWorkLogContributionTooltipPosition(100, 100, 1366, 768),
      { x: 112, y: 112 },
    );
    assert.deepEqual(
      getWorkLogContributionTooltipPosition(1360, 760, 1366, 768),
      { x: 1140, y: 696 },
    );
    assert.deepEqual(
      getWorkLogContributionTooltipPosition(-10, -10, 320, 800),
      { x: 8, y: 8 },
    );
  });

  test("loads only the selected user's work-log detail", () => {
    assert.match(detailRouteSource, /const user = await getCurrentUser\(\)/);
    assert.match(detailRouteSource, /isWorkLogDate\(date\)/);
    assert.match(detailRouteSource, /date > getWorkLogToday\(\)/);
    assert.match(
      detailRouteSource,
      /getWorkLogEntry\(\{[\s\S]*?authorId: user\.id,[\s\S]*?workDate: date/,
    );
    assert.match(detailRouteSource, /"Cache-Control": "private, no-store"/);
    assert.match(detailRouteSource, /headers: noStoreHeaders, status: 401/);
    assert.match(detailRouteSource, /headers: noStoreHeaders, status: 400/);
    assert.match(detailRouteSource, /headers: noStoreHeaders, status: 404/);
    assert.doesNotMatch(detailRouteSource, /authorId.*searchParams/);
  });

  test("keeps work-log modal editing and deletion recoverable on failure", () => {
    assert.match(detailModalSource, /<AppModal[\s\S]*?mobileFullscreen/);
    assert.match(detailModalSource, /returnFocusTo=\{returnFocusTo\}/);
    assert.match(
      detailModalSource,
      /<button[\s\S]*?data-modal-initial-focus[\s\S]*?>\s*닫기\s*<\/button>/,
    );
    assert.doesNotMatch(
      detailModalSource,
      /<h2[^>]*data-modal-initial-focus/,
    );
    assert.match(detailModalSource, /cache: "no-store"/);
    assert.match(detailModalSource, /AbortController/);
    assert.match(detailModalSource, /response\.json\(\)\.catch\(\(\) => null\)/);
    assert.match(detailModalSource, /workLogModalUnsavedChangesMessage/);
    assert.match(detailModalSource, /name="workDate"[\s\S]*?type="hidden"/);
    assert.match(detailModalSource, /name="expectedUpdatedAt"/);
    assert.match(detailModalSource, /name="workLogId"/);
    assert.match(detailModalSource, /삭제한 업무일지는 복구할 수 없습니다/);
    assert.match(detailModalSource, /role="alert"/);
    assert.match(detailModalSource, /errorRef\.current\?\.focus\(\)/);
    assert.match(detailModalSource, /previousModeRef\.current = mode/);
    assert.match(detailModalSource, /titleRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
    assert.match(detailModalSource, /if \(pending \|\| !dirty\)/);
    assert.match(detailModalSource, /disabled=\{pending \|\| !dirty\}/);
    assert.match(detailModalSource, /disabled=\{pending \|\| Boolean\(state\.conflict\)\}/);
    assert.match(detailModalSource, /pending \? "삭제 중" : "삭제하기"/);
    assert.match(detailModalSource, /aria-describedby=\{warningId\}/);
    assert.match(
      boardSource,
      /querySelector<HTMLElement>\([\s\S]*?data-work-log-grass-cell=[\s\S]*?\.focus\(\{ preventScroll: true \}\)/,
    );
  });

  test("authenticates and atomically deletes only the owner's unchanged work log", () => {
    const deleteActionSource = actionSource.slice(
      actionSource.indexOf("export async function deleteWorkLogAction("),
      actionSource.indexOf("class WorkLogSaveConflictError"),
    );

    assert.match(deleteActionSource, /const user = await requireUser\(\)/);
    assert.match(deleteActionSource, /formData\.get\("workLogId"\)/);
    assert.match(deleteActionSource, /formData\.get\("expectedUpdatedAt"\)/);
    assert.match(
      deleteActionSource,
      /tx\.workLog\.findFirst\([\s\S]*?authorId: user\.id,[\s\S]*?id: workLogId/,
    );
    assert.match(
      deleteActionSource,
      /tx\.workLog\.deleteMany\([\s\S]*?authorId: user\.id,[\s\S]*?updatedAt: existingLog\.updatedAt/,
    );
    assert.match(deleteActionSource, /deleted\.count !== 1/);
    assert.match(deleteActionSource, /TransactionIsolationLevel\.Serializable/);
    assert.match(deleteActionSource, /tx\.auditLog\.create/);
    assert.match(deleteActionSource, /changeType: "workLog\.delete"/);
    assert.match(deleteActionSource, /next: null/);
    assert.match(deleteActionSource, /revalidatePath\(workLogPath\)/);
    assert.doesNotMatch(deleteActionSource, /formData\.get\("authorId"\)/);
  });

  test("renders compact empty and selected recent-work-log states", () => {
    const emptyHtml = renderToStaticMarkup(
      React.createElement(WorkLogRecentList, {
        entries: [],
        hasUnsavedChanges: false,
        selectedDate: "2026-09-02",
      }),
    );
    const listHtml = renderToStaticMarkup(
      React.createElement(WorkLogRecentList, {
        entries: [
          {
            authorName: "홍길동",
            content: "보고 자료를 검토하고 최종본을 제출했습니다.",
            createdAt: "2026-09-02T01:00:00.000Z",
            id: "work-log-1",
            keyword: "월간 보고서",
            updatedAt: "2026-09-02T01:00:00.000Z",
            updatedByName: null,
            workDate: "2026-09-02",
          },
        ],
        hasUnsavedChanges: false,
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
    assert.match(boardSource, /onNavigate=\{[\s\S]*?canLeaveWorkLog[\s\S]*?event\.preventDefault/);
    assert.match(boardSource, /beforeunload/);
    assert.match(boardSource, /hasUnsavedChanges[\s\S]*?state\.success/);
    assert.match(boardSource, /<WorkLogAuditMetadata entry=\{existingLog\}/);
    assert.match(boardSource, /name="expectedUpdatedAt"[\s\S]*?type="hidden"/);
    assert.match(boardSource, /현재 내용으로 덮어쓰기/);
    assert.match(boardSource, /role="alert"/);
    assert.match(loadingSource, /motion-reduce:animate-none/);
  });

  test("blocks navigation only when unsaved changes are rejected", () => {
    let confirmationCount = 0;
    const confirmDiscard = () => {
      confirmationCount += 1;
      return false;
    };

    assert.equal(canLeaveWorkLog(false, confirmDiscard), true);
    assert.equal(confirmationCount, 0);
    assert.equal(canLeaveWorkLog(true, confirmDiscard), false);
    assert.equal(confirmationCount, 1);
    assert.equal(canLeaveWorkLog(true, () => true), true);
  });

  test("tracks draft changes against the last saved values", () => {
    const unchanged = new FormData();
    unchanged.set("keyword", "  월간 보고서  ");
    unchanged.set("content", "  검토 완료  ");

    assert.equal(
      hasWorkLogDraftChanges(unchanged, "월간 보고서", "검토 완료"),
      false,
    );

    unchanged.set("content", "후속 조치 필요");
    assert.equal(
      hasWorkLogDraftChanges(unchanged, "월간 보고서", "검토 완료"),
      true,
    );
  });

  test("does not create a false edit event for an unchanged save", () => {
    assert.match(
      actionSource,
      /existingLog\.keyword === values\.keyword[\s\S]*?existingLog\.content === values\.content[\s\S]*?change: "unchanged"/,
    );
    assert.match(
      actionSource,
      /savedResult\.change !== "unchanged"[\s\S]*?revalidatePath/,
    );
    assert.match(actionSource, /entry: savedResult\.entry/);
  });

  test("preserves input and requires an explicit overwrite for stale saves", () => {
    assert.match(
      actionSource,
      /formData\.get\("expectedUpdatedAt"\)[\s\S]*?hasWorkLogSaveConflict/,
    );
    assert.match(
      actionSource,
      /WorkLogSaveConflictError[\s\S]*?다른 창에서 이 업무일지가 먼저 저장되었습니다/,
    );
    assert.match(
      actionSource,
      /conflictUpdatedAt: error\.currentUpdatedAt[\s\S]*?values/,
    );
  });

  test("deletes work logs before users when reseeding", () => {
    assert.match(
      seedSource,
      /await prisma\.workLog\.deleteMany\(\);[\s\S]*?await prisma\.user\.deleteMany\(\);/,
    );
  });
});

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}
