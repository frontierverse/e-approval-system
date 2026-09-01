import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatYouthSchoolGradeLabel,
  normalizeYouthAcademySchedules,
  type YouthAcademyScheduleInput,
  youthAcademyNameMaxLength,
  youthAcademyScheduleMaxCount,
} from "../src/lib/youth-management-core.ts";

function normalizeUnknownAcademySchedules(value: unknown) {
  return normalizeYouthAcademySchedules(
    value as Parameters<typeof normalizeYouthAcademySchedules>[0],
  );
}

describe("youth academy schedule normalization", () => {
  test("normalizes academy names, weekday order, and attendance minutes", () => {
    assert.deepEqual(
      normalizeYouthAcademySchedules([
        {
          academyName: "  새봄수학학원  ",
          weekdays: [5, 1, 3, 1],
          attendanceTime: " 18:05 ",
        },
      ]),
      {
        provided: true,
        value: [
          {
            academyName: "새봄수학학원",
            weekdays: [1, 3, 5],
            weekdaysValue: "1,3,5",
            attendanceTime: "18:05",
            attendanceMinute: 1085,
          },
        ],
      },
    );
  });

  test("skips completely blank rows and distinguishes omitted schedules", () => {
    assert.deepEqual(normalizeYouthAcademySchedules(undefined), {
      provided: false,
      value: [],
    });
    assert.deepEqual(normalizeYouthAcademySchedules([]), {
      provided: true,
      value: [],
    });
    assert.deepEqual(
      normalizeYouthAcademySchedules([
        {
          academyName: "   ",
          weekdays: [],
          attendanceTime: " ",
        },
      ]),
      {
        provided: true,
        value: [],
      },
    );
  });

  test("rejects partially filled rows with row-specific errors", () => {
    const partialRows = [
      {
        input: [{ academyName: "", weekdays: [1], attendanceTime: "18:00" }],
        error: /1번 학원명을 입력하세요/,
      },
      {
        input: [
          {
            academyName: "새봄수학학원",
            weekdays: [],
            attendanceTime: "18:00",
          },
        ],
        error: /1번 요일을 하나 이상 선택하세요/,
      },
      {
        input: [
          {
            academyName: "새봄수학학원",
            weekdays: [1],
            attendanceTime: "",
          },
        ],
        error: /1번 등원 시간은 HH:mm 형식으로 입력하세요/,
      },
    ];

    for (const { input, error } of partialRows) {
      const result = normalizeUnknownAcademySchedules(input);

      assert.match(result.error ?? "", error);
      assert.deepEqual(result.value, []);
    }
  });

  test("rejects invalid weekdays and HH:mm values", () => {
    const invalidWeekday = normalizeUnknownAcademySchedules([
      {
        academyName: "새봄수학학원",
        weekdays: [7],
        attendanceTime: "18:00",
      },
    ]);
    const invalidTime = normalizeYouthAcademySchedules([
      {
        academyName: "새봄수학학원",
        weekdays: [1],
        attendanceTime: "24:00",
      },
    ]);

    assert.match(invalidWeekday.error ?? "", /요일을 다시 선택하세요/);
    assert.deepEqual(invalidWeekday.value, []);
    assert.match(invalidTime.error ?? "", /HH:mm 형식/);
    assert.deepEqual(invalidTime.value, []);
  });

  test("accepts evening academy attendance times", () => {
    assert.deepEqual(
      normalizeYouthAcademySchedules([
        {
          academyName: "푸른영어학원",
          weekdays: [2, 4],
          attendanceTime: "20:30",
        },
      ]),
      {
        provided: true,
        value: [
          {
            academyName: "푸른영어학원",
            weekdays: [2, 4],
            weekdaysValue: "2,4",
            attendanceTime: "20:30",
            attendanceMinute: 1230,
          },
        ],
      },
    );
  });

  test("rejects duplicate schedules after normalization", () => {
    const result = normalizeYouthAcademySchedules([
      {
        academyName: "새봄수학학원",
        weekdays: [1, 3, 1],
        attendanceTime: "18:30",
      },
      {
        academyName: " 새봄수학학원 ",
        weekdays: [3, 1],
        attendanceTime: " 18:30 ",
      },
    ]);

    assert.equal(result.provided, true);
    assert.match(result.error ?? "", /2번이 앞선 일정과 중복됩니다/);
    assert.deepEqual(result.value, []);
  });

  test("accepts 20 academy schedules and rejects the 21st", () => {
  const maximumSchedules: YouthAcademyScheduleInput[] = Array.from(
      { length: youthAcademyScheduleMaxCount },
      (_, index) => ({
        academyName: `학원 ${index + 1}`,
        weekdays: [1],
        attendanceTime: "18:00",
      }),
    );
    const accepted = normalizeYouthAcademySchedules(maximumSchedules);
    const rejected = normalizeYouthAcademySchedules([
      ...maximumSchedules,
      {
        academyName: "한도 초과 학원",
        weekdays: [2],
        attendanceTime: "19:00",
      },
    ]);

    assert.equal(accepted.error, undefined);
    assert.equal(accepted.value.length, youthAcademyScheduleMaxCount);
    assert.equal(rejected.provided, true);
    assert.equal(
      rejected.error,
      `학원 일정은 최대 ${youthAcademyScheduleMaxCount}개까지 등록할 수 있습니다.`,
    );
    assert.deepEqual(rejected.value, []);
  });

  test("rejects more than seven raw weekday selections", () => {
    const result = normalizeUnknownAcademySchedules([
      {
        academyName: "새봄수학학원",
        weekdays: [0, 1, 2, 3, 4, 5, 6, 1],
        attendanceTime: "18:00",
      },
    ]);

    assert.equal(result.provided, true);
    assert.equal(
      result.error,
      "학원 일정 1번 요일은 최대 7개까지 선택할 수 있습니다.",
    );
    assert.deepEqual(result.value, []);
  });

  test("enforces academy-name and attendance-time boundaries", () => {
    const accepted = normalizeYouthAcademySchedules([
      {
        academyName: "가".repeat(youthAcademyNameMaxLength),
        weekdays: [0],
        attendanceTime: "00:00",
      },
      {
        academyName: "마감 학원",
        weekdays: [6],
        attendanceTime: "23:59",
      },
    ]);
    const rejected = normalizeYouthAcademySchedules([
      {
        academyName: "가".repeat(youthAcademyNameMaxLength + 1),
        weekdays: [1],
        attendanceTime: "18:00",
      },
    ]);

    assert.deepEqual(
      accepted.value.map((schedule) => schedule.attendanceMinute),
      [0, 1439],
    );
    assert.match(
      rejected.error ?? "",
      new RegExp(`${youthAcademyNameMaxLength}자 이하`),
    );
    assert.deepEqual(rejected.value, []);
  });

  test("rejects malformed runtime values without throwing", () => {
    const malformedValues: unknown[] = [
      "not-an-array",
      [null],
      [{ academyName: 1, weekdays: [1], attendanceTime: "18:00" }],
      [{ academyName: "학원", weekdays: "1", attendanceTime: "18:00" }],
      [{ academyName: "학원", weekdays: ["1"], attendanceTime: "18:00" }],
      [{ academyName: "학원", weekdays: [1], attendanceTime: 1800 }],
    ];

    for (const value of malformedValues) {
      const result = normalizeUnknownAcademySchedules(value);

      assert.equal(result.provided, true);
      assert.match(result.error ?? "", /형식이 올바르지 않|요일을 다시 선택/);
      assert.deepEqual(result.value, []);
    }
  });
});

describe("youth school grade labels", () => {
  test("calculates middle and high school grades from birth year", () => {
    assert.equal(
      formatYouthSchoolGradeLabel(
        { age: null, birthDate: "2013-06-10" },
        "2026-06-22",
      ),
      "중1",
    );
    assert.equal(
      formatYouthSchoolGradeLabel(
        { age: null, birthDate: "2009-06-10" },
        "2026-06-22",
      ),
      "고2",
    );
  });

  test("falls back to stored age when birth date is missing", () => {
    assert.equal(
      formatYouthSchoolGradeLabel(
        { age: 17, birthDate: null },
        "2026-06-22",
      ),
      "고2",
    );
  });
});
