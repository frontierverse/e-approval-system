import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/work-schedule/lunch-boxes/actions.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260819190000_clear_iri_school_check_after_schedule_change/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const saveCountsActionSource = actionsSource.match(
  /export async function saveLunchBoxCountsAction[\s\S]*?(?=export async function createLunchBoxSchoolAction)/,
)?.[0];
const setSchoolCheckActionSource = actionsSource.match(
  /export async function setLunchBoxSchoolCheckAction[\s\S]*?(?=export async function clearLunchBoxSchoolChecksAction)/,
)?.[0];
const updateSchoolActionSource = actionsSource.match(
  /export async function updateLunchBoxSchoolAction[\s\S]*?(?=export async function setLunchBoxSchoolActiveAction)/,
)?.[0];
const setSchoolActiveActionSource = actionsSource.match(
  /export async function setLunchBoxSchoolActiveAction[\s\S]*?(?=function validateLunchBoxSchoolValues)/,
)?.[0];

assert.ok(saveCountsActionSource, "도시락 수량 저장 액션이 필요합니다.");
assert.ok(setSchoolCheckActionSource, "전체 학교 목록 체크 액션이 필요합니다.");
assert.ok(updateSchoolActionSource, "학교 정보 수정 액션이 필요합니다.");
assert.ok(setSchoolActiveActionSource, "학교 활성 상태 변경 액션이 필요합니다.");

