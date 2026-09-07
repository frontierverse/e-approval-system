import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isYouthCommonScheduleEndMinute,
  isYouthCommonScheduleStartMinute,
} from "../src/lib/youth-common-schedule-time.ts";
import {
  isYouthLearningScheduleEndMinute,
  isYouthLearningScheduleStartMinute,
} from "../src/lib/youth-management-core.ts";

test("common schedules accept evening sessions without extending learning schedules", () => {
  assert.equal(isYouthCommonScheduleStartMinute(1200), true);
  assert.equal(isYouthCommonScheduleEndMinute(1260, 1200), true);
  assert.equal(isYouthCommonScheduleStartMinute(1310), true);
  assert.equal(isYouthCommonScheduleEndMinute(1320, 1310), true);
  for (const minute of [530, 1201, 1320, NaN]) {
    assert.equal(isYouthCommonScheduleStartMinute(minute), false);
  }
  for (const minute of [1190, 1200, 1201, 1330, NaN]) {
    assert.equal(isYouthCommonScheduleEndMinute(minute, 1200), false);
  }
  assert.equal(isYouthCommonScheduleEndMinute(1260, 1201), false);
  assert.equal(isYouthLearningScheduleStartMinute(1200), false);
  assert.equal(isYouthLearningScheduleEndMinute(1260, 1020), false);
});
