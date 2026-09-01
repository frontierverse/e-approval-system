import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/youth/actions.ts", import.meta.url),
  "utf8",
);
const rosterPageSource = readFileSync(
  new URL("../src/app/youth/roster/page.tsx", import.meta.url),
  "utf8",
);
const rosterSource = readFileSync(
  new URL("../src/lib/youth-roster.ts", import.meta.url),
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
const migrationsDirectoryUrl = new URL(
  "../prisma/migrations-postgresql/",
  import.meta.url,
);
const allMigrationSources = readdirSync(migrationsDirectoryUrl, {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    readFileSync(
      new URL(`${entry.name}/migration.sql`, migrationsDirectoryUrl),
      "utf8",
    ),
  )
  .join("\n");

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
const detailModalSource = extractSection(
  boardSource,
  "function YouthRosterDetailModal(",
  "function YouthDetailValue(",
  "청소년 상세 모달",
);
const formModalSource = extractSection(
  boardSource,
  "export function YouthRosterFormModal(",
  "function YouthDischargeExtensionModal(",
  "청소년 정보 모달",
);
const youthInputSource = extractSection(
  boardSource,
  "function getYouthInputFromDraft(",
  "function mapYouthProfileToRosterItem(",
  "청소년 저장 입력 생성 함수",
);

describe("removed youth roster academy schedule contracts", () => {
  test("keeps the legacy Prisma model and applied migrations without dropping stored rows", () => {
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
    assert.match(schemaSource, /academySchedules\s+YouthAcademySchedule\[\]/);
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
    assert.doesNotMatch(
      allMigrationSources,
      /DROP TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?"YouthAcademySchedule"/i,
    );
  });

  test("retains audited detail views without returning or querying academy data", () => {
    assert.match(detailViewActionSource, /\):\s*Promise<void>/);
    assert.match(
      detailViewActionSource,
      /requireYouthPermission\("canViewYouthDetails"\)/,
    );
    assert.match(detailViewActionSource, /AuditAction\.VIEW_YOUTH_DETAIL/);
    assert.match(detailViewActionSource, /await prisma\.auditLog\.create\(/);
    assert.doesNotMatch(
      detailViewActionSource,
      /academySchedules|youthAcademySchedule|mapYouthAcademySchedule/,
    );
    assert.doesNotMatch(
      actionsSource,
      /\.youthAcademySchedule\.(?:find|create|delete|update|upsert)/,
    );
    assert.match(rosterPageSource, /recordYouthDetailViewAction/);
    assert.match(
      rosterPageSource,
      /recordYouthDetailView=\{[\s\S]*?recordYouthDetailViewAction/,
    );
  });

  test("removes academy schedules from roster detail, create, and edit UI", () => {
    assert.doesNotMatch(
      boardSource,
      /academySchedules|AcademySchedule|학원 일정|학원 추가|학원명|등원 시간|마치는 시간/,
    );
    assert.doesNotMatch(rosterSource, /academySchedules|YouthAcademySchedule/);
    assert.match(
      boardSource,
      /recordYouthDetailView\?:\s*\(\s*youthId:\s*string,?\s*\)\s*=>\s*Promise<void>/,
    );
    assert.match(
      detailModalSource,
      /void recordYouthDetailView\(youth\.id\)\.catch/,
    );
    assert.match(
      formModalSource,
      /void recordYouthDetailView\(viewedYouthId\)\.catch/,
    );
    assert.match(detailModalSource, /기본정보/);
    assert.match(detailModalSource, /연락처/);
    assert.match(detailModalSource, /결정문/);
    assert.match(formModalSource, /가족 연락처/);
    assert.match(formModalSource, /결정문 파일/);
  });

  test("does not send academy schedules in youth create or update payloads", () => {
    assert.doesNotMatch(youthInputSource, /academySchedules|AcademySchedule/);
    assert.match(youthInputSource, /admissionDate:\s*draft\.admissionDate/);
    assert.match(youthInputSource, /birthDate:\s*draft\.birthDate/);
    assert.match(youthInputSource, /dischargeDate:\s*draft\.dischargeDate/);
    assert.match(youthInputSource, /familyContacts:\s*draft\.familyContacts/);
    assert.match(youthInputSource, /name:\s*draft\.name/);
    assert.match(youthInputSource, /phone:\s*draft\.phone/);
  });
});
