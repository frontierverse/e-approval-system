import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/youth/actions.ts", import.meta.url),
  "utf8",
);
const rosterSource = readFileSync(
  new URL("../src/lib/youth-roster.ts", import.meta.url),
  "utf8",
);
const managementSource = readFileSync(
  new URL("../src/lib/youth-management.ts", import.meta.url),
  "utf8",
);
const boardSource = readFileSync(
  new URL("../src/components/youth-roster-board.tsx", import.meta.url),
  "utf8",
);
const schemaSource = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260901120000_add_youth_academy_schedules/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const endTimeMigrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260901130000_add_youth_academy_schedule_end_time/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function extractSection(
  source: string,
  startMarker: string,
  endMarker: string,
  label: string,
) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);

  assert.notEqual(startIndex, -1, `${label} 시작 구간이 필요합니다.`);
  assert.notEqual(endIndex, -1, `${label} 종료 구간이 필요합니다.`);

  return source.slice(startIndex, endIndex);
}

const academyScheduleModelSource = extractSection(
  schemaSource,
  "model YouthAcademySchedule {",
  "model YouthDischargeExtension {",
  "학원 일정 Prisma 모델",
);
const detailViewActionSource = extractSection(
  actionsSource,
  "export async function recordYouthDetailViewAction(",
  "export async function recordYouthContactViewAction(",
  "청소년 상세 열람 액션",
);
const replaceAcademySchedulesSource = extractSection(
  actionsSource,
  "async function replaceYouthAcademySchedules(",
  "function findYouthAcademySchedules(",
  "학원 일정 교체 함수",
);
const updateYouthActionSource = extractSection(
  actionsSource,
  "export async function updateYouthAction(",
  "export async function extendYouthDischargeAction(",
  "청소년 수정 액션",
);
const rosterQuerySource = extractSection(
  rosterSource,
  "async function getYouthRosterRows()",
  "function mapYouthRosterItem(",
  "청소년 명단 초기 조회",
);
const rosterMapperSource = extractSection(
  rosterSource,
  "function mapYouthRosterItem(",
  "function getFamilyContacts(",
  "청소년 명단 매퍼",
);
const profileIncludeSource = extractSection(
  managementSource,
  "const youthInclude = {",
  "type YouthRecord =",
  "공용 청소년 프로필 조회 include",
);
const getYouthProfilesSource = extractSection(
  managementSource,
  "export async function getYouthProfiles()",
  "export async function getFamilyContactsByYouthId(",
  "공용 청소년 프로필 조회",
);
const formModalSource = extractSection(
  boardSource,
  "export function YouthRosterFormModal(",
  "function YouthDischargeExtensionModal(",
  "청소년 정보 모달",
);
const addAcademyScheduleSource = extractSection(
  formModalSource,
  "  function addAcademySchedule()",
  "  function removeAcademySchedule(",
  "학원 일정 추가 처리",
);
const submitFormSource = extractSection(
  formModalSource,
  "  function submitForm(",
  "  function deleteCurrentYouth()",
  "청소년 정보 저장 처리",
);

