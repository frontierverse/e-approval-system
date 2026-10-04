import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { createYouthActivitiesHarness } from "./helpers/youth-activities.mjs";
const hospital = (patch = {}) => ({ content: "", startMinute: 540, endMinute: 600, selectionMode: "DATES", occurrenceDates: ["2026-10-04"], recurrenceWeekdays: [], recurrenceStartDate: "", recurrenceEndDate: "", scheduleType: "HOSPITAL", hospitalName: "합성 병원", escortType: "STAFF", escortUserId: "actor", nextAppointmentDate: "2026-10-10", ...patch });
const pageSource = read("../src/app/youth/personal-schedule/page.tsx");
const prismaSource = read("../src/lib/prisma.ts");
const schedulesSource = read("../src/lib/youth-personal-schedules.ts");

describe("youth hospital schedule persistence contracts", () => {
  test("returns medical fields and employee name snapshots in the schedule DTO", () => {
    const selectSource = extractSection(
      schedulesSource,
      "export const youthPersonalScheduleSelect = {",
      "type YouthPersonalScheduleRecord",
    );
    const mapperSource = extractSection(
      schedulesSource,
      "export function mapYouthPersonalSchedule(",
      "function getFirstOccurrenceInCalendar(",
    );

    for (const field of [
      "scheduleType",
      "hospitalName",
      "escortType",
      "escortUserId",
      "escortName",
      "nextAppointmentDate",
    ]) {
      assert.match(selectSource, new RegExp(`\\b${field}\\b`));
      assert.match(mapperSource, new RegExp(`\\b${field}\\b`));
    }

    assert.match(mapperSource, /scheduleType === "HOSPITAL"/);
    assert.match(mapperSource, /schedule\.escortType === "STAFF"/);
    assert.match(mapperSource, /schedule\.escortType === "OTHER"/);
  });

  test("loads the minimum staff directory only for users who can manage youth", () => {
    const directorySource = extractSection(
      schedulesSource,
      "export async function getYouthPersonalScheduleStaffDirectory",
      "export async function getYouthPersonalSchedules",
    );

    assert.match(directorySource, /prisma\.user\.findMany/);
    for (const field of [
      "id",
      "name",
      "hireDate",
      "resignationDate",
      "department",
      "position",
    ]) {
      assert.match(directorySource, new RegExp(`\\b${field}\\b`));
    }
    assert.doesNotMatch(
      directorySource,
      /email|passwordHash|canViewYouth|canManageYouth|profileImage|status:/,
    );

    const permissionIndex = pageSource.indexOf(
      "const permissions = getEffectiveYouthPermissions(user)",
    );
    const directoryIndex = pageSource.indexOf(
      "getYouthPersonalScheduleStaffDirectory()",
    );

    assert.ok(permissionIndex >= 0);
    assert.ok(directoryIndex > permissionIndex);
    assert.match(
      pageSource,
      /permissions\.canManageYouth\s*\? getYouthPersonalScheduleStaffDirectory\(\)\s*:\s*Promise\.resolve\(\[\]\)/,
    );
    assert.match(pageSource, /staffDirectory=\{staffDirectory\}/);
  });

  test("revalidates a selected staff escort against the visit-date employment period", async () => {
    const f = createYouthActivitiesHarness(), domain = f.load("lib/youth-mobile-schedules.ts");
    f.h.user[0].hireDate = "2026-10-04"; f.h.user[0].resignationDate = "2026-10-04";
    const created = await domain.createMobilePersonalSchedule(f.ctx, "youth-a", { requestId: "medical-eligible", input: hospital() });
    assert.equal(created.result.schedule.escortName, "합성 직원");
    await assert.rejects(domain.createMobilePersonalSchedule(f.ctx, "youth-a", { requestId: "medical-after", input: hospital({ occurrenceDates: ["2026-10-05"] }) }), { code: "VALIDATION_ERROR" });
    await assert.rejects(domain.createMobilePersonalSchedule(f.ctx, "youth-a", { requestId: "medical-before", input: hospital({ occurrenceDates: ["2026-10-03"] }) }), { code: "VALIDATION_ERROR" });
    f.h.user.push({ ...f.h.user[0], id: "former", name: "당시 직원", status: "INACTIVE" });
    const historical = await domain.createMobilePersonalSchedule(f.ctx, "youth-b", { requestId: "medical-former", input: hospital({ escortUserId: "former" }) });
    assert.equal(historical.result.schedule.escortName, "당시 직원");
  });

  test("preserves the original staff-name snapshot when an update keeps the same escort", async () => {
    const f = createYouthActivitiesHarness(), domain = f.load("lib/youth-mobile-schedules.ts");
    const created = await domain.createMobilePersonalSchedule(f.ctx, "youth-a", { requestId: "medical-create", input: hospital() });
    f.h.user[0].name = "변경된 현재 이름";
    const updated = await domain.updateMobilePersonalSchedule(f.ctx, created.targetId, { requestId: "medical-update", youthId: "youth-a", expectedUpdatedAt: created.committedUpdatedAt, input: hospital({ startMinute: 600, endMinute: 660 }) });
    assert.equal(updated.result.schedule.escortName, "합성 직원");
    assert.equal(f.h.auditLog.at(-1).metadata.previous.escortName, "합성 직원");
    assert.equal(f.h.auditLog.at(-1).metadata.next.escortName, "합성 직원");
  });

  test("rejects legacy updates before they can clear an existing hospital appointment", async () => {
    const f = createYouthActivitiesHarness(), web = f.load("app/youth/personal-schedule/actions.ts");
    const created = await web.createYouthPersonalScheduleAction("youth-a", hospital());
    assert.equal(created.ok, true); const legacy = hospital(); delete legacy.scheduleType; legacy.content = "일반 일정으로 잘못 전송된 본문";
    const updated = await web.updateYouthPersonalScheduleAction(created.data.schedule.id, legacy);
    assert.equal(updated.ok, false); assert.equal(updated.status, 400); assert.equal(updated.code, "INVALID_REQUEST");
    assert.equal(f.h.youthPersonalSchedule[0].scheduleType, "HOSPITAL"); assert.equal(f.h.auditLog.length, 1);
  });

  test("persists normalized medical data and records it in create/update audit snapshots", async () => {
    const f = createYouthActivitiesHarness(), domain = f.load("lib/youth-mobile-schedules.ts");
    const created = await domain.createMobilePersonalSchedule(f.ctx, "youth-a", { requestId: "medical-audit", input: hospital({ hospitalName: "  합성 병원  ", escortType: "OTHER", escortUserId: "", escortOtherName: "  합성 보호자  " }) });
    const expected = { scheduleType: "HOSPITAL", hospitalName: "합성 병원", escortType: "OTHER", escortUserId: null, escortName: "합성 보호자", nextAppointmentDate: "2026-10-10" };
    for (const [field, value] of Object.entries(expected)) { assert.equal(created.result.schedule[field], value); assert.equal(f.h.auditLog[0].metadata.next[field], value); }
    f.h.auditFailure = true;
    await assert.rejects(domain.updateMobilePersonalSchedule(f.ctx, created.targetId, { requestId: "medical-rollback", youthId: "youth-a", expectedUpdatedAt: created.committedUpdatedAt, input: hospital({ hospitalName: "덮어쓰기 금지", startMinute: 600, endMinute: 660 }) }));
    assert.equal(f.h.youthPersonalSchedule[0].hospitalName, "합성 병원"); assert.equal(f.h.youthMutationReceipt.length, 1);
  });

  test("rejects a stale cached Prisma client that lacks hospital schedule fields", () => {
    assert.match(
      prismaSource,
      /const requiredYouthPersonalScheduleFields = \[[\s\S]*?"scheduleType"[\s\S]*?"hospitalName"[\s\S]*?"escortType"[\s\S]*?"escortUserId"[\s\S]*?"escortName"[\s\S]*?"nextAppointmentDate"/,
    );
    assert.match(
      prismaSource,
      /hasRequiredYouthPersonalScheduleFields\(client\)/,
    );
    assert.match(
      prismaSource,
      /_runtimeDataModel\?\.models\?\.YouthPersonalSchedule/,
    );
  });
});

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function extractSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `${startMarker} section is required`);
  assert.notEqual(end, -1, `${endMarker} section is required`);

  return source.slice(start, end);
}