describe("lunch-box fixed school-check invalidation", () => {
  test("clears only Iri Elementary after verifying the corrected six-date schedule", () => {
    assert.match(migrationSource, /school\."name" = '이리초'/);
    assert.match(migrationSource, /school\."type" = 'elementary'/);
    assert.match(migrationSource, /school\."active"/);

    const correctedScheduleSection = migrationSource.match(
      /WHERE count\."date" IN \(([\s\S]*?)\)\s*AND ROW\(/,
    )?.[1];

    assert.ok(correctedScheduleSection, "보정 수량 검증 날짜 구간이 필요합니다.");
    assert.deepEqual(
      [...correctedScheduleSection.matchAll(/DATE '(2026-\d{2}-\d{2})'/g)].map(
        (match) => match[1],
      ),
      [
        "2026-08-24",
        "2026-08-25",
        "2026-08-26",
        "2026-08-27",
        "2026-08-28",
        "2026-08-31",
      ],
    );
    assert.match(
      migrationSource,
      /IS NOT DISTINCT FROM ROW\(22, 20, 21, 0, 19, 1, 0\)/,
    );
    assert.match(migrationSource, /corrected_rows <> 6/);
    assert.match(migrationSource, /count\."checkedAt" IS NULL/);
    assert.match(migrationSource, /count\."checkedById" IS NULL/);
  });

  test("is safe when the Iri check was already clear and proves other checks stay unchanged", () => {
    assert.match(migrationSource, /LOCK TABLE "LunchBoxSchoolCheck"/);
    assert.match(
      migrationSource,
      /DELETE FROM "LunchBoxSchoolCheck" AS checkrow[\s\S]*?USING "_lunch_box_iri_school_check_target"/,
    );
    assert.match(migrationSource, /IF deleted_rows > 1 THEN/);
    assert.doesNotMatch(migrationSource, /IF deleted_rows <> 1 THEN/);
    assert.match(migrationSource, /"_lunch_box_iri_school_check_before"/);
    assert.match(migrationSource, /EXCEPT[\s\S]*?UNION ALL[\s\S]*?EXCEPT/);
    assert.match(migrationSource, /이리초 외 전체 준비 체크가 변경되었습니다/);
    assert.doesNotMatch(migrationSource, /(?:UPDATE|DELETE FROM) "LunchBoxCount"/);
  });

  test("invalidates completed fixed-list checks whenever saved quantities actually change", () => {
    assert.match(
      saveCountsActionSource,
      /changedSchoolIds = changedRows[\s\S]*?\.map\(\(\{ school \}\) => school\.id\)/,
    );
    assert.match(
      saveCountsActionSource,
      /changedSchoolIds[\s\S]*?FOR UPDATE[\s\S]*?lunchBoxSchoolCheck\.findMany/,
    );
    assert.match(
      saveCountsActionSource,
      /lunchBoxSchoolCheck\.findMany\([\s\S]*?schoolId: \{ in: changedSchoolIds \}/,
    );
    assert.match(
      saveCountsActionSource,
      /lunchBoxSchoolCheck\.deleteMany\([\s\S]*?invalidatedSchoolChecks\.map\(\(check\) => check\.id\)/,
    );
    assert.match(saveCountsActionSource, /targetType: "LunchBoxSchoolCheck"/);
    assert.match(
      saveCountsActionSource,
      /changeType: "lunchBoxSchoolCheck\.invalidate"/,
    );
    assert.match(saveCountsActionSource, /previousChecked: true/);
    assert.match(saveCountsActionSource, /nextChecked: false/);
    assert.match(saveCountsActionSource, /reason: "lunchBoxCount\.changed"/);
  });

  test("leaves the fixed-list check intact for a no-op count submission", () => {
    const noChangeReturnIndex = saveCountsActionSource.indexOf(
      "if (changedRows.length === 0)",
    );
    const invalidationQueryIndex = saveCountsActionSource.indexOf(
      "tx.lunchBoxSchoolCheck.findMany",
    );

    assert.ok(noChangeReturnIndex >= 0);
    assert.ok(invalidationQueryIndex > noChangeReturnIndex);
  });

  test("rejects a stale fixed-list completion after locking and rebuilding the canonical snapshot", () => {
    assert.match(
      setSchoolCheckActionSource,
      /schoolId: string,\s*isChecked: boolean,\s*expectedSnapshot: string/,
    );
    assert.match(
      setSchoolCheckActionSource,
      /isChecked &&[\s\S]*?\^\[a-f0-9\]\{64\}\$[\s\S]*?최신 목록을 확인/,
    );

    const lockIndex = setSchoolCheckActionSource.indexOf("FOR UPDATE");
    const countReadIndex = setSchoolCheckActionSource.indexOf(
      "tx.lunchBoxCount.findMany",
    );
    const snapshotIndex = setSchoolCheckActionSource.indexOf(
      "createLunchBoxSchoolCountSnapshot",
    );
    const staleComparisonIndex = setSchoolCheckActionSource.indexOf(
      "currentSnapshot !== expectedSnapshot",
    );
    const checkCreateIndex = setSchoolCheckActionSource.indexOf(
      "tx.lunchBoxSchoolCheck.create",
    );

    assert.ok(lockIndex >= 0);
    assert.ok(countReadIndex > lockIndex);
    assert.ok(snapshotIndex > countReadIndex);
    assert.ok(staleComparisonIndex > snapshotIndex);
    assert.ok(checkCreateIndex > staleComparisonIndex);
    assert.match(
      setSchoolCheckActionSource,
      /mutationResult\.kind === "stale"[\s\S]*?revalidatePath\(lunchBoxManagementPath\)[\s\S]*?수량 또는 학교 정보가 변경/,
    );
  });

  test("invalidates a completed fixed-list check when displayed school information changes", () => {
    assert.match(
      updateSchoolActionSource,
      /SELECT "id", "name", "type", "preservationClass", "active"[\s\S]*?FOR UPDATE/,
    );
    assert.match(
      updateSchoolActionSource,
      /schoolInfoChanged =[\s\S]*?lockedSchool\.name !== values\.name[\s\S]*?lockedSchool\.preservationClass !== nextPreservationClass[\s\S]*?lockedSchool\.type !== values\.type/,
    );
    assert.match(
      updateSchoolActionSource,
      /schoolInfoChanged[\s\S]*?lunchBoxSchoolCheck\.findUnique[\s\S]*?lunchBoxSchoolCheck\.delete/,
    );
    assert.match(updateSchoolActionSource, /reason: "lunchBoxSchool\.changed"/);
    assert.match(updateSchoolActionSource, /previousChecked: true/);
    assert.match(updateSchoolActionSource, /nextChecked: false/);
  });

  test("invalidates legacy and current fixed-list checks on both activation directions", () => {
    assert.match(
      setSchoolActiveActionSource,
      /SELECT "id", "name", "type", "active"[\s\S]*?FOR UPDATE/,
    );
    assert.match(
      setSchoolActiveActionSource,
      /lockedSchool\.active === active[\s\S]*?return/,
    );
    assert.match(
      setSchoolActiveActionSource,
      /lunchBoxSchoolCheck\.findUnique[\s\S]*?lunchBoxSchool\.update[\s\S]*?lunchBoxSchoolCheck\.delete/,
    );
    assert.match(
      setSchoolActiveActionSource,
      /reason: "lunchBoxSchool\.activeChanged"/,
    );
    assert.match(
      setSchoolActiveActionSource,
      /if \(!active\) \{[\s\S]*?lunchBoxCount\.updateMany[\s\S]*?\n    \}\n\n    if \(invalidatedSchoolCheck\) \{\n      await tx\.lunchBoxSchoolCheck\.delete/,
    );
  });
});
