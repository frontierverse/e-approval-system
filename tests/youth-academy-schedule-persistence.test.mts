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
const periodMigrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260901140000_add_youth_academy_schedule_period/migration.sql",
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

function extractInputByAriaLabel(source: string, ariaLabel: string) {
  const ariaLabelMarker = `aria-label={\`학원 일정 \${index + 1} ${ariaLabel}\`}`;
  const markerIndex = source.indexOf(ariaLabelMarker);

  assert.notEqual(
    markerIndex,
    -1,
    `학원 일정 ${ariaLabel} 입력의 접근 가능한 이름이 필요합니다.`,
  );

  const inputStartIndex = source.lastIndexOf("<input", markerIndex);
  const inputEndIndex = source.indexOf("/>", markerIndex);

  assert.notEqual(
    inputStartIndex,
    -1,
    `학원 일정 ${ariaLabel} input 시작 구간이 필요합니다.`,
  );
  assert.notEqual(
    inputEndIndex,
    -1,
    `학원 일정 ${ariaLabel} input 종료 구간이 필요합니다.`,
  );

  return source.slice(inputStartIndex, inputEndIndex + 2);
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
    assert.match(academyScheduleModelSource, /startDate\s+DateTime\?\s+@db\.Date/);
    assert.match(academyScheduleModelSource, /endDate\s+DateTime\?\s+@db\.Date/);
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
    assert.match(periodMigrationSource, /"startDate"\s+DATE/);
    assert.match(periodMigrationSource, /"endDate"\s+DATE/);
    assert.match(
      periodMigrationSource,
      /CONSTRAINT "YouthAcademySchedule_period_check"\s+CHECK \([\s\S]*?"startDate" IS NULL[\s\S]*?"endDate" IS NULL[\s\S]*?OR[\s\S]*?"startDate" IS NOT NULL[\s\S]*?"endDate" IS NOT NULL[\s\S]*?"endDate" >= "startDate"[\s\S]*?\);/,
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
    assert.match(managementSource, /startDate:\s*Date \| string \| null;/);
    assert.match(managementSource, /endDate:\s*Date \| string \| null;/);
    assert.match(
      managementSource,
      /startDate:\s*formatYouthAcademyScheduleDate\(record\.startDate\)/,
    );
    assert.match(
      managementSource,
      /endDate:\s*formatYouthAcademyScheduleDate\(record\.endDate\)/,
    );
    assert.match(
      managementSource,
      /function formatYouthAcademyScheduleDate\([\s\S]*?if \(value === null\)\s*\{\s*return "";/,
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
    assert.match(
      replaceAcademySchedulesSource,
      /startDate:\s*parseYouthAcademyScheduleDate\(schedule\.startDate\)/,
    );
    assert.match(
      replaceAcademySchedulesSource,
      /endDate:\s*parseYouthAcademyScheduleDate\(schedule\.endDate\)/,
    );
    assert.match(updateYouthActionSource, /endMinute:\s*true/);
    assert.match(updateYouthActionSource, /startDate:\s*true/);
    assert.match(updateYouthActionSource, /endDate:\s*true/);
    assert.match(
      actionsSource,
      /endTime:\s*schedule\.endMinute === null\s*\? ""\s*:\s*formatYouthAcademyAttendanceTime\(schedule\.endMinute\)/,
    );
    assert.match(
      actionsSource,
      /const timeRange = schedule\.endTime\s*\? `\$\{schedule\.attendanceTime\}~\$\{schedule\.endTime\}`\s*:\s*schedule\.attendanceTime/,
    );
  });

  test("renders, validates, and submits academy times and attendance period", () => {
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
    assert.match(
      formModalSource,
      /aria-label=\{`학원 일정 \$\{index \+ 1\} 시작일`\}[\s\S]*?type="date"[\s\S]*?value=\{schedule\.startDate\}/,
    );
    assert.match(
      formModalSource,
      /aria-label=\{`학원 일정 \$\{index \+ 1\} 종료일`\}[\s\S]*?type="date"[\s\S]*?value=\{schedule\.endDate\}/,
    );
    assert.match(
      formModalSource,
      /updateAcademySchedule\(schedule\.key, \{\s*startDate:\s*event\.target\.value,/,
    );
    assert.match(
      formModalSource,
      /updateAcademySchedule\(schedule\.key, \{\s*endDate:\s*event\.target\.value,/,
    );
    assert.match(boardSource, /endTime:\s*schedule\.endTime \?\? ""/);
    assert.match(boardSource, /startDate:\s*schedule\.startDate \?\? ""/);
    assert.match(boardSource, /endDate:\s*schedule\.endDate \?\? ""/);
    assert.match(boardSource, /!schedule\.endTime/);
    assert.match(boardSource, /!schedule\.startDate/);
    assert.match(boardSource, /!schedule\.endDate/);
    assert.match(
      boardSource,
      /if \(schedule\.endTime <= schedule\.attendanceTime\)/,
    );
    assert.match(boardSource, /if \(schedule\.endDate < schedule\.startDate\)/);
    assert.match(boardSource, /endTime:\s*schedule\.endTime,/);
    assert.match(boardSource, /startDate:\s*schedule\.startDate,/);
    assert.match(boardSource, /endDate:\s*schedule\.endDate,/);
    assert.match(boardSource, /weekdays:\s*schedule\.weekdays,/);
  });

  test("opens academy time and date pickers from the full input surface", () => {
    const pickerHelperStart = boardSource.indexOf(
      "function openNativeInputPicker(",
    );
    const pickerHelperEnd = boardSource.indexOf("\n}\n", pickerHelperStart);

    assert.notEqual(
      pickerHelperStart,
      -1,
      "native picker를 여는 공용 helper가 필요합니다.",
    );
    assert.notEqual(
      pickerHelperEnd,
      -1,
      "native picker helper의 종료 구간이 필요합니다.",
    );

    const pickerHelperSource = boardSource.slice(
      pickerHelperStart,
      pickerHelperEnd + 2,
    );

    assert.match(
      pickerHelperSource,
      /typeof input\.showPicker !== "function"/,
    );
    assert.match(
      pickerHelperSource,
      /try\s*\{[\s\S]*?input\.showPicker\(\);[\s\S]*?\}\s*catch(?:\s*\([^)]*\))?\s*\{/,
    );
    assert.doesNotMatch(pickerHelperSource, /preventDefault\s*\(/);

    for (const [ariaLabel, inputType] of [
      ["등원 시간", "time"],
      ["마치는 시간", "time"],
      ["시작일", "date"],
      ["종료일", "date"],
    ] as const) {
      const inputSource = extractInputByAriaLabel(formModalSource, ariaLabel);

      assert.match(inputSource, new RegExp(`type="${inputType}"`));
      assert.match(inputSource, /onClick=\{openNativeInputPicker\}/);
      assert.match(inputSource, /cursor-pointer/);
      assert.doesNotMatch(inputSource, /preventDefault\s*\(/);
      assert.doesNotMatch(inputSource, /\breadOnly(?:\s|=|\})/);
    }
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