describe("youth academy schedule persistence contracts", () => {
  test("keeps the Prisma model and migration constraints aligned", () => {
    const schemaUniqueName = academyScheduleModelSource.match(
      /@@unique\(\[youthId,\s*academyName,\s*weekdays,\s*attendanceMinute\],\s*map:\s*"([^"]+)"\)/,
    )?.[1];
    const migrationUniqueName = migrationSource.match(
      /CREATE UNIQUE INDEX "([^"]+)"\s+ON "YouthAcademySchedule"\("youthId", "academyName", "weekdays", "attendanceMinute"\)/,
    )?.[1];

    assert.ok(schemaUniqueName, "Prisma unique map 이름이 필요합니다.");
    assert.ok(migrationUniqueName, "migration unique index 이름이 필요합니다.");
    assert.equal(schemaUniqueName, "YouthAcademySchedule_youth_slot_key");
    assert.equal(migrationUniqueName, schemaUniqueName);
    assert.ok(Buffer.byteLength(schemaUniqueName, "utf8") <= 63);
    assert.match(academyScheduleModelSource, /endMinute\s+Int\?/);
    assert.match(
      academyScheduleModelSource,
      /youth\s+Youth\s+@relation\([^\n]*onDelete:\s*Cascade\)/,
    );

    for (const constraintName of [
      "YouthAcademySchedule_academyName_check",
      "YouthAcademySchedule_weekdays_check",
      "YouthAcademySchedule_attendanceMinute_check",
      "YouthAcademySchedule_sortOrder_check",
    ]) {
      assert.match(
        migrationSource,
        new RegExp(`CONSTRAINT "${constraintName}"\\s+CHECK`),
      );
    }

    assert.match(
      migrationSource,
      /FOREIGN KEY \("youthId"\) REFERENCES "Youth"\("id"\)\s+ON DELETE CASCADE ON UPDATE CASCADE/,
    );
    assert.match(
      migrationSource,
      /ALTER TABLE "YouthAcademySchedule" ENABLE ROW LEVEL SECURITY/,
    );
    assert.match(
      endTimeMigrationSource,
      /ALTER TABLE "YouthAcademySchedule"\s+ADD COLUMN "endMinute" INTEGER;/,
    );
    assert.match(
      endTimeMigrationSource,
      /CONSTRAINT "YouthAcademySchedule_endMinute_check"\s+CHECK \([\s\S]*?"endMinute" IS NULL[\s\S]*?"endMinute" >= 0[\s\S]*?"endMinute" < 1440[\s\S]*?"endMinute" > "attendanceMinute"[\s\S]*?\);/,
    );
  });

  test("returns academy schedules only through the audited detail action", () => {
    assert.match(detailViewActionSource, /const user = await requireUser\(\)/);
    assert.match(detailViewActionSource, /AuditAction\.VIEW_YOUTH_DETAIL/);
    assert.match(detailViewActionSource, /await prisma\.auditLog\.create\(/);
    assert.match(
      detailViewActionSource,
      /await prisma\.youthAcademySchedule\.findMany\(/,
    );
    assert.match(
      detailViewActionSource,
      /academySchedules:\s*academySchedules\.map\(mapYouthAcademySchedule\)/,
    );
    assert.doesNotMatch(rosterQuerySource, /academySchedules/);
    assert.match(rosterMapperSource, /academySchedules:\s*\[\]/);
    assert.doesNotMatch(profileIncludeSource, /academySchedules/);
    assert.match(getYouthProfilesSource, /academySchedules:\s*\[\]/);
    assert.match(
      managementSource,
      /endMinute:\s*number \| null;[\s\S]*?endTime:\s*record\.endMinute === null\s*\? (?:null|"")\s*:\s*formatMinuteOfDay\(record\.endMinute\)/,
    );
  });

  test("uses optimistic concurrency and preserves omitted schedules", () => {
    assert.match(
      updateYouthActionSource,
      /normalizeYouthExpectedUpdatedAt\(\s*values\.expectedUpdatedAt,?\s*\)/,
    );
    assert.match(
      updateYouthActionSource,
      /tx\.youth\.updateMany\(\{[\s\S]*?where:\s*\{[\s\S]*?id:\s*youthId,[\s\S]*?updatedAt:\s*normalizedExpectedUpdatedAt\.value/,
    );
    assert.match(
      updateYouthActionSource,
      /if \(updateResult\.count !== 1\)\s*\{\s*throw new YouthUpdateConflictError\(\);/,
    );
    assert.match(
      updateYouthActionSource,
      /const academySchedules = normalizedAcademySchedules\.provided\s*\?[\s\S]*?replaceYouthAcademySchedules\([\s\S]*?normalizedAcademySchedules\.value[\s\S]*?: await findYouthAcademySchedules\(tx, youthId\);/,
    );
    assert.match(
      replaceAcademySchedulesSource,
      /youthAcademySchedule\.deleteMany\(/,
    );
    assert.match(
      replaceAcademySchedulesSource,
      /if \(schedules\.length > 0\)[\s\S]*?youthAcademySchedule\.createMany\(/,
    );
    assert.match(
      replaceAcademySchedulesSource,
      /attendanceMinute:\s*schedule\.attendanceMinute,[\s\S]*?endMinute:\s*schedule\.endMinute,/,
    );
    assert.match(updateYouthActionSource, /endMinute:\s*true/);
    assert.match(
      actionsSource,
      /endTime:\s*schedule\.endMinute === null\s*\? ""\s*:\s*formatYouthAcademyAttendanceTime\(schedule\.endMinute\)/,
    );
    assert.match(
      actionsSource,
      /const timeRange = schedule\.endTime\s*\? `\$\{schedule\.attendanceTime\}~\$\{schedule\.endTime\}`\s*:\s*schedule\.attendanceTime/,
    );
  });

  test("renders, validates, and submits a second academy time input", () => {
    assert.match(
      formModalSource,
      /const endTimeId = getAcademyScheduleFieldId\([\s\S]*?"endTime",\s*\);/,
    );
    assert.match(
      formModalSource,
      /aria-label=\{`학원 일정 \$\{index \+ 1\} 마치는 시간`\}[\s\S]*?type="time"[\s\S]*?value=\{schedule\.endTime\}/,
    );
    assert.match(
      formModalSource,
      /updateAcademySchedule\(schedule\.key, \{\s*endTime:\s*event\.target\.value,/,
    );
    assert.match(boardSource, /endTime:\s*schedule\.endTime \?\? ""/);
    assert.match(boardSource, /!schedule\.endTime/);
    assert.match(
      boardSource,
      /if \(schedule\.endTime <= schedule\.attendanceTime\)/,
    );
    assert.match(
      boardSource,
      /academySchedules:[\s\S]*?endTime:\s*schedule\.endTime,[\s\S]*?weekdays:\s*schedule\.weekdays/,
    );
  });

  test("blocks saving before lazy loading and sends the conflict token", () => {
    assert.match(
      formModalSource,
      /const academyScheduleLimitReached =\s*draft\.academySchedules\.length >= youthAcademyScheduleMaxCount/,
    );
    assert.match(addAcademyScheduleSource, /academyScheduleLimitReached/);
    assert.match(
      submitFormSource,
      /if \(modal\.mode === "edit" && !academySchedulesReady\)[\s\S]*?return;/,
    );
    assert.ok(
      submitFormSource.indexOf("!academySchedulesReady") <
        submitFormSource.indexOf("getYouthInputFromDraft"),
      "학원 일정 로드 확인은 저장 payload 생성보다 먼저 실행되어야 합니다.",
    );
    assert.match(
      submitFormSource,
      /draft\.academySchedules\.length > youthAcademyScheduleMaxCount/,
    );
    assert.match(
      formModalSource,
      /const \[expectedUpdatedAt,\s*setExpectedUpdatedAt\] = useState\(\(\) =>\s*modal\.mode === "edit" \? modal\.youth\.updatedAt : undefined/,
    );
    assert.match(
      formModalSource,
      /setExpectedUpdatedAt\(result\.data\.updatedAt\)/,
    );
    assert.match(formModalSource, /setExpectedUpdatedAt\(result\.updatedAt\)/);
    assert.match(submitFormSource, /\.\.\.values,\s*expectedUpdatedAt,/);
  });
});
