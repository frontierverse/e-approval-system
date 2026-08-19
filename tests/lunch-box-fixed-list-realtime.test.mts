import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const fixedListRealtimeRouteSource = readFileSync(
  new URL(
    "../src/app/api/lunch-boxes/school-checks/stream/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const fixedListComponentSource = readFileSync(
  new URL(
    "../src/components/lunch-box-school-checklist.tsx",
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
const lunchBoxSchoolRealtimeMigrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260819200000_enable_lunch_box_school_realtime/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("fixed school-list realtime invalidation", () => {
  test("streams checklist and count changes as distinct events", () => {
    assert.match(
      fixedListRealtimeRouteSource,
      /table: "LunchBoxSchoolCheck"[\s\S]*?sendEvent\("change"\)/,
    );
    assert.match(
      fixedListRealtimeRouteSource,
      /table: "LunchBoxCount"[\s\S]*?sendEvent\("count-change"\)/,
    );
    assert.match(
      fixedListRealtimeRouteSource,
      /table: "LunchBoxSchool"[\s\S]*?sendEvent\("school-change"\)/,
    );
  });

  test("subscribes to both tables before announcing that the stream is ready", () => {
    const schoolCheckSubscriptionIndex = fixedListRealtimeRouteSource.indexOf(
      'table: "LunchBoxSchoolCheck"',
    );
    const countSubscriptionIndex = fixedListRealtimeRouteSource.indexOf(
      'table: "LunchBoxCount"',
    );
    const schoolSubscriptionIndex = fixedListRealtimeRouteSource.indexOf(
      'table: "LunchBoxSchool"',
    );
    const subscribeIndex = fixedListRealtimeRouteSource.indexOf(
      ".subscribe((status, error) =>",
    );
    const readyEventIndex = fixedListRealtimeRouteSource.indexOf(
      'sendEvent("ready")',
    );

    assert.ok(schoolCheckSubscriptionIndex >= 0);
    assert.ok(countSubscriptionIndex > schoolCheckSubscriptionIndex);
    assert.ok(schoolSubscriptionIndex > countSubscriptionIndex);
    assert.ok(subscribeIndex > schoolSubscriptionIndex);
    assert.ok(readyEventIndex > subscribeIndex);
  });

  test("uses the existing realtime publication for lunch-box counts", () => {
    assert.match(
      lunchBoxRealtimeMigrationSource,
      /ADD TABLE public\."LunchBoxCount"/,
    );
  });

  test("adds lunch-box school metadata to the realtime publication idempotently", () => {
    assert.match(
      lunchBoxSchoolRealtimeMigrationSource,
      /IF NOT EXISTS[\s\S]*?tablename = 'LunchBoxSchool'[\s\S]*?ADD TABLE public\."LunchBoxSchool"/,
    );
  });

  test("refreshes both count rows and checks after count events or fallback recovery", () => {
    assert.match(
      fixedListComponentSource,
      /const refreshFixedList = useCallback\(\(\) => router\.refresh\(\), \[router\]\)/,
    );
    assert.match(
      fixedListComponentSource,
      /function scheduleFullSync[\s\S]*?scheduleCanonicalSync\(delay\);[\s\S]*?scheduleFixedListRefresh\(delay\);/,
    );
    assert.match(
      fixedListComponentSource,
      /addEventListener\("count-change"[\s\S]*?scheduleFullSync\(\)/,
    );
    assert.match(
      fixedListComponentSource,
      /addEventListener\("school-change"[\s\S]*?scheduleFullSync\(\)/,
    );
    assert.match(
      fixedListComponentSource,
      /!isRealtimeReady[\s\S]*?scheduleFullSync\(0\)/,
    );
  });

  test("guards the ready refresh while re-enabling it after a real disconnect", () => {
    assert.match(
      fixedListComponentSource,
      /refreshFixedListOnReadyRef = useRef\(true\)/,
    );
    assert.match(
      fixedListComponentSource,
      /addEventListener\("ready"[\s\S]*?refreshFixedListOnReadyRef\.current = false;[\s\S]*?scheduleFixedListRefresh\(0\)/,
    );
    assert.match(
      fixedListComponentSource,
      /addEventListener\("reconnect"[\s\S]*?refreshFixedListOnReadyRef\.current = true/,
    );
  });

  test("keeps the realtime subscription stable when refreshed row props change", () => {
    assert.match(
      fixedListComponentSource,
      /fixedCountRowsRef = useRef\(fixedCountList\.rows\)[\s\S]*?fixedCountRowsRef\.current = fixedCountList\.rows/,
    );
    assert.match(
      fixedListComponentSource,
      /applyCanonicalChecklist = useCallback\([\s\S]*?fixedCountRowsRef\.current[\s\S]*?,\s*\[\],\s*\)/,
    );
    assert.doesNotMatch(
      fixedListComponentSource,
      /\}, \[applyCanonicalChecklist, loadChecklist\]\);/,
    );
  });
});
