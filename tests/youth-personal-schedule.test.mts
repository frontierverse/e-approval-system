import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  areYouthPersonalScheduleTimesOverlapping,
  createYouthPersonalScheduleWeekdayDates,
  getYouthPersonalScheduleCalendarDates,
  getYouthPersonalScheduleDateIntersection,
  getYouthPersonalScheduleMonthDates,
  normalizeYouthPersonalScheduleInput,
  parseYouthPersonalScheduleWeekdays,
  youthPersonalScheduleContentMaxLength,
  youthPersonalScheduleOccurrenceMaxCount,
  type YouthPersonalScheduleInput,
} from "../src/lib/youth-personal-schedule-core.ts";

const schemaSource = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260901170000_add_youth_personal_schedules/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const querySource = readFileSync(
  new URL("../src/lib/youth-personal-schedules.ts", import.meta.url),
  "utf8",
);
const prismaSource = readFileSync(
  new URL("../src/lib/prisma.ts", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(
  new URL(
    "../src/app/youth/personal-schedule/actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/app/youth/personal-schedule/page.tsx", import.meta.url),
  "utf8",
);
const youthManagementSource = readFileSync(
  new URL("../src/lib/youth-management.ts", import.meta.url),
  "utf8",
);

function createInput(
  overrides: Partial<YouthPersonalScheduleInput> = {},
): YouthPersonalScheduleInput {
  return {
    content: "상담",
    startMinute: 9 * 60,
    endMinute: 10 * 60,
    selectionMode: "DATES",
    occurrenceDates: ["2026-09-01"],
    recurrenceWeekdays: [],
    recurrenceStartDate: "",
    recurrenceEndDate: "",
    ...overrides,
  };
}

describe("youth personal schedule normalization", () => {
  test("normalizes, sorts, and deduplicates explicitly selected dates", () => {
    assert.deepEqual(
      normalizeYouthPersonalScheduleInput(
        createInput({
          content: "  병원 진료  ",
          startMinute: 0,
          endMinute: 1440,
          occurrenceDates: [
            " 2026-09-03 ",
            "2026-09-01",
            "2026-09-03",
          ],
          recurrenceWeekdays: [1, 3],
          recurrenceStartDate: "2026-09-01",
          recurrenceEndDate: "2026-09-30",
        }),
      ),
      {
        ok: true,
        value: {
          content: "병원 진료",
          startMinute: 0,
          endMinute: 1440,
          selectionMode: "DATES",
          occurrenceDates: ["2026-09-01", "2026-09-03"],
          recurrenceWeekdays: null,
          recurrenceWeekdayValues: [],
          recurrenceStartDate: null,
          recurrenceEndDate: null,
        },
      },
    );
  });

  test("generates all selected weekdays inside an inclusive date range", () => {
    const result = normalizeYouthPersonalScheduleInput(
      createInput({
        selectionMode: "WEEKDAYS",
        occurrenceDates: ["2099-01-01"],
        recurrenceWeekdays: [5, 1, 3, 1],
        recurrenceStartDate: "2026-09-01",
        recurrenceEndDate: "2026-09-14",
      }),
    );

    assert.deepEqual(result, {
      ok: true,
      value: {
        content: "상담",
        startMinute: 540,
        endMinute: 600,
        selectionMode: "WEEKDAYS",
        occurrenceDates: [
          "2026-09-02",
          "2026-09-04",
          "2026-09-07",
          "2026-09-09",
          "2026-09-11",
          "2026-09-14",
        ],
        recurrenceWeekdays: "1,3,5",
        recurrenceWeekdayValues: [1, 3, 5],
        recurrenceStartDate: "2026-09-01",
        recurrenceEndDate: "2026-09-14",
      },
    });
  });

  test("accepts a 366-day leap-year range and rejects the 367th day", () => {
    const accepted = normalizeYouthPersonalScheduleInput(
      createInput({
        selectionMode: "WEEKDAYS",
        recurrenceWeekdays: [0, 1, 2, 3, 4, 5, 6],
        recurrenceStartDate: "2028-01-01",
        recurrenceEndDate: "2028-12-31",
      }),
    );
    const rejected = normalizeYouthPersonalScheduleInput(
      createInput({
        selectionMode: "WEEKDAYS",
        recurrenceWeekdays: [1],
        recurrenceStartDate: "2028-01-01",
        recurrenceEndDate: "2029-01-01",
      }),
    );

    assert.equal(accepted.ok, true);
    assert.equal(
      accepted.ok ? accepted.value.occurrenceDates.length : 0,
      youthPersonalScheduleOccurrenceMaxCount,
    );
    assert.equal(rejected.ok, false);
    assert.match(rejected.ok ? "" : rejected.error, /최대 366일/);
  });

  test("rejects reversed or empty weekday periods and crosses year boundaries", () => {
    const reversed = normalizeYouthPersonalScheduleInput(
      createInput({
        selectionMode: "WEEKDAYS",
        recurrenceWeekdays: [1],
        recurrenceStartDate: "2026-09-02",
        recurrenceEndDate: "2026-09-01",
      }),
    );
    const noMatchingDay = normalizeYouthPersonalScheduleInput(
      createInput({
        selectionMode: "WEEKDAYS",
        recurrenceWeekdays: [1],
        recurrenceStartDate: "2026-09-01",
        recurrenceEndDate: "2026-09-01",
      }),
    );

    assert.match(getError(reversed), /빠를 수 없습니다/);
    assert.match(getError(noMatchingDay), /해당하는 반복 요일/);
    assert.deepEqual(
      createYouthPersonalScheduleWeekdayDates(
        "2027-12-31",
        "2028-01-01",
        [5, 6],
      ),
      ["2027-12-31", "2028-01-01"],
    );
    assert.equal(
      normalizeYouthPersonalScheduleInput(
        createInput({ occurrenceDates: ["2028-02-29"] }),
      ).ok,
      true,
    );
  });

  test("enforces selected-date count, strict dates, and nonempty weekdays", () => {
    const noDates = normalizeYouthPersonalScheduleInput(
      createInput({ occurrenceDates: [] }),
    );
    const invalidDate = normalizeYouthPersonalScheduleInput(
      createInput({ occurrenceDates: ["2027-02-29"] }),
    );
    const tooManyDates = normalizeYouthPersonalScheduleInput(
      createInput({
        occurrenceDates: Array.from(
          { length: youthPersonalScheduleOccurrenceMaxCount + 1 },
          (_, index) => shiftDate("2026-01-01", index),
        ),
      }),
    );
    const noWeekdays = normalizeYouthPersonalScheduleInput(
      createInput({
        selectionMode: "WEEKDAYS",
        recurrenceWeekdays: [],
        recurrenceStartDate: "2026-09-01",
        recurrenceEndDate: "2026-09-30",
      }),
    );

    assert.match(noDates.ok ? "" : noDates.error, /하나 이상/);
    assert.match(invalidDate.ok ? "" : invalidDate.error, /형식/);
    assert.match(tooManyDates.ok ? "" : tooManyDates.error, /최대 366개/);
    assert.match(noWeekdays.ok ? "" : noWeekdays.error, /하나 이상/);
  });

  test("enforces content and 00:00~24:00 ten-minute time boundaries", () => {
    const accepted = [
      createInput({ startMinute: 0, endMinute: 10 }),
      createInput({ startMinute: 1430, endMinute: 1440 }),
    ];
    const rejected = [
      createInput({ startMinute: -10 }),
      createInput({ startMinute: 1440, endMinute: 1440 }),
      createInput({ startMinute: 1 }),
      createInput({ startMinute: Number.NaN }),
      createInput({ startMinute: Number.POSITIVE_INFINITY }),
      createInput({ startMinute: 540.5 }),
      createInput({ endMinute: 541 }),
      createInput({ endMinute: Number.NaN }),
      createInput({ endMinute: Number.POSITIVE_INFINITY }),
      createInput({ endMinute: 600.5 }),
      createInput({ endMinute: 540 }),
    ];

    for (const input of accepted) {
      assert.equal(normalizeYouthPersonalScheduleInput(input).ok, true);
    }

    for (const input of rejected) {
      assert.equal(normalizeYouthPersonalScheduleInput(input).ok, false);
    }

    assert.equal(
      normalizeYouthPersonalScheduleInput(
        createInput({ content: "가".repeat(youthPersonalScheduleContentMaxLength) }),
      ).ok,
      true,
    );
    assert.match(
      getError(
        normalizeYouthPersonalScheduleInput(
          createInput({
            content: "가".repeat(youthPersonalScheduleContentMaxLength + 1),
          }),
        ),
      ),
      /200자/,
    );
  });

  test("rejects malformed runtime inputs instead of trusting TypeScript", () => {
    for (const input of [
      null,
      "schedule",
      { ...createInput(), occurrenceDates: "2026-09-01" },
      {
        ...createInput(),
        selectionMode: "WEEKDAYS",
        recurrenceWeekdays: ["1"],
        recurrenceStartDate: "2026-09-01",
        recurrenceEndDate: "2026-09-30",
      },
      { ...createInput(), selectionMode: "MONTHLY" },
    ]) {
      assert.equal(normalizeYouthPersonalScheduleInput(input).ok, false);
    }
  });

  test("provides deterministic recurrence, month, and overlap helpers", () => {
    assert.deepEqual(
      createYouthPersonalScheduleWeekdayDates(
        "2026-09-01",
        "2026-09-07",
        [0, 2, 2],
      ),
      ["2026-09-01", "2026-09-06"],
    );
    assert.deepEqual(parseYouthPersonalScheduleWeekdays("5,1,3,1"), [1, 3, 5]);
    assert.deepEqual(parseYouthPersonalScheduleWeekdays(null), []);
    assert.deepEqual(parseYouthPersonalScheduleWeekdays(""), []);
    assert.equal(getYouthPersonalScheduleMonthDates("2028-02").length, 29);
    assert.deepEqual(getYouthPersonalScheduleMonthDates("2027-13"), []);
    const septemberCalendarDates =
      getYouthPersonalScheduleCalendarDates("2026-09");
    assert.equal(septemberCalendarDates.length, 42);
    assert.equal(septemberCalendarDates[0], "2026-08-30");
    assert.equal(septemberCalendarDates.at(-1), "2026-10-10");
    assert.deepEqual(
      getYouthPersonalScheduleDateIntersection(
        ["2026-09-01", "2026-10-02", "2026-09-01"],
        ["2026-10-02", "2026-11-01"],
      ),
      ["2026-10-02"],
    );
    assert.equal(areYouthPersonalScheduleTimesOverlapping(540, 600, 590, 650), true);
    assert.equal(areYouthPersonalScheduleTimesOverlapping(540, 600, 600, 650), false);
  });
});

describe("youth personal schedule persistence contracts", () => {
  test("defines the single schedule model and PostgreSQL array indexes", () => {
    const modelSource = extractSection(
      schemaSource,
      "model YouthPersonalSchedule {",
      "model YouthDischargeExtension {",
    );

    for (const field of [
      "content",
      "startMinute",
      "endMinute",
      "selectionMode",
      "occurrenceDates",
      "recurrenceWeekdays",
      "recurrenceStartDate",
      "recurrenceEndDate",
      "youthId",
    ]) {
      assert.match(modelSource, new RegExp(`\\b${field}\\b`));
    }

    assert.match(modelSource, /occurrenceDates\s+String\[\]/);
    assert.match(modelSource, /@@index\(\[youthId\]\)/);
    assert.match(modelSource, /@@index\(\[occurrenceDates\],\s*type:\s*Gin/);
    assert.match(modelSource, /onDelete:\s*Cascade/);
    assert.match(schemaSource, /personalSchedules\s+YouthPersonalSchedule\[\]/);
    assert.match(
      prismaSource,
      /requiredPrismaDelegates[\s\S]*?"youthPersonalSchedule"/,
    );

    assert.match(migrationSource, /CREATE TABLE "YouthPersonalSchedule"/);
    assert.match(migrationSource, /TEXT\[\] NOT NULL/);
    assert.match(migrationSource, /USING GIN \("occurrenceDates"\)/);
    assert.match(migrationSource, /cardinality\("occurrenceDates"\) BETWEEN 1 AND 366/);
    assert.match(migrationSource, /"endMinute" <= 1440/);
    for (const field of [
      "recurrenceWeekdays",
      "recurrenceStartDate",
      "recurrenceEndDate",
    ]) {
      assert.match(
        migrationSource,
        new RegExp(`"${field}" IS NOT NULL`),
      );
    }
    assert.match(migrationSource, /ENABLE ROW LEVEL SECURITY/);
  });

  test("queries only the selected youth and month through array overlap", () => {
    assert.match(querySource, /getYouthPersonalScheduleCalendarDates\(month\)/);
    assert.match(querySource, /youthId:\s*normalizedYouthId/);
    assert.match(
      querySource,
      /occurrenceDates:\s*\{\s*hasSome:\s*calendarDates/,
    );
    assert.match(querySource, /select:\s*youthPersonalScheduleSelect/);
  });

  test("guards the page read and derives write controls from effective permission", () => {
    assert.match(pageSource, /const user = await requireYouthBasicAccess\(\)/);
    assert.match(pageSource, /getAdmittedYouthDirectory\(\)/);
    assert.match(
      pageSource,
      /youths\.find\(\(youth\) => youth\.id === requestedYouthId\)\?\.id/,
    );
    assert.match(
      pageSource,
      /const permissions = getEffectiveYouthPermissions\(user\)/,
    );
    assert.match(pageSource, /canManage=\{permissions\.canManageYouth\}/);
  });

  test("excludes discharged youths from the personal schedule directory", () => {
    const start = youthManagementSource.indexOf(
      "export async function getAdmittedYouthDirectory",
    );
    const end = youthManagementSource.indexOf(
      "export function mapYouthDecisionDocument",
      start,
    );

    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    const admittedDirectorySource = youthManagementSource.slice(start, end);

    assert.match(admittedDirectorySource, /getYouthLearningScheduleToday\(\)/);
    assert.match(admittedDirectorySource, /dischargeDate: null/);
    assert.match(admittedDirectorySource, /dischargeDate: ""/);
    assert.match(
      admittedDirectorySource,
      /dischargeDate:\s*\{\s*gte: referenceDate/,
    );
    assert.match(
      admittedDirectorySource,
      /select:\s*\{\s*id: true,\s*name: true/,
    );
  });

  test("rechecks management permission for every mutation", () => {
    for (const actionName of [
      "createYouthPersonalScheduleAction",
      "updateYouthPersonalScheduleAction",
      "deleteYouthPersonalScheduleAction",
    ]) {
      const actionSource = extractAction(actionsSource, actionName);

      assert.match(
        actionSource,
        /requireYouthPermission\("canManageYouth"\)/,
      );
    }

    assert.equal(
      countMatches(actionsSource, /typeof youthId === "string"/g),
      1,
    );
    assert.equal(
      countMatches(actionsSource, /typeof scheduleId === "string"/g),
      2,
    );
  });

  test("keeps validation, overlap checks, writes, and audit logs atomic", () => {
    assert.match(actionsSource, /normalizeYouthPersonalScheduleInput\(input\)/);
    assert.equal(
      countMatches(
        actionsSource,
        /TransactionIsolationLevel\.Serializable/g,
      ),
      3,
    );
    assert.match(actionsSource, /occurrenceDates:\s*\{\s*hasSome:\s*input\.occurrenceDates/);
    assert.match(actionsSource, /startMinute:\s*\{\s*lt:\s*input\.endMinute/);
    assert.match(actionsSource, /endMinute:\s*\{\s*gt:\s*input\.startMinute/);
    assert.match(
      actionsSource,
      /getYouthPersonalScheduleDateIntersection\([\s\S]*?conflict\.occurrenceDates,[\s\S]*?input\.occurrenceDates/,
    );
    assert.match(actionsSource, /youthPersonalSchedule\.create/);
    assert.match(actionsSource, /youthPersonalSchedule\.update/);
    assert.match(actionsSource, /youthPersonalSchedule\.delete/);
    assert.equal(countMatches(actionsSource, /await tx\.auditLog\.create/g), 3);
    assert.match(actionsSource, /targetType:\s*"YouthPersonalSchedule"/);
    assert.match(actionsSource, /source:\s*"youth-personal-schedule"/);
    assert.match(actionsSource, /error\.code === "P2034"/);
    assert.match(actionsSource, /동시에 변경되었습니다/);
    assert.equal(
      countMatches(
        actionsSource,
        /revalidatePath\(youthPersonalSchedulePath\)/g,
      ),
      3,
    );
  });
});

function getError(
  result: ReturnType<typeof normalizeYouthPersonalScheduleInput>,
) {
  return result.ok ? "" : result.error;
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function extractSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `${startMarker} section is required`);
  assert.notEqual(end, -1, `${endMarker} section is required`);

  return source.slice(start, end);
}

function extractAction(source: string, actionName: string) {
  const startMarker = `export async function ${actionName}(`;
  const start = source.indexOf(startMarker);
  const nextAction = source.indexOf("\nexport async function ", start + startMarker.length);

  assert.notEqual(start, -1, `${actionName} is required`);

  return source.slice(start, nextAction === -1 ? source.length : nextAction);
}

function countMatches(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].length;
}
