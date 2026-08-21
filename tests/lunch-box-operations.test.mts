import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LunchBoxOperationsBoard } from "../src/components/lunch-box-operations-board.tsx";
import {
  createEmptyLunchBoxDailyOperation,
  createLunchBoxOperationSummary,
  formatLunchBoxWorkMinutes,
  getLunchBoxOperationsMonthRange,
  getLunchBoxShiftMinutes,
  maxLunchBoxIngredientPurchaseCount,
  maxLunchBoxWorkShiftCount,
  validateLunchBoxOperationsInput,
  type LunchBoxOperationsViewData,
} from "../src/lib/lunch-box-operations-core.ts";

const pageSource = readFileSync(
  new URL("../src/app/work-schedule/lunch-boxes/page.tsx", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(
  new URL(
    "../src/app/work-schedule/lunch-boxes/actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const querySource = readFileSync(
  new URL("../src/lib/lunch-box-operations.ts", import.meta.url),
  "utf8",
);
const prismaSource = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260821120000_add_lunch_box_daily_operations/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const prismaClientSource = readFileSync(
  new URL("../src/lib/prisma.ts", import.meta.url),
  "utf8",
);

const initialData: LunchBoxOperationsViewData = {
  dailyOperation: {
    date: "2026-08-21",
    version: 3,
    updatedAt: "2026-08-21T05:30:00.000Z",
    updatedByName: "운영담당자",
    workShifts: [
      {
        id: "shift-1",
        order: 0,
        workerName: "김하늘",
        startTime: "07:30",
        endTime: "12:00",
        laborCost: 70_000,
        note: "조리",
      },
      {
        id: "shift-2",
        order: 1,
        workerName: "이바다",
        startTime: "08:00",
        endTime: "11:30",
        laborCost: 55_000,
        note: "포장",
      },
    ],
    ingredientPurchases: [
      {
        id: "purchase-1",
        order: 0,
        itemName: "감자",
        quantity: "12.5",
        unit: "kg",
        purchaseAmount: 32_000,
        note: null,
      },
    ],
  },
  month: "2026-08",
  monthSummary: [
    {
      date: "2026-08-21",
      ingredientItems: [
        { itemName: "감자", quantity: "12.5", unit: "kg" },
      ],
      ingredientItemCount: 1,
      ingredientPurchaseCost: 32_000,
      laborCost: 125_000,
      totalCost: 157_000,
      totalMinutes: 480,
      workerCount: 2,
      workerNames: ["김하늘", "이바다"],
      workShiftItems: [
        { workerName: "김하늘", startTime: "07:30", endTime: "12:00" },
        { workerName: "이바다", startTime: "08:00", endTime: "11:30" },
      ],
    },
  ],
};

async function loadOperations() {
  return { ok: true as const, data: initialData };
}

async function saveOperations() {
  return { ok: true as const, data: initialData };
}

describe("lunch box operation input", () => {
  test("normalizes variable daily shifts, costs, and ingredient quantities", () => {
    const result = validateLunchBoxOperationsInput({
      workShifts: [
        {
          workerName: "  김  하늘 ",
          startTime: "07:30",
          endTime: "12:00",
          laborCost: "70,000",
          note: "  오전   조리 ",
        },
      ],
      ingredientPurchases: [
        {
          itemName: " 감자 ",
          quantity: "012.500",
          unit: " kg ",
          purchaseAmount: "32,000",
          note: "",
        },
      ],
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(result.workShifts, [
      {
        workerName: "김 하늘",
        startTime: "07:30",
        endTime: "12:00",
        laborCost: 70_000,
        note: "오전 조리",
      },
    ]);
    assert.deepEqual(result.ingredientPurchases, [
      {
        itemName: "감자",
        quantity: "12.5",
        unit: "kg",
        purchaseAmount: 32_000,
        note: null,
      },
    ]);
  });

  test("rejects inverted work times and invalid quantities without changing other days", () => {
    const invalidTime = validateLunchBoxOperationsInput({
      workShifts: [
        {
          workerName: "김하늘",
          startTime: "12:00",
          endTime: "08:00",
          laborCost: "0",
          note: "",
        },
      ],
      ingredientPurchases: [],
    });
    const invalidQuantity = validateLunchBoxOperationsInput({
      workShifts: [],
      ingredientPurchases: [
        {
          itemName: "감자",
          quantity: "1.2345",
          unit: "kg",
          purchaseAmount: "0",
          note: "",
        },
      ],
    });

    assert.deepEqual(invalidTime, {
      ok: false,
      error: "근무 1행의 종료 시간은 시작 시간보다 늦어야 합니다.",
    });
    assert.equal(invalidQuantity.ok, false);
    assert.match(
      invalidQuantity.ok ? "" : invalidQuantity.error,
      /소수점 셋째 자리/,
    );
    assert.deepEqual(createEmptyLunchBoxDailyOperation("2026-08-22"), {
      date: "2026-08-22",
      ingredientPurchases: [],
      updatedAt: null,
      updatedByName: null,
      version: 0,
      workShifts: [],
    });
  });

  test("enforces safe row limits and non-negative integer costs", () => {
    const workShift = {
      workerName: "김하늘",
      startTime: "08:00",
      endTime: "09:00",
      laborCost: "10000",
      note: "",
    };
    const purchase = {
      itemName: "감자",
      quantity: "1",
      unit: "kg",
      purchaseAmount: "1000",
      note: "",
    };

    assert.equal(
      validateLunchBoxOperationsInput({
        workShifts: Array.from(
          { length: maxLunchBoxWorkShiftCount + 1 },
          () => workShift,
        ),
        ingredientPurchases: [],
      }).ok,
      false,
    );
    assert.equal(
      validateLunchBoxOperationsInput({
        workShifts: [],
        ingredientPurchases: Array.from(
          { length: maxLunchBoxIngredientPurchaseCount + 1 },
          () => purchase,
        ),
      }).ok,
      false,
    );
    assert.equal(
      validateLunchBoxOperationsInput({
        workShifts: [{ ...workShift, laborCost: "-1" }],
        ingredientPurchases: [],
      }).ok,
      false,
    );
  });

  test("calculates work duration and all expense totals", () => {
    const summary = createLunchBoxOperationSummary({
      workShifts: [
        {
          workerName: "김하늘",
          startTime: "07:30",
          endTime: "12:00",
          laborCost: 70_000,
        },
        {
          workerName: "이바다",
          startTime: "08:00",
          endTime: "11:30",
          laborCost: 55_000,
        },
      ],
      ingredientPurchases: [
        { purchaseAmount: 32_000 },
        { purchaseAmount: 18_000 },
      ],
    });

    assert.equal(getLunchBoxShiftMinutes("07:30", "12:00"), 270);
    assert.equal(formatLunchBoxWorkMinutes(480), "8시간");
    assert.deepEqual(summary, {
      ingredientItemCount: 2,
      ingredientPurchaseCost: 50_000,
      laborCost: 125_000,
      totalCost: 175_000,
      totalMinutes: 480,
      workerCount: 2,
      workerNames: ["김하늘", "이바다"],
    });
  });

  test("creates an exact month range without leaking values across periods", () => {
    const range = getLunchBoxOperationsMonthRange("2026-08");

    assert.equal(range.start.toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-09-01T00:00:00.000Z");
  });
});

describe("lunch box operations board", () => {
  test("renders dense month totals and date-variable work and purchase details", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxOperationsBoard, {
        initialData,
        loadOperations,
        saveOperations,
        today: "2026-08-21",
      }),
    );

    assert.match(html, /근무·지출 운영 기록/);
    assert.match(html, /2026년 8월 날짜별 운영 내역/);
    assert.match(html, /김하늘 07:30~12:00/);
    assert.match(html, /이바다 08:00~11:30/);
    assert.match(html, /감자 12\.5kg/);
    assert.match(html, /157,000원/);
    assert.match(html, /aria-label="운영 기록 날짜"/);
    assert.match(html, /aria-label="2026\.08\.21\.\(금\) 운영 기록 수정"/);
    assert.match(html, />선택일 기록 수정<\/button>/);
    assert.doesNotMatch(html, /overflow-x-auto/);
  });

  test("uses a compact actionable empty month state", () => {
    const emptyData: LunchBoxOperationsViewData = {
      dailyOperation: createEmptyLunchBoxDailyOperation("2026-08-21"),
      month: "2026-08",
      monthSummary: [],
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxOperationsBoard, {
        initialData: emptyData,
        loadOperations: async () => ({ ok: true as const, data: emptyData }),
        saveOperations: async () => ({ ok: true as const, data: emptyData }),
        today: "2026-08-21",
      }),
    );

    assert.match(html, /이 달에 저장된 운영 기록이 없습니다/);
    assert.match(html, />선택일 기록 입력<\/button>/);
    assert.match(html, /min-h-32/);
    assert.doesNotMatch(html, /min-h-64/);
  });
});

describe("lunch box operation persistence contracts", () => {
  test("adds the operations tab immediately after daily counts", () => {
    const countIndex = pageSource.indexOf('label="일자별 개수"');
    const operationsIndex = pageSource.indexOf('label="근무·지출"');
    const schoolIndex = pageSource.indexOf('label="도시락 학교 목록"');

    assert.ok(countIndex >= 0);
    assert.ok(operationsIndex > countIndex);
    assert.ok(schoolIndex > operationsIndex);
    assert.match(pageSource, /value === "operations"/);
    assert.match(pageSource, /activeTab === "operations"/);
    assert.match(pageSource, /getLunchBoxOperationsView/);
  });

  test("authenticates, validates, locks, versions, audits, and revalidates saves", () => {
    assert.match(
      actionsSource,
      /saveLunchBoxOperationsAction[\s\S]*?await requireUser\(\)/,
    );
    assert.match(actionsSource, /validateLunchBoxOperationsInput/);
    assert.match(actionsSource, /pg_advisory_xact_lock/);
    assert.match(actionsSource, /currentVersion !== expectedVersion/);
    assert.match(actionsSource, /UPDATE_LUNCH_BOX_OPERATION/);
    assert.match(actionsSource, /revalidatePath\(lunchBoxManagementPath\)/);
    assert.match(actionsSource, /입력 내용을 확인한 뒤 날짜를 다시 불러오세요/);
    assert.match(querySource, /quantity: purchase\.quantity\.toString\(\)/);
  });

  test("defines date-scoped relational tables with database constraints and RLS", () => {
    assert.match(prismaSource, /model LunchBoxDailyOperation/);
    assert.match(prismaSource, /date\s+DateTime\s+@unique @db\.Date/);
    assert.match(prismaSource, /version\s+Int\s+@default\(1\)/);
    assert.match(prismaSource, /model LunchBoxWorkShift/);
    assert.match(prismaSource, /model LunchBoxIngredientPurchase/);
    assert.match(prismaSource, /quantity\s+Decimal\s+@db\.Decimal\(12, 3\)/);
    assert.match(migrationSource, /LunchBoxWorkShift_time_check/);
    assert.match(migrationSource, /LunchBoxIngredientPurchase_quantity_check/);
    assert.equal(
      countMatches(migrationSource, "ENABLE ROW LEVEL SECURITY"),
      3,
    );
    assert.match(prismaClientSource, /"lunchBoxDailyOperation"/);
    assert.match(prismaClientSource, /"lunchBoxWorkShift"/);
    assert.match(prismaClientSource, /"lunchBoxIngredientPurchase"/);
  });
});

function countMatches(value: string, search: string) {
  return value.split(search).length - 1;
}
