import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getSupabaseProjectRefFromDatabaseUrl,
  getSupabaseProjectRefFromProjectUrl,
} from "../scripts/supabase-project-ref.mjs";
import { LunchBoxCountCalendarBoard } from "../src/components/lunch-box-count-calendar-board.tsx";
import {
  createLunchBoxCountChangeLogHref,
  LunchBoxCountChangeLog,
} from "../src/components/lunch-box-count-change-log.tsx";
import {
  LunchBoxCountGrid,
  LunchBoxStatusPrintDialog,
} from "../src/components/lunch-box-count-grid.tsx";
import { LunchBoxDailyCheckHistory } from "../src/components/lunch-box-daily-check-history.tsx";
import { LunchBoxManagementSkeleton } from "../src/components/lunch-box-management-skeleton.tsx";
import { LunchBoxDailySchoolChecklist } from "../src/components/lunch-box-daily-school-checklist.tsx";
import {
  lunchBoxChecklistStorageKey,
  LunchBoxSchoolChecklist,
} from "../src/components/lunch-box-school-checklist.tsx";
import {
  createLunchBoxCalendarDays,
  createLunchBoxFixedCountList,
  formatLunchBoxPreservationCellTitle,
  formatLunchBoxPreservationChipLabel,
  formatLunchBoxShortDateLabel,
  normalizeLunchBoxChecklistIds,
  splitLunchBoxChecklistColumns,
  toggleLunchBoxChecklistId,
  formatLunchBoxDateLabel,
  formatLunchBoxMenuItems,
  formatLunchBoxMonthLabel,
  getLunchBoxCalendarWeekDates,
  getLunchBoxCalendarRange,
  getLunchBoxCountTotal,
  getLunchBoxCurrentMonth,
  getLunchBoxMonthRange,
  hasLunchBoxStatusData,
  hasLunchBoxCountChanges,
  isLunchBoxDate,
  isLunchBoxMonth,
  lunchBoxCountChangeLogPageSize,
  lunchBoxDailyCheckHistoryPageSize,
  normalizeLunchBoxCountChangeLogPage,
  normalizeLunchBoxDailyCheckHistoryPage,
  normalizeLunchBoxCountValue,
  normalizeLunchBoxDeliveryDriverCountForSave,
  normalizeLunchBoxMenuItems,
  normalizeLunchBoxPreservationCountForSave,
  normalizeLunchBoxSchoolName,
  normalizeLunchBoxMonth,
  parseLunchBoxCountChangeDetail,
  parseLunchBoxDailyCheckHistoryDetail,
  resolveLunchBoxDisplayedChecklistIds,
  resolveLunchBoxPreservationClassForUpdate,
  setLunchBoxChecklistIdChecked,
  shiftLunchBoxDate,
  shiftLunchBoxMonth,
  type LunchBoxCountGrid as LunchBoxCountGridData,
  type LunchBoxCountChangeLogPage,
  type LunchBoxCountMonth,
  type LunchBoxDailyCheckHistoryPage,
} from "../src/lib/lunch-box-counts-core.ts";
import {
  createLunchBoxRealtimeSyncCoordinator,
  requestLunchBoxRealtimeSync,
} from "../src/lib/lunch-box-realtime-sync.ts";

