import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const actionsSource = read("../src/app/youth/personal-schedule/actions.ts");
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

  test("revalidates a selected staff escort against the visit-date employment period", () => {
    const resolverSource = extractSection(
      actionsSource,
      "async function resolveYouthPersonalScheduleEscortSnapshot(",
      "async function findConflictingYouthPersonalSchedule(",
    );

    assert.match(resolverSource, /input\.scheduleType !== "HOSPITAL"/);
    assert.match(resolverSource, /input\.escortType === "OTHER"/);
    assert.match(resolverSource, /escortName: input\.escortOtherName/);
    assert.match(resolverSource, /input\.escortType !== "STAFF"/);
    assert.match(resolverSource, /const appointmentDate = input\.occurrenceDates\[0\]/);
    assert.match(resolverSource, /tx\.user\.findFirst/);
    assert.match(resolverSource, /\{ hireDate: null \}/);
    assert.match(resolverSource, /\{ hireDate: "" \}/);
    assert.match(resolverSource, /hireDate: \{ lte: appointmentDate \}/);
    assert.match(resolverSource, /\{ resignationDate: null \}/);
    assert.match(resolverSource, /\{ resignationDate: "" \}/);
    assert.match(resolverSource, /resignationDate: \{ gte: appointmentDate \}/);
    assert.doesNotMatch(resolverSource, /status/);
    assert.match(resolverSource, /select:\s*\{\s*id: true,\s*name: true/);
    assert.match(resolverSource, /existingEscortName \?\? escortUser\.name/);
  });

  test("preserves the original staff-name snapshot when an update keeps the same escort", () => {
    const updateSource = extractSection(
      actionsSource,
      "export async function updateYouthPersonalScheduleAction(",
      "export async function deleteYouthPersonalScheduleAction(",
    );
    const resolverSource = extractSection(
      actionsSource,
      "async function resolveYouthPersonalScheduleEscortSnapshot(",
      "async function findConflictingYouthPersonalSchedule(",
    );

    assert.match(
      updateSource,
      /resolveYouthPersonalScheduleEscortSnapshot\([\s\S]*?normalizedInput\.value,[\s\S]*?escortName: existingSchedule\.escortName,[\s\S]*?escortType: existingSchedule\.escortType,[\s\S]*?escortUserId: existingSchedule\.escortUserId,[\s\S]*?scheduleType: existingSchedule\.scheduleType/,
    );
    assert.match(
      resolverSource,
      /existingSchedule\?\.scheduleType === "HOSPITAL"[\s\S]*?existingSchedule\.escortType === "STAFF"[\s\S]*?existingSchedule\.escortUserId === escortUser\.id[\s\S]*?existingSchedule\.escortName\?\.trim\(\)/,
    );
    assert.match(
      resolverSource,
      /escortName: existingEscortName \?\? escortUser\.name/,
    );
  });

  test("rejects legacy updates before they can clear an existing hospital appointment", () => {
    const updateSource = extractSection(
      actionsSource,
      "export async function updateYouthPersonalScheduleAction(",
      "export async function deleteYouthPersonalScheduleAction(",
    );
    const scheduleLookupIndex = updateSource.indexOf(
      "const existingSchedule = await tx.youthPersonalSchedule.findUnique",
    );
    const staleGuardIndex = updateSource.indexOf(
      'existingSchedule.scheduleType === "HOSPITAL"',
    );

    assert.match(
      updateSource,
      /Object\.prototype\.hasOwnProperty\.call\(input, "scheduleType"\)/,
    );
    assert.match(
      updateSource,
      /input\.scheduleType !== undefined/,
    );
    assert.ok(scheduleLookupIndex >= 0);
    assert.ok(staleGuardIndex > scheduleLookupIndex);
    assert.match(
      updateSource,
      /existingSchedule\.scheduleType === "HOSPITAL"\s*&&\s*!hasExplicitScheduleType[\s\S]*?throw new YouthPersonalScheduleStalePayloadError\(\)/,
    );
    assert.match(
      actionsSource,
      /병원 진료 예약 수정 정보에 일정 종류가 누락되었습니다\. 페이지를 새로고침한 뒤 다시 시도하세요\./,
    );
  });

  test("persists normalized medical data and records it in create/update audit snapshots", () => {
    const dataSource = extractSection(
      actionsSource,
      "function createYouthPersonalScheduleData(",
      "type YouthPersonalScheduleEscortSnapshot",
    );
    const auditSource = extractSection(
      actionsSource,
      "function createYouthPersonalScheduleAuditSnapshot(",
      "function mapYouthPersonalScheduleMutationError(",
    );

    for (const field of [
      "scheduleType",
      "hospitalName",
      "escortType",
      "escortUserId",
      "escortName",
      "nextAppointmentDate",
    ]) {
      assert.match(dataSource, new RegExp(`\\b${field}\\b`));
      assert.match(auditSource, new RegExp(`\\b${field}\\b`));
    }

    assert.equal(
      (actionsSource.match(/resolveYouthPersonalScheduleEscortSnapshot\(/g) ?? [])
        .length,
      3,
      "the helper definition plus create and update calls are required",
    );
    assert.match(
      actionsSource,
      /createYouthPersonalScheduleData\([\s\S]*?normalizedInput\.value,[\s\S]*?escortSnapshot/,
    );
    assert.match(
      actionsSource,
      /next: createYouthPersonalScheduleAuditSnapshot\([\s\S]*?\.\.\.escortSnapshot/,
    );
    assert.match(actionsSource, /진료일에 재직 중이 아닙니다/);
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