const lunchBoxCalendarBoardSource = readFileSync(
  new URL(
    "../src/components/lunch-box-count-calendar-board.tsx",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxPageSource = readFileSync(
  new URL("../src/app/work-schedule/lunch-boxes/page.tsx", import.meta.url),
  "utf8",
);
const lunchBoxDailyChecklistSource = readFileSync(
  new URL(
    "../src/components/lunch-box-daily-school-checklist.tsx",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxDailyCheckHistorySource = readFileSync(
  new URL(
    "../src/components/lunch-box-daily-check-history.tsx",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxCountsSource = readFileSync(
  new URL("../src/lib/lunch-box-counts.ts", import.meta.url),
  "utf8",
);
const lunchBoxActionsSource = readFileSync(
  new URL(
    "../src/app/work-schedule/lunch-boxes/actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const prismaSchemaSource = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const lunchBoxCheckMigrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260726150000_add_lunch_box_count_checks/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxCheckEligibilityMigrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260726151000_enforce_lunch_box_check_eligibility/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxRealtimeMigrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260726153000_enable_lunch_box_realtime/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxCheckHistoryIndexMigrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260726160000_index_lunch_box_check_history/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxRealtimeRouteSource = readFileSync(
  new URL(
    "../src/app/api/lunch-boxes/checks/stream/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const supabaseRealtimeServerSource = readFileSync(
  new URL("../src/lib/supabase-realtime-server.ts", import.meta.url),
  "utf8",
);

const grid: LunchBoxCountGridData = {
  date: "2026-07-29",
  menuItems: [
    "잡곡밥",
    "콩나물국",
    "순살닭갈비",
    "너비아니구이",
    "호박나물",
    "배추김치",
  ],
  rows: [
    {
      schoolId: "school-001",
      schoolName: "영만초",
      schoolType: "elementary",
      preservationClass: 1,
      class1Count: 16,
      class2Count: 15,
      class3Count: 14,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 1,
      deliveryDriverCount: 1,
    },
    {
      schoolId: "school-002",
      schoolName: "동남초 병설유치원",
      schoolType: "kindergarten",
      preservationClass: null,
      class1Count: 9,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 1,
      deliveryDriverCount: 0,
    },
  ],
};

const fixedCountList = createLunchBoxFixedCountList({
  counts: [
    ...["2026-07-29", "2026-07-30"].map((date) => ({
      schoolId: "school-001",
      date,
      class1Count: 16,
      class2Count: 15,
      class3Count: 14,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 1,
      deliveryDriverCount: 1,
    })),
    {
      schoolId: "school-002",
      date: "2026-07-29",
      class1Count: 9,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 1,
      deliveryDriverCount: 0,
    },
    ...["2026-08-03", "2026-08-04"].map((date) => ({
      schoolId: "school-002",
      date,
      class1Count: 9,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 0,
      deliveryDriverCount: 0,
    })),
  ],
  schools: [
    {
      id: "school-001",
      name: "영만초",
      preservationClass: 1,
      type: "elementary",
      order: 0,
      active: true,
    },
    {
      id: "school-002",
      name: "동남초 병설유치원",
      preservationClass: null,
      type: "kindergarten",
      order: 1,
      active: true,
    },
  ],
});

async function loadGrid() {
  return { ok: true as const, data: { grid } };
}

async function saveCounts() {
  return { ok: true as const, data: { grid } };
}

async function loadDailyChecklist() {
  return {
    ok: true as const,
    data: {
      checkedSchoolIds: [],
      grid,
    },
  };
}

const emptyDailyCheckHistoryPage: LunchBoxDailyCheckHistoryPage = {
  logs: [],
  page: 1,
  pageSize: lunchBoxDailyCheckHistoryPageSize,
  total: 0,
  totalPages: 1,
};

async function loadDailyCheckHistory() {
  return {
    ok: true as const,
    data: emptyDailyCheckHistoryPage,
  };
}

async function setDailySchoolCheck(
  date: string,
  schoolId: string,
  isChecked: boolean,
) {
  return {
    ok: true as const,
    data: {
      date,
      schoolId,
      isChecked,
    },
  };
}

async function clearDailySchoolChecks(date: string) {
  return {
    ok: true as const,
    data: {
      checkedSchoolIds: [],
      date,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

describe("lunch box counts", () => {
  test("sums the class counts into a row total", () => {
    assert.equal(
      getLunchBoxCountTotal({
        class1Count: 16,
        class2Count: 15,
        class3Count: 14,
        class4Count: 0,
        linkedCount: 0,
        preservationCount: 1,
        deliveryDriverCount: 1,
      }),
      47,
    );
  });

  test("normalizes count values against negative, decimal, and non-numeric input", () => {
    assert.equal(normalizeLunchBoxCountValue("12"), 12);
    assert.equal(normalizeLunchBoxCountValue(-5), 0);
    assert.equal(normalizeLunchBoxCountValue(3.7), 3);
    assert.equal(normalizeLunchBoxCountValue("abc"), 0);
    assert.equal(normalizeLunchBoxCountValue(undefined), 0);
  });

  test("removes allergen markers and recipe stars from menu item names", () => {
    assert.deepEqual(
      normalizeLunchBoxMenuItems([
        "칠리새우볶음⑤⑥⑨⑫",
        "(병아리)콩조림⑤⑥",
        "양념깻잎지⑤⑥ ★",
        "  열무김치(배추김치)⑨  ",
      ]),
      [
        "칠리새우볶음",
        "(병아리)콩조림",
        "양념깻잎지",
        "열무김치(배추김치)",
      ],
    );
    assert.equal(
      formatLunchBoxMenuItems(["잡곡밥", "감자된장국"]),
      "잡곡밥, 감자된장국",
    );
  });

  test("parses detailed count changes without inventing legacy fields", () => {
    const detail = parseLunchBoxCountChangeDetail(
      {
        date: "2026-07-29",
        schools: [
          {
            schoolId: "school-001",
            schoolName: "영만초",
            previous: {
              class1Count: 10,
              class2Count: 5,
            },
            next: {
              class1Count: 12,
              class2Count: 5,
              deliveryDriverCount: 1,
            },
          },
        ],
      },
      "2026-07-28",
    );

    assert.equal(detail.date, "2026-07-29");
    assert.deepEqual(detail.schools, [
      {
        schoolId: "school-001",
        schoolName: "영만초",
        changes: [
          { field: "deliveryDriverCount", previous: 0, next: 1 },
          { field: "class1Count", previous: 10, next: 12 },
        ],
      },
    ]);
    assert.doesNotMatch(JSON.stringify(detail), /preservationCount/);
  });

  test("keeps malformed count history readable and falls back to its target date", () => {
    assert.deepEqual(
      parseLunchBoxCountChangeDetail(null, "2026-07-30"),
      { date: "2026-07-30", schools: [] },
    );
    assert.deepEqual(
      parseLunchBoxCountChangeDetail(
        { date: "bad", schools: [null, [], { next: "bad" }] },
        "2026-07-31",
      ),
      { date: "2026-07-31", schools: [] },
    );
  });

  test("normalizes count-history pages and fixes the page size at ten", () => {
    assert.equal(lunchBoxCountChangeLogPageSize, 10);
    assert.equal(normalizeLunchBoxCountChangeLogPage(undefined), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage("0"), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage("2.5"), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage("bad"), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage(["3", "4"]), 3);
  });

  test("parses daily check history and normalizes its ten-item pages", () => {
    assert.deepEqual(
      parseLunchBoxDailyCheckHistoryDetail({
        date: "2026-07-29",
        nextChecked: true,
        schoolId: " school-001 ",
        schoolName: " 영만초 ",
      }),
      {
        date: "2026-07-29",
        isChecked: true,
        schools: [{ schoolId: "school-001", schoolName: "영만초" }],
      },
    );
    assert.deepEqual(
      parseLunchBoxDailyCheckHistoryDetail({
        changeType: "lunchBoxDailySchoolCheck.clear",
        date: "2026-07-29",
        schools: [
          { schoolId: "school-001", schoolName: "영만초" },
          null,
          { schoolId: "school-002", schoolName: "동남초" },
        ],
      }),
      {
        date: "2026-07-29",
        isChecked: false,
        schools: [
          { schoolId: "school-001", schoolName: "영만초" },
          { schoolId: "school-002", schoolName: "동남초" },
        ],
      },
    );
    assert.deepEqual(
      parseLunchBoxDailyCheckHistoryDetail(
        {
          date: "bad",
          nextChecked: "false",
          schoolId: "",
          schoolName: "   ",
        },
        "2026-07-30",
      ),
      { date: "2026-07-30", isChecked: null, schools: [] },
    );
    assert.equal(lunchBoxDailyCheckHistoryPageSize, 10);
    assert.equal(normalizeLunchBoxDailyCheckHistoryPage(undefined), 1);
    assert.equal(normalizeLunchBoxDailyCheckHistoryPage("0"), 1);
    assert.equal(normalizeLunchBoxDailyCheckHistoryPage("2.5"), 1);
    assert.equal(normalizeLunchBoxDailyCheckHistoryPage(["3", "4"]), 3);
  });

  test("does not create a history entry when an empty row is saved as zero", () => {
    const zeroCounts = {
      preservationCount: 0,
      deliveryDriverCount: 0,
      class1Count: 0,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
    };

    assert.equal(hasLunchBoxCountChanges(null, zeroCounts), false);
    assert.equal(
      hasLunchBoxCountChanges(zeroCounts, {
        ...zeroCounts,
        class1Count: 1,
      }),
      true,
    );
  });

  test("preserves stored preservation counts for older partial save payloads", () => {
    assert.equal(normalizeLunchBoxPreservationCountForSave({}, 1), 1);
    assert.equal(
      normalizeLunchBoxPreservationCountForSave({ preservationCount: 0 }, 1),
      0,
    );
    assert.equal(
      normalizeLunchBoxPreservationCountForSave(
        { preservationCount: "2" },
        1,
      ),
      2,
    );
  });

  test("preserves stored delivery-driver counts for older partial save payloads", () => {
    assert.equal(normalizeLunchBoxDeliveryDriverCountForSave({}, 1), 1);
    assert.equal(
      normalizeLunchBoxDeliveryDriverCountForSave(
        { deliveryDriverCount: 0 },
        1,
      ),
      0,
    );
  });

  test("only clears a school preservation assignment when the field is submitted", () => {
    assert.equal(
      resolveLunchBoxPreservationClassForUpdate({
        previousClass: 2,
        submitted: false,
        value: "",
      }),
      2,
    );
    assert.equal(
      resolveLunchBoxPreservationClassForUpdate({
        previousClass: 2,
        submitted: true,
        value: "",
      }),
      null,
    );
  });

  test("removes city prefixes except from the exact Iri and Iksan school names", () => {
    assert.equal(normalizeLunchBoxSchoolName("이리동초"), "동초");
    assert.equal(normalizeLunchBoxSchoolName("익산가온초"), "가온초");
    assert.equal(
      normalizeLunchBoxSchoolName("이리동남초 병설유치원"),
      "동남초 병설유치원",
    );
    assert.equal(normalizeLunchBoxSchoolName("이리초"), "이리초");
    assert.equal(normalizeLunchBoxSchoolName("익산초"), "익산초");
  });

  test("validates calendar dates", () => {
    assert.equal(isLunchBoxDate("2026-07-29"), true);
    assert.equal(isLunchBoxDate("2026-02-30"), false);
    assert.equal(isLunchBoxDate("2026-7-29"), false);
  });

  test("shifts dates across month boundaries", () => {
    assert.equal(shiftLunchBoxDate("2026-07-31", 1), "2026-08-01");
    assert.equal(shiftLunchBoxDate("2026-08-01", -1), "2026-07-31");
  });

  test("creates the Sunday-to-Saturday dates containing a selected date", () => {
    assert.deepEqual(getLunchBoxCalendarWeekDates("2026-07-20"), [
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
    assert.deepEqual(getLunchBoxCalendarWeekDates("2026-07-19"), [
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
    assert.deepEqual(getLunchBoxCalendarWeekDates("2027-01-01"), [
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    assert.deepEqual(getLunchBoxCalendarWeekDates("bad-date"), []);
  });

  test("prints status pages only for dates with counts or a menu", () => {
    const emptyGrid: LunchBoxCountGridData = {
      date: "2026-07-19",
      menuItems: [],
      rows: grid.rows.map((row) => ({
        ...row,
        class1Count: 0,
        class2Count: 0,
        class3Count: 0,
        class4Count: 0,
        linkedCount: 0,
        preservationCount: 0,
        deliveryDriverCount: 0,
      })),
    };

    assert.equal(
      hasLunchBoxStatusData({
        ...grid,
        menuItems: [],
      }),
      true,
    );
    assert.equal(
      hasLunchBoxStatusData({
        ...emptyGrid,
        menuItems: ["잡곡밥"],
      }),
      true,
    );
    assert.equal(hasLunchBoxStatusData(emptyGrid), false);
  });

  test("formats a date label with the Korean weekday", () => {
    assert.equal(formatLunchBoxDateLabel("2026-07-29"), "2026.07.29.(수)");
  });

  test("renders the count grid with school rows and a save control", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountGrid, {
        initialGrid: grid,
        loadGrid,
        onClose: () => {},
        saveCounts,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /일자별 도시락 현황/);
    assert.match(html, /영만초/);
    assert.match(html, /초등학교/);
    assert.match(html, /동남초 병설유치원/);
    assert.match(html, /병설유치원/);
    assert.match(html, /보존식/);
    assert.match(html, /배송기사/);
    assert.match(
      html,
      /총계 57개 ·\s*보존식 2개 · 배송기사 1개 포함/,
    );
    assert.match(html, /보존식 1반/);
    assert.match(html, /보존식 지정반 없음/);
    assert.match(html, /aria-label="영만초 보존식 개수 \(1반 배정\)"/);
    assert.match(html, /aria-label="영만초 배송기사 도시락 개수"/);
    assert.ok(
      html.indexOf(">보존식</th>") <
        html.indexOf(">배송기사</th>") &&
        html.indexOf(">배송기사</th>") < html.indexOf(">1반</th>"),
      "보존식과 배송기사 열은 1반 열 왼쪽에 있어야 합니다.",
    );
    assert.match(html, />저장</);
    assert.match(html, /변경 사항이 없습니다\./);
    assert.doesNotMatch(html, />오늘</);
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\/print\?date=2026-07-29"/,
    );
    assert.doesNotMatch(html, /status-print\?date=2026-07-29/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noreferrer"/);
    assert.match(
      html,
      /PDF \uC778\uC1C4<\/a><button[^>]*aria-haspopup="dialog"[^>]*>\uD604\uD669\uD45C \uC778\uC1C4<\/button><button[^>]*data-modal-initial-focus[^>]*>\uB2EB\uAE30<\/button>/,
    );
    assert.match(html, /aria-expanded="false"/);
    assert.match(
      html,
      /data-modal-initial-focus[^>]*class="[^"]*bg-\[#b42318\][^"]*"[^>]*>\uB2EB\uAE30<\/button>/,
    );
    assert.match(
      html,
      /class="[^"]*bg-\[#3b5f7f\][^"]*"[^>]*>PDF 인쇄<\/a>/,
    );
    assert.match(html, />PDF 인쇄</);
    assert.match(html, />현황표 인쇄</);
    assert.match(html, /표를 좌우로 밀어 반별 개수를 입력하세요./);
    assert.match(
      html,
      /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/,
    );
    assert.match(
      html,
      /<table class="[^"]*min-w-\[720px\][^"]*table-fixed[^"]*sm:min-w-\[900px\][^"]*">/,
    );
    assert.match(
      html,
      /<input[^>]*class="[^"]*h-11 w-14[^"]*sm:w-16[^"]*"/,
    );
  });

  test("renders daily and weekly status-print choices in a dialog", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxStatusPrintDialog, {
        date: "2026-07-20",
        onClose: () => {},
      }),
    );

    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /7월 20일 현황표 인쇄/);
    assert.match(html, /7월 20일만 인쇄/);
    assert.match(html, /일주일치 인쇄/);
    assert.match(html, /실제 공급일을 날짜별 한 페이지로 묶습니다/);
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\/status-print\?date=2026-07-20"/,
    );
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\/status-print\?date=2026-07-20&amp;period=week"/,
    );
    assert.equal((html.match(/target="_blank"/g) ?? []).length, 2);
    assert.equal((html.match(/rel="noreferrer"/g) ?? []).length, 2);
    assert.match(html, /<a[^>]*data-modal-initial-focus/);
    assert.match(html, /sm:grid-cols-2/);
    assert.match(html, /min-h-16/);
  });

  test("renders an empty state when no schools are registered", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountGrid, {
        initialGrid: { date: "2026-07-29", menuItems: [], rows: [] },
        loadGrid,
        saveCounts,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /등록된 학교가 없습니다/);
    assert.match(html, /학교 등록하기/);
  });

  test("keeps a large school grid inside an independently scrolling region", () => {
    const busyGrid: LunchBoxCountGridData = {
      date: "2026-07-29",
      menuItems: grid.menuItems,
      rows: Array.from({ length: 41 }, (_, index) => ({
        schoolId: `school-${index + 1}`,
        schoolName: `학교 ${index + 1}`,
        schoolType: "elementary" as const,
        preservationClass: 1 as const,
        class1Count: 1,
        class2Count: 2,
        class3Count: 3,
        class4Count: 4,
        linkedCount: 5,
        preservationCount: 1,
        deliveryDriverCount: 1,
      })),
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountGrid, {
        initialGrid: busyGrid,
        loadGrid,
        saveCounts,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /학교 41/);
    assert.match(
      html,
      /class="flex h-full min-h-0 flex-col overflow-hidden [^"]*"/,
    );
    assert.match(
      html,
      /class="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-3 [^"]*sm:px-5 sm:pb-4"/,
    );
    assert.doesNotMatch(html, /overflow-auto px-5/);
    assert.match(
      html,
      /<th class="sticky top-0 left-0 z-30 [^"]*" scope="col">학교명<\/th>/,
    );
    assert.match(
      html,
      /aria-label="학교별 도시락·보존식·배송기사 개수 입력 표"[^>]*role="region"[^>]*tabindex="0"/,
    );
    assert.match(
      html,
      /<th class="sticky left-0 z-10 [^"]*" scope="row">/,
    );
    assert.match(
      html,
      /<tr class="group [^"]*hover:bg-\[#eef7f6\][^"]*focus-within:bg-\[#eef7f6\][^"]*">/,
    );
    assert.match(
      html,
      /<th class="sticky left-0 z-10 [^"]*group-hover:bg-\[#eef7f6\][^"]*group-focus-within:bg-\[#eef7f6\][^"]*" scope="row">/,
    );
    assert.match(html, /<footer class="grid shrink-0 [^"]*">/);
  });
});

describe("lunch box calendar", () => {
  test("uses a desktop-wide count modal with a mobile full-screen layout", () => {
    assert.match(
      lunchBoxCalendarBoardSource,
      /<AppModal\s+className="max-w-7xl"/,
    );
    assert.doesNotMatch(lunchBoxCalendarBoardSource, /className="max-w-4xl"/);
    assert.match(lunchBoxCalendarBoardSource, /mobileFullscreen/);
    assert.match(lunchBoxCalendarBoardSource, /h-dvh/);
    assert.match(lunchBoxCalendarBoardSource, /sm:p-4/);
    assert.match(lunchBoxCalendarBoardSource, /min-w-\[720px\]/);
    assert.match(lunchBoxCalendarBoardSource, /min-w-\[900px\]/);
    assert.match(
      lunchBoxCalendarBoardSource,
      /h-\[calc\(100dvh-3rem\)\]/,
    );
    assert.doesNotMatch(
      lunchBoxCalendarBoardSource,
      /h-\[min\(52rem,calc\(100dvh-3rem\)\)\]/,
    );
    assert.match(
      lunchBoxCalendarBoardSource,
      /function LunchBoxCountGridError[\s\S]*?data-modal-initial-focus/,
    );
    assert.match(
      lunchBoxCalendarBoardSource,
      /function LunchBoxCountGridSkeleton[\s\S]*?data-modal-initial-focus/,
    );
  });

  test("validates and normalizes month values", () => {
    assert.equal(isLunchBoxMonth("2026-07"), true);
    assert.equal(isLunchBoxMonth("2026-13"), false);
    assert.equal(isLunchBoxMonth("2026-7"), false);
    assert.equal(normalizeLunchBoxMonth("2026-07"), "2026-07");
    assert.equal(normalizeLunchBoxMonth("bad"), getLunchBoxCurrentMonth());
    assert.equal(normalizeLunchBoxMonth(undefined), getLunchBoxCurrentMonth());
  });

  test("shifts months across year boundaries", () => {
    assert.equal(shiftLunchBoxMonth("2026-07", 1), "2026-08");
    assert.equal(shiftLunchBoxMonth("2026-12", 1), "2027-01");
    assert.equal(shiftLunchBoxMonth("2026-01", -1), "2025-12");
  });

  test("computes half-open month ranges", () => {
    assert.deepEqual(getLunchBoxMonthRange("2026-07"), {
      endDate: "2026-08-01",
      startDate: "2026-07-01",
    });
    assert.deepEqual(getLunchBoxMonthRange("2026-12"), {
      endDate: "2027-01-01",
      startDate: "2026-12-01",
    });
  });

  test("computes the full 42-day range shown by the calendar", () => {
    assert.deepEqual(getLunchBoxCalendarRange("2026-07"), {
      endDate: "2026-08-09",
      startDate: "2026-06-28",
    });
    assert.deepEqual(getLunchBoxCalendarRange("2026-08"), {
      endDate: "2026-09-06",
      startDate: "2026-07-26",
    });
  });

  test("creates a 42-day calendar grid starting on Sunday", () => {
    const days = createLunchBoxCalendarDays("2026-07");

    assert.equal(days.length, 42);
    assert.equal(days[0].weekday, 0);
    assert.equal(days[0].date, "2026-06-28");
    assert.equal(days[3].date, "2026-07-01");
    assert.equal(days[3].isCurrentMonth, true);
    assert.equal(days[0].isCurrentMonth, false);
    assert.equal(days[41].weekday, 6);
  });

  test("formats month labels in Korean", () => {
    assert.equal(formatLunchBoxMonthLabel("2026-07"), "2026년 7월");
    assert.equal(formatLunchBoxMonthLabel("2026-11"), "2026년 11월");
  });

  test("renders calendar cells with per-school counts and daily totals", () => {
    const monthData: LunchBoxCountMonth = {
      month: "2026-07",
      days: {
        "2026-07-29": {
          date: "2026-07-29",
          menuItems: grid.menuItems,
          totalCount: 57,
          schools: [
            {
              schoolId: "school-001",
              schoolName: "영만초",
              schoolType: "elementary",
              total: 47,
            },
            {
              schoolId: "school-002",
              schoolName: "동남초 병설유치원",
              schoolType: "kindergarten",
              total: 10,
            },
          ],
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData,
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /2026년 7월/);
    assert.match(html, /월 총계 57개/);
    assert.match(html, /보존식·배송기사 포함/);
    assert.match(html, /영만초/);
    assert.match(html, /동남초 병설유치원/);
    assert.match(html, />47</);
    assert.match(html, />10</);
    assert.match(html, /57개/);
    assert.match(html, /잡곡밥, 콩나물국, 순살닭갈비/);
    assert.match(html, /href="\/work-schedule\/lunch-boxes\?month=2026-06"/);
    assert.match(html, /href="\/work-schedule\/lunch-boxes\?month=2026-08"/);
    assert.match(html, /2026년 7월 29일 도시락 개수 입력|2026\.07\.29\.\(수\) 도시락 개수 입력/);
  });

  test("renders next-month counts inside the current calendar grid", () => {
    const monthData: LunchBoxCountMonth = {
      month: "2026-07",
      days: {
        "2026-08-03": {
          date: "2026-08-03",
          menuItems: [],
          totalCount: 37,
          schools: [
            {
              schoolId: "school-august",
              schoolName: "팔월초",
              schoolType: "elementary",
              total: 37,
            },
          ],
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData,
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /팔월초/);
    assert.match(html, /37개/);
    assert.match(html, /2026\.08\.03\.\(월\) 도시락 개수 입력/);
    assert.match(html, /월 총계 0개/);
  });

  test("renders empty calendar cells without count badges", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData: { month: "2026-07", days: {} },
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /2026년 7월/);
    assert.match(html, /월 총계 0개/);
    assert.doesNotMatch(html, /개<\/span><\/div><ul/);
    assert.doesNotMatch(html, /영만초/);
  });

  test("limits school previews so a busy calendar day keeps a fixed height", () => {
    const monthData: LunchBoxCountMonth = {
      month: "2026-07",
      days: {
        "2026-07-29": {
          date: "2026-07-29",
          menuItems: grid.menuItems,
          totalCount: 150,
          schools: Array.from({ length: 5 }, (_, index) => ({
            schoolId: `school-${index + 1}`,
            schoolName: `학교 ${index + 1}`,
            schoolType: "elementary" as const,
            total: 30,
          })),
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData,
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /학교 1/);
    assert.match(html, /학교 2/);
    assert.match(html, /외 3곳/);
    assert.doesNotMatch(html, /학교 3/);
    assert.match(html, /h-36/);
  });
});

describe("lunch box count change log", () => {
  const changeLogPage: LunchBoxCountChangeLogPage = {
    logs: [
      {
        id: "log-001",
        date: "2026-07-29",
        createdAt: "2026-07-20T05:30:00.000Z",
        message: "2026-07-29 도시락 개수를 2개교 반영했습니다.",
        actor: {
          id: "user-001",
          name: "김담당",
          departmentName: "생활복지팀",
          positionName: "생활지도원",
          profileImageStorageKey: null,
          profileImageUpdatedAt: null,
        },
        schools: [
          {
            schoolId: "school-001",
            schoolName: "영만초",
            changes: [
              { field: "preservationCount", previous: 0, next: 1 },
              { field: "class1Count", previous: 10, next: 12 },
            ],
          },
          {
            schoolId: "school-002",
            schoolName: "동남초 병설유치원",
            changes: [
              { field: "deliveryDriverCount", previous: 0, next: 1 },
            ],
          },
        ],
      },
    ],
    page: 2,
    pageSize: 10,
    total: 21,
    totalPages: 3,
  };

  test("renders who changed each school field before and after", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountChangeLog, {
        changeLogPage,
        selectedMonth: "2026-07",
      }),
    );

    assert.match(html, /도시락 변경 기록/);
    assert.match(html, /21건 중 11-20건 표시/);
    assert.match(html, /김담당/);
    assert.match(html, /생활복지팀/);
    assert.match(html, /생활지도원/);
    assert.match(html, /대상일 2026\.07\.29\.\(수\)/);
    assert.match(html, /영만초/);
    assert.match(html, /동남초 병설유치원/);
    assert.match(html, /보존식/);
    assert.match(html, /배송기사/);
    assert.match(html, /1반/);
    assert.match(html, /0/);
    assert.match(html, /12/);
    assert.match(html, /aria-label="학교별 상세 변경값"/);
    assert.match(html, /2 \/ 3 페이지/);
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\?month=2026-07#lunch-box-change-log"/,
    );
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\?month=2026-07&amp;logPage=3#lunch-box-change-log"/,
    );
  });

  test("keeps the calendar before history and renders a matching loading state", () => {
    assert.ok(
      lunchBoxPageSource.indexOf("<LunchBoxCountCalendarBoard") <
        lunchBoxPageSource.indexOf("<LunchBoxCountChangeLog"),
      "도시락 변경 기록은 달력 아래에 렌더링되어야 합니다.",
    );

    const loadingHtml = renderToStaticMarkup(
      React.createElement(LunchBoxManagementSkeleton),
    );

    assert.match(loadingHtml, /aria-label="도시락 현황 로딩"/);
    assert.match(loadingHtml, /aria-label="도시락 변경 기록 로딩"/);
  });

  test("creates month-preserving page links and a clear empty state", () => {
    assert.equal(
      createLunchBoxCountChangeLogHref({
        page: 1,
        selectedMonth: "2026-07",
      }),
      "/work-schedule/lunch-boxes?month=2026-07#lunch-box-change-log",
    );
    assert.equal(
      createLunchBoxCountChangeLogHref({
        page: 4,
        selectedMonth: "2026-07",
      }),
      "/work-schedule/lunch-boxes?month=2026-07&logPage=4#lunch-box-change-log",
    );

    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountChangeLog, {
        changeLogPage: {
          logs: [],
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 1,
        },
        selectedMonth: "2026-07",
      }),
    );

    assert.match(html, /아직 기록된 도시락 변경 내역이 없습니다/);
    assert.doesNotMatch(html, /도시락 변경 기록 페이지/);
  });

  test("renders daily check and uncheck history with actor and second-level time", () => {
    const historyPage: LunchBoxDailyCheckHistoryPage = {
      logs: [
        {
          id: "check-log-001",
          date: "2026-07-29",
          isChecked: true,
          schools: [{ schoolId: "school-001", schoolName: "영만초" }],
          message: null,
          createdAt: "2026-07-20T05:30:45.000Z",
          actor: {
            id: "user-001",
            name: "김담당",
            departmentName: "생활복지팀",
            positionName: "생활지도원",
            profileImageStorageKey: null,
            profileImageUpdatedAt: null,
          },
        },
        {
          id: "check-log-002",
          date: "2026-07-29",
          isChecked: false,
          schools: [
            {
              schoolId: "school-002",
              schoolName: "동남초 병설유치원",
            },
          ],
          message: null,
          createdAt: "2026-07-19T15:00:00.000Z",
          actor: {
            id: "user-002",
            name: "이담당",
            departmentName: "급식지원팀",
            positionName: "팀원",
            profileImageStorageKey: null,
            profileImageUpdatedAt: null,
          },
        },
      ],
      page: 2,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxDailyCheckHistory, {
        error: "",
        historyPage,
        isPending: false,
        onPageChange: () => undefined,
        onRetry: () => undefined,
      }),
    );

    assert.match(html, /변경 기록/);
    assert.match(html, /21건 중 11-20건 표시/);
    assert.match(html, /최신 변경순 · 페이지당 10건/);
    assert.match(html, /14:30:45/);
    assert.match(html, /00:00:00/);
    assert.match(html, />체크</);
    assert.match(html, /체크 해제/);
    assert.match(html, /영만초/);
    assert.match(html, /동남초 병설유치원/);
    assert.match(html, /김담당/);
    assert.match(html, /생활복지팀/);
    assert.match(html, /생활지도원/);
    assert.match(html, /2 \/ 3 페이지/);
    assert.match(
      html,
      /aria-label="날짜별 학교 체크 변경 기록 페이지"/,
    );
    assert.match(html, />이전</);
    assert.match(html, />다음</);
  });

  test("provides empty and recoverable error states for daily check history", () => {
    const emptyHtml = renderToStaticMarkup(
      React.createElement(LunchBoxDailyCheckHistory, {
        error: "",
        historyPage: emptyDailyCheckHistoryPage,
        isPending: false,
        onPageChange: () => undefined,
        onRetry: () => undefined,
      }),
    );
    const errorHtml = renderToStaticMarkup(
      React.createElement(LunchBoxDailyCheckHistory, {
        error: "체크 변경 기록을 불러오지 못했습니다.",
        historyPage: emptyDailyCheckHistoryPage,
        isPending: false,
        onPageChange: () => undefined,
        onRetry: () => undefined,
      }),
    );

    assert.match(
      emptyHtml,
      /아직 기록된 학교 체크 변경 내역이 없습니다/,
    );
    assert.doesNotMatch(
      emptyHtml,
      /aria-label="날짜별 학교 체크 변경 기록 페이지"/,
    );
    assert.match(errorHtml, /role="alert"/);
    assert.match(errorHtml, /다시 시도/);
  });

  test("labels preservation counts with their assigned class", () => {
    assert.equal(formatLunchBoxPreservationChipLabel(1, 2), "보존식 1(2반)");
    assert.equal(
      formatLunchBoxPreservationChipLabel(2, null),
      "보존식 2(반 미지정)",
    );
    assert.equal(formatLunchBoxPreservationChipLabel(0, 1), null);
  });

  test("tracks checked schools without leaking stale ids", () => {
    assert.equal(
      lunchBoxChecklistStorageKey,
      "lunch-box-school-checklist:fixed",
    );
    assert.deepEqual(
      toggleLunchBoxChecklistId(["school-001"], "school-002"),
      ["school-001", "school-002"],
    );
    assert.deepEqual(
      toggleLunchBoxChecklistId(["school-001", "school-002"], "school-001"),
      ["school-002"],
    );
    assert.deepEqual(
      normalizeLunchBoxChecklistIds(
        ["school-001", "school-001", "removed-school", 7, null],
        grid.rows,
      ),
      ["school-001"],
    );
    assert.deepEqual(normalizeLunchBoxChecklistIds("not-an-array", grid.rows), []);
  });

  test("applies canonical server check states without duplicating schools", () => {
    assert.deepEqual(
      setLunchBoxChecklistIdChecked(
        ["school-001", "school-002"],
        "school-001",
        true,
      ),
      ["school-002", "school-001"],
    );
    assert.deepEqual(
      setLunchBoxChecklistIdChecked(
        ["school-001", "school-002"],
        "school-001",
        false,
      ),
      ["school-002"],
    );
  });

  test("keeps optimistic checks layered over realtime canonical snapshots", () => {
    const rows = [
      { schoolId: "school-001" },
      { schoolId: "school-002" },
    ];

    assert.deepEqual(
      resolveLunchBoxDisplayedChecklistIds({
        canonicalCheckedIds: ["school-001", "school-002"],
        clearPending: false,
        pendingChecks: new Map([["school-001", false]]),
        rows,
      }),
      ["school-002"],
    );
    assert.deepEqual(
      resolveLunchBoxDisplayedChecklistIds({
        canonicalCheckedIds: ["school-002"],
        clearPending: false,
        pendingChecks: new Map([["school-001", true]]),
        rows,
      }),
      ["school-002", "school-001"],
    );
    assert.deepEqual(
      resolveLunchBoxDisplayedChecklistIds({
        canonicalCheckedIds: ["school-002"],
        clearPending: true,
        pendingChecks: new Map([["school-001", true]]),
        rows,
      }),
      [],
    );
  });

  test("persists daily checks on the lunch-box count row with actor metadata", () => {
    assert.match(prismaSchemaSource, /checkedAt\s+DateTime\?/);
    assert.match(prismaSchemaSource, /checkedById\s+String\?/);
    assert.match(
      prismaSchemaSource,
      /@relation\("LunchBoxCountChecker"[\s\S]*?onDelete: SetNull\)/,
    );
    assert.match(lunchBoxCheckMigrationSource, /ADD COLUMN "checkedAt"/);
    assert.match(lunchBoxCheckMigrationSource, /ADD COLUMN "checkedById"/);
    assert.match(
      lunchBoxCheckMigrationSource,
      /FOREIGN KEY \("checkedById"\) REFERENCES "User"\("id"\)/,
    );
    assert.match(
      lunchBoxCheckEligibilityMigrationSource,
      /"checkedAt" IS NULL[\s\S]*?"deliveryDriverCount"[\s\S]*?> 0/,
    );
  });

  test("stores and pages detailed daily check audit logs", () => {
    assert.match(
      prismaSchemaSource,
      /@@index\(\[action, targetType, createdAt, id\]\)/,
    );
    assert.match(
      lunchBoxCheckHistoryIndexMigrationSource,
      /CREATE INDEX "AuditLog_action_targetType_createdAt_id_idx"[\s\S]*?ON "AuditLog"\("action", "targetType", "createdAt", "id"\)/,
    );
    assert.match(
      lunchBoxCountsSource,
      /targetType: "LunchBoxDailySchoolCheck"[\s\S]*?path: \["date"\][\s\S]*?equals: date/,
    );
    assert.match(
      lunchBoxCountsSource,
      /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\][\s\S]*?take: pageSize/,
    );
    assert.match(
      lunchBoxActionsSource,
      /if \(updatedCount\)[\s\S]*?auditLog\.create\([\s\S]*?nextChecked: isChecked,[\s\S]*?previousChecked: !isChecked,[\s\S]*?createdAt: changedAt/,
    );
    assert.match(
      lunchBoxActionsSource,
      /clearLunchBoxDailySchoolChecksAction[\s\S]*?auditLog\.createMany\([\s\S]*?clearedCounts\.map\([\s\S]*?targetId: count\.id,[\s\S]*?nextChecked: false,[\s\S]*?previousChecked: true,[\s\S]*?createdAt: clearedAt/,
    );
    assert.match(lunchBoxDailyCheckHistorySource, /second: "2-digit"/);
    assert.match(lunchBoxDailyCheckHistorySource, /hourCycle: "h23"/);
  });

  test("streams authenticated realtime invalidations without exposing database access", () => {
    assert.match(
      lunchBoxRealtimeMigrationSource,
      /ALTER PUBLICATION supabase_realtime[\s\S]*?ADD TABLE public\."LunchBoxCount"/,
    );
    assert.match(lunchBoxRealtimeRouteSource, /getSessionUserId\(\)/);
    assert.match(
      lunchBoxRealtimeRouteSource,
      /status: UserStatus\.ACTIVE/,
    );
    assert.match(
      lunchBoxRealtimeRouteSource,
      /"postgres_changes"[\s\S]*?table: "LunchBoxCount"/,
    );
    assert.match(
      lunchBoxRealtimeRouteSource,
      /"Content-Type": "text\/event-stream; charset=utf-8"/,
    );
    assert.match(
      lunchBoxRealtimeRouteSource,
      /status === "CHANNEL_ERROR"[\s\S]*?status === "TIMED_OUT"[\s\S]*?status === "CLOSED"/,
    );
    assert.match(
      lunchBoxRealtimeRouteSource,
      /addEventListener\("abort", handleAbort[\s\S]*?request\.signal\.aborted[\s\S]*?channel/,
    );
    assert.match(
      supabaseRealtimeServerSource,
      /process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
    );
    assert.doesNotMatch(
      lunchBoxDailyChecklistSource,
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  test("reconciles realtime changes and reconnect gaps from canonical DB state", () => {
    assert.match(lunchBoxDailyChecklistSource, /new EventSource\(/);
    assert.match(
      lunchBoxDailyChecklistSource,
      /addEventListener\("change"/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /addEventListener\("ready"/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /visibilitychange/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /await requestCanonicalSync\(activeDate\)/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /resolveLunchBoxDisplayedChecklistIds/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /realtimeFallbackSyncIntervalMs[\s\S]*?setInterval\([\s\S]*?!isRealtimeReady[\s\S]*?scheduleCanonicalSync\(0\)/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /if \(!loadedNextDate\) \{\s*void requestCanonicalSync\(activeDateRef\.current\)/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /Promise\.allSettled\(\[\s*loadChecklist\(nextDate\),\s*loadCheckHistory\(nextDate, 1\)/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /void requestCanonicalSync\(date\);\s*void requestCheckHistorySync\(date\)/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /await requestCanonicalSync\(activeDate\);[\s\S]*?void requestCheckHistorySync\(activeDate\)/,
    );
  });

  test("restores realtime sync after Strict Mode remounts and repeated failures", () => {
    assert.match(
      lunchBoxDailyChecklistSource,
      /useEffect\(\(\) => \{\s*isMountedRef\.current = true;\s*activeDateRef\.current = syncCoordinatorRef\.current\.date;/,
    );
    assert.match(
      lunchBoxDailyChecklistSource,
      /async function retryCanonicalSync\(\)[\s\S]*?if \(!disposed && !succeeded\)[\s\S]*?retryCanonicalSync\(\)/,
    );
  });

  test("serializes realtime canonical reads and catches changes received in flight", async () => {
    const coordinator =
      createLunchBoxRealtimeSyncCoordinator("2026-07-29");
    const firstLoad = createDeferred<
      { data: string; ok: true } | { ok: false }
    >();
    const secondLoad = createDeferred<
      { data: string; ok: true } | { ok: false }
    >();
    const secondLoadStarted = createDeferred<void>();
    const appliedSnapshots: string[] = [];
    let loadCount = 0;

    const requestSync = () =>
      requestLunchBoxRealtimeSync({
        coordinator,
        isActive: () => true,
        load: () => {
          loadCount += 1;

          if (loadCount === 1) {
            return firstLoad.promise;
          }

          secondLoadStarted.resolve();
          return secondLoad.promise;
        },
        apply: (snapshot) => appliedSnapshots.push(snapshot),
        onFailure: () => assert.fail("sync should not fail"),
      });

    const firstRequest = requestSync();
    const secondRequest = requestSync();

    assert.equal(loadCount, 1);
    firstLoad.resolve({ data: "first", ok: true });
    await secondLoadStarted.promise;
    assert.equal(loadCount, 2);
    secondLoad.resolve({ data: "second", ok: true });

    assert.deepEqual(
      await Promise.all([firstRequest, secondRequest]),
      [true, true],
    );
    assert.deepEqual(appliedSnapshots, ["first", "second"]);
    assert.equal(coordinator.inFlight, null);
  });

  test("reports consecutive canonical failures and later converges", async () => {
    const coordinator =
      createLunchBoxRealtimeSyncCoordinator("2026-07-29");
    const outcomes = [
      { ok: false as const },
      new Error("temporary database failure"),
      { data: "recovered", ok: true as const },
    ];
    const appliedSnapshots: string[] = [];
    let failureCount = 0;

    const requestSync = () =>
      requestLunchBoxRealtimeSync({
        coordinator,
        isActive: () => true,
        load: async () => {
          const outcome = outcomes.shift();

          if (outcome instanceof Error) {
            throw outcome;
          }

          return outcome ?? { ok: false as const };
        },
        apply: (snapshot) => appliedSnapshots.push(snapshot),
        onFailure: () => {
          failureCount += 1;
        },
      });

    assert.equal(await requestSync(), false);
    assert.equal(await requestSync(), false);
    assert.equal(await requestSync(), true);
    assert.equal(failureCount, 2);
    assert.deepEqual(appliedSnapshots, ["recovered"]);
  });

  test("requires the database and realtime URL to use the same Supabase project", () => {
    assert.equal(
      getSupabaseProjectRefFromProjectUrl(
        "https://abcdefghijklmnopqrst.supabase.co",
      ),
      "abcdefghijklmnopqrst",
    );
    assert.equal(
      getSupabaseProjectRefFromDatabaseUrl(
        "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
      ),
      "abcdefghijklmnopqrst",
    );
    assert.equal(
      getSupabaseProjectRefFromDatabaseUrl(
        "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      ),
      "abcdefghijklmnopqrst",
    );
    assert.equal(
      getSupabaseProjectRefFromDatabaseUrl(
        "postgresql://postgres:secret@neon.example.com/database",
      ),
      null,
    );
  });

  test("uses authenticated idempotent server actions instead of browser storage", () => {
    assert.doesNotMatch(lunchBoxDailyChecklistSource, /localStorage/);
    assert.doesNotMatch(lunchBoxDailyChecklistSource, /useSyncExternalStore/);
    assert.match(
      lunchBoxActionsSource,
      /function setLunchBoxDailySchoolCheckAction[\s\S]*?requireUser\(\)/,
    );
    assert.match(
      lunchBoxActionsSource,
      /function setLunchBoxDailySchoolCheckAction[\s\S]*?schoolId_date/,
    );
    assert.match(
      lunchBoxActionsSource,
      /function clearLunchBoxDailySchoolChecksAction[\s\S]*?updateManyAndReturn/,
    );
    assert.match(
      lunchBoxActionsSource,
      /function setLunchBoxDailySchoolCheckAction[\s\S]*?FOR UPDATE/,
    );
    assert.match(
      lunchBoxActionsSource,
      /function setLunchBoxDailySchoolCheckAction[\s\S]*?school:\s*\{\s*active: true\s*\}/,
    );
    assert.match(
      lunchBoxActionsSource,
      /function setLunchBoxDailySchoolCheckAction[\s\S]*?OR: lunchBoxPositiveCountFilters/,
    );
    assert.match(
      lunchBoxActionsSource,
      /update:\s*\{[\s\S]*?checkedAt: null,[\s\S]*?checkedById: null/,
    );
  });

  test("adds a daily school-list tab to the right of the fixed list", () => {
    const fixedListTabIndex = lunchBoxPageSource.indexOf(
      'label="도시락 학교 목록"',
    );
    const dailyListTabIndex = lunchBoxPageSource.indexOf(
      'label="날짜별 학교 목록"',
    );
    const schoolManagementTabIndex = lunchBoxPageSource.indexOf(
      'label="학교 관리"',
    );

    assert.ok(fixedListTabIndex >= 0);
    assert.ok(dailyListTabIndex > fixedListTabIndex);
    assert.ok(schoolManagementTabIndex > dailyListTabIndex);
    assert.match(lunchBoxPageSource, /value === "daily-school-list"/);
  });

  test("renders only schools assigned to the selected date with navigation", () => {
    const dailyGrid: LunchBoxCountGridData = {
      date: "2026-07-29",
      menuItems: [],
      rows: [
        {
          ...grid.rows[0],
          schoolId: "zero-school",
          schoolName: "수량없는초",
          class1Count: 0,
          class2Count: 0,
          class3Count: 0,
          class4Count: 0,
          linkedCount: 0,
          preservationCount: 0,
          deliveryDriverCount: 0,
        },
        {
          ...grid.rows[0],
          schoolId: "preservation-school",
          schoolName: "보존식만있는초",
          class1Count: 0,
          class2Count: 0,
          class3Count: 0,
          class4Count: 0,
          linkedCount: 0,
          preservationCount: 1,
          deliveryDriverCount: 0,
        },
        {
          ...grid.rows[0],
          schoolId: "driver-school",
          schoolName: "기사도시락만있는초",
          class1Count: 0,
          class2Count: 0,
          class3Count: 0,
          class4Count: 0,
          linkedCount: 0,
          preservationCount: 0,
          deliveryDriverCount: 1,
        },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxDailySchoolChecklist, {
        clearChecks: clearDailySchoolChecks,
        initialCheckHistoryPage: emptyDailyCheckHistoryPage,
        initialChecklist: {
          checkedSchoolIds: ["preservation-school"],
          grid: dailyGrid,
        },
        loadCheckHistory: loadDailyCheckHistory,
        loadChecklist: loadDailyChecklist,
        setSchoolCheck: setDailySchoolCheck,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /날짜별 학교 목록/);
    assert.match(html, /2026\.07\.29\.\(수\)/);
    assert.match(html, /2개교/);
    assert.match(html, /체크 1\/2/);
    assert.match(html, /보존식만있는초/);
    assert.match(html, /기사도시락만있는초/);
    assert.doesNotMatch(html, /수량없는초/);
    assert.match(html, /aria-label="학교 목록 날짜"/);
    assert.match(html, />전날</);
    assert.match(html, />다음날</);
    assert.match(html, /type="checkbox"/);
    assert.match(html, /checked=""/);
    assert.match(
      html,
      /체크·해제는 접속 중인 모든\s*직원 화면에 실시간 반영됩니다/,
    );
    assert.match(html, /실시간 연결 중/);
    assert.match(
      html,
      /aria-label="보존식만있는초 2026\.07\.29\.\(수\) 준비 완료"/,
    );
  });

  test("shows a compact empty state for a date without assigned schools", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxDailySchoolChecklist, {
        clearChecks: clearDailySchoolChecks,
        initialCheckHistoryPage: emptyDailyCheckHistoryPage,
        initialChecklist: {
          checkedSchoolIds: [],
          grid: {
            date: "2026-07-26",
            menuItems: [],
            rows: grid.rows.map((row) => ({
              ...row,
              class1Count: 0,
              class2Count: 0,
              class3Count: 0,
              class4Count: 0,
              linkedCount: 0,
              preservationCount: 0,
              deliveryDriverCount: 0,
            })),
          },
        },
        loadCheckHistory: loadDailyCheckHistory,
        loadChecklist: loadDailyChecklist,
        setSchoolCheck: setDailySchoolCheck,
        today: "2026-07-26",
      }),
    );

    assert.match(html, /이 날짜에 배정된 학교가 없습니다/);
    assert.match(html, /전날이나 다음날을 확인하세요/);
    assert.doesNotMatch(html, /type="checkbox"/);
  });

  test("folds every date into one fixed row per school", () => {
    const schools = [
      {
        id: "school-001",
        name: "영만초",
        preservationClass: 1 as const,
        type: "elementary" as const,
        order: 0,
        active: true,
      },
      {
        id: "school-002",
        name: "동남초 병설유치원",
        preservationClass: null,
        type: "kindergarten" as const,
        order: 1,
        active: true,
      },
      {
        id: "school-003",
        name: "삼성초",
        preservationClass: 1 as const,
        type: "elementary" as const,
        order: 2,
        active: true,
      },
    ];
    const base = {
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
      deliveryDriverCount: 0,
    };
    const fixedList = createLunchBoxFixedCountList({
      counts: [
        // 영만초는 3일 모두 같은 수량이다.
        ...["2026-07-29", "2026-07-30", "2026-07-31"].map((date) => ({
          ...base,
          schoolId: "school-001",
          date,
          class1Count: 16,
          class2Count: 15,
          preservationCount: 1,
        })),
        // 병설유치원은 보존식이 있는 날 1일, 없는 날 2일로 갈린다.
        {
          ...base,
          schoolId: "school-002",
          date: "2026-07-29",
          class1Count: 9,
          preservationCount: 1,
        },
        ...["2026-08-03", "2026-08-04"].map((date) => ({
          ...base,
          schoolId: "school-002",
          date,
          class1Count: 9,
          preservationCount: 0,
        })),
        // 전량 0인 날은 공급일로 세지 않는다.
        {
          ...base,
          schoolId: "school-003",
          date: "2026-08-12",
          class1Count: 0,
          preservationCount: 0,
        },
      ],
      schools,
    });

    assert.deepEqual(
      fixedList.rows.map((row) => row.schoolName),
      ["영만초", "동남초 병설유치원"],
    );
    assert.deepEqual(fixedList.idleSchoolNames, ["삼성초"]);
    assert.deepEqual(fixedList.varyingSchoolNames, ["동남초 병설유치원"]);

    const [first, second] = fixedList.rows;
    assert.equal(first.supplyDayCount, 3);
    assert.equal(first.firstDate, "2026-07-29");
    assert.equal(first.lastDate, "2026-07-31");
    assert.equal(first.total, 32);
    assert.equal(first.varianceNote, null);
    // 최빈값(보존식 0인 2일)을 기준으로 삼고 예외를 note로 남긴다.
    assert.equal(second.preservationCount, 0);
    assert.equal(second.supplyDayCount, 3);
    assert.equal(second.varianceNote, "3일 중 2일 기준 · 다른 수량 1종");
    assert.deepEqual(fixedList.visibleServingFields, [
      "class1Count",
      "class2Count",
    ]);
    assert.equal(fixedList.hasDeliveryDriver, false);
    assert.equal(fixedList.totalCount, 41);
  });

  test("orders schools by their first supply date across the whole period", () => {
    const school = (id: string, name: string, order: number) => ({
      id,
      name,
      preservationClass: 1 as const,
      type: "elementary" as const,
      order,
      active: true,
    });
    const day = (schoolId: string, date: string) => ({
      schoolId,
      date,
      class1Count: 10,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 1,
      deliveryDriverCount: 0,
    });
    const sorted = createLunchBoxFixedCountList({
      counts: [
        day("late", "2026-07-30"),
        day("onStart", "2026-07-27"),
        // 7.27 이전에 시작하는 학교도 실제 시작일 그대로 앞에 놓는다.
        day("earliest", "2026-07-16"),
        day("earliest", "2026-08-03"),
        day("early", "2026-07-20"),
        day("early", "2026-07-27"),
        // 7.24에 시작하지만 전량 0인 날은 시작일로 세지 않는다.
        {
          ...day("zeroFirst", "2026-07-22"),
          class1Count: 0,
          preservationCount: 0,
        },
        day("zeroFirst", "2026-07-24"),
      ],
      schools: [
        school("late", "늦은초", 0),
        school("onStart", "기준일초", 1),
        school("earliest", "가장먼저초", 2),
        school("early", "먼저초", 3),
        school("zeroFirst", "빈날초", 4),
      ],
    });

    assert.deepEqual(
      sorted.rows.map((row) => [row.schoolName, row.firstDate]),
      [
        ["가장먼저초", "2026-07-16"],
        ["먼저초", "2026-07-20"],
        ["빈날초", "2026-07-24"],
        ["기준일초", "2026-07-27"],
        ["늦은초", "2026-07-30"],
      ],
    );
  });

  test("formats short date labels for the start column", () => {
    assert.equal(formatLunchBoxShortDateLabel("2026-07-16"), "7.16");
    assert.equal(formatLunchBoxShortDateLabel("2026-07-27"), "7.27");
    assert.equal(formatLunchBoxShortDateLabel("2026-08-03"), "8.3");
    assert.equal(formatLunchBoxShortDateLabel("bad-date"), "bad-date");
  });

  test("renders every school at once with counts next to each name", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxSchoolChecklist, { fixedCountList }),
    );

    assert.match(html, /도시락 학교 목록/);
    assert.match(html, /보존식 1\(1반\)/);
    assert.match(html, /체크 0\/2/);
    assert.match(html, /type="checkbox"/);
    // 날짜 이동 없이 전체를 한 번에 보여준다.
    assert.doesNotMatch(html, /전날/);
    assert.doesNotMatch(html, /다음날/);
    assert.doesNotMatch(html, /도시락 학교 목록 날짜/);
    // 데스크톱 3단 고정 열 배치가 함께 렌더된다.
    assert.match(html, /aria-label="도시락 학교 목록 1단"/);
    assert.match(html, /aria-label="영만초 준비 완료"/);
    assert.match(html, /날짜마다 수량이 다른 학교/);
  });

  test("splits checklist rows into balanced fixed-column groups", () => {
    const rows = Array.from({ length: 41 }, (_, index) => ({
      schoolId: `school-${index}`,
    })) as unknown as Parameters<typeof splitLunchBoxChecklistColumns>[0];

    assert.deepEqual(
      splitLunchBoxChecklistColumns(rows, 3).map((column) => column.length),
      [14, 14, 13],
    );
    assert.deepEqual(
      splitLunchBoxChecklistColumns(rows.slice(0, 2), 3).map(
        (column) => column.length,
      ),
      [1, 1],
    );
    assert.deepEqual(splitLunchBoxChecklistColumns([], 3), [[]]);
  });

  test("describes preservation cells for hover and screen readers", () => {
    assert.equal(
      formatLunchBoxPreservationCellTitle("이리초", 1, 2),
      "이리초 보존식 1개 · 2반 배정",
    );
    assert.equal(
      formatLunchBoxPreservationCellTitle("북초 병설유치원", 1, null),
      "북초 병설유치원 보존식 1개 · 배정 반 미지정",
    );
    assert.equal(
      formatLunchBoxPreservationCellTitle("동남초 병설유치원", 0, null),
      "동남초 병설유치원 보존식 없음",
    );
  });

  test("shows an empty checklist state when no count is registered", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxSchoolChecklist, {
        fixedCountList: {
          hasDeliveryDriver: false,
          idleSchoolNames: [],
          preservationTotal: 0,
          rows: [],
          totalCount: 0,
          varyingSchoolNames: [],
          visibleServingFields: [],
        },
      }),
    );

    assert.match(html, /아직 등록된 도시락 수량이 없습니다/);
    assert.doesNotMatch(html, /체크 전체 해제/);
  });
});
