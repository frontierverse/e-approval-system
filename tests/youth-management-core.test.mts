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

const validAcademyPeriod = {
  startDate: "2026-09-01",
  endDate: "2027-02-28",
} as const;

describe("youth academy schedule normalization", () => {
  test("normalizes academy names, weekday order, times, and attendance period", () => {
    assert.deepEqual(
      normalizeYouthAcademySchedules([
        {
          academyName: "  새봄수학학원  ",
          weekdays: [5, 1, 3, 1],
          attendanceTime: " 18:05 ",
          endTime: " 19:35 ",
          startDate: " 2026-09-01 ",
          endDate: " 2027-02-28 ",
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
            endTime: "19:35",
            endMinute: 1175,
            startDate: "2026-09-01",
            endDate: "2027-02-28",
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
          endTime: " ",
          startDate: " ",
          endDate: " ",
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
        input: [
          {
            academyName: "",
            weekdays: [1],
            attendanceTime: "18:00",
            endTime: "19:00",
            ...validAcademyPeriod,
          },
        ],
        error: /1번 학원명을 입력하세요/,
      },
      {
        input: [
          {
            academyName: "새봄수학학원",
            weekdays: [],
            attendanceTime: "18:00",
            endTime: "19:00",
            ...validAcademyPeriod,
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
            endTime: "19:00",
            ...validAcademyPeriod,
          },
        ],
        error: /1번 등원 시간은 HH:mm 형식으로 입력하세요/,
      },
      {
        input: [
          {
            academyName: "새봄수학학원",
            weekdays: [1],
            attendanceTime: "18:00",
            endTime: "",
            ...validAcademyPeriod,
          },
        ],
        error: /1번 마치는 시간은 HH:mm 형식으로 입력하세요/,
      },
      {
        input: [
          {
            academyName: "새봄수학학원",
            weekdays: [1],
            attendanceTime: "18:00",
            endTime: "19:00",
            startDate: "",
            endDate: "2027-02-28",
          },
        ],
        error: /1번 시작.*YYYY-MM-DD/,
      },
      {
        input: [
          {
            academyName: "새봄수학학원",
            weekdays: [1],
            attendanceTime: "18:00",
            endTime: "19:00",
            startDate: "2026-09-01",
            endDate: "",
          },
        ],
        error: /1번 종료.*YYYY-MM-DD/,
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
        endTime: "19:00",
        ...validAcademyPeriod,
      },
    ]);
    const invalidTime = normalizeYouthAcademySchedules([
      {
        academyName: "새봄수학학원",
        weekdays: [1],
        attendanceTime: "24:00",
        endTime: "19:00",
        ...validAcademyPeriod,
      },
    ]);
    const invalidEndTime = normalizeYouthAcademySchedules([
      {
        academyName: "새봄수학학원",
        weekdays: [1],
        attendanceTime: "18:00",
        endTime: "24:00",
        ...validAcademyPeriod,
      },
    ]);

    assert.match(invalidWeekday.error ?? "", /요일을 다시 선택하세요/);
    assert.deepEqual(invalidWeekday.value, []);
    assert.match(invalidTime.error ?? "", /HH:mm 형식/);
    assert.deepEqual(invalidTime.value, []);
    assert.match(invalidEndTime.error ?? "", /마치는 시간.*HH:mm 형식/);
    assert.deepEqual(invalidEndTime.value, []);
  });

  test("accepts evening academy attendance times", () => {
    assert.deepEqual(
      normalizeYouthAcademySchedules([
        {
          academyName: "푸른영어학원",
          weekdays: [2, 4],
          attendanceTime: "20:30",
          endTime: "22:00",
          ...validAcademyPeriod,
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
            endTime: "22:00",
            endMinute: 1320,
            ...validAcademyPeriod,
          },
        ],
      },
    );
  });

  test("keeps the existing slot identity when end times and periods differ", () => {
    const result = normalizeYouthAcademySchedules([
      {
        academyName: "새봄수학학원",
        weekdays: [1, 3, 1],
        attendanceTime: "18:30",
        endTime: "19:30",
        ...validAcademyPeriod,
      },
      {
        academyName: " 새봄수학학원 ",
        weekdays: [3, 1],
        attendanceTime: " 18:30 ",
        endTime: " 20:00 ",
        startDate: "2027-03-01",
        endDate: "2027-08-31",
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
        endTime: "19:00",
        ...validAcademyPeriod,
      }),
    );
    const accepted = normalizeYouthAcademySchedules(maximumSchedules);
    const rejected = normalizeYouthAcademySchedules([
      ...maximumSchedules,
      {
        academyName: "한도 초과 학원",
        weekdays: [2],
        attendanceTime: "19:00",
        endTime: "20:00",
        ...validAcademyPeriod,
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
        endTime: "19:00",
        ...validAcademyPeriod,
      },
    ]);

    assert.equal(result.provided, true);
    assert.equal(
      result.error,
      "학원 일정 1번 요일은 최대 7개까지 선택할 수 있습니다.",
    );
    assert.deepEqual(result.value, []);
  });

  test("enforces academy-name and academy-time boundaries", () => {
    const accepted = normalizeYouthAcademySchedules([
      {
        academyName: "가".repeat(youthAcademyNameMaxLength),
        weekdays: [0],
        attendanceTime: "00:00",
        endTime: "00:01",
        ...validAcademyPeriod,
      },
      {
        academyName: "마감 학원",
        weekdays: [6],
        attendanceTime: "23:58",
        endTime: "23:59",
        ...validAcademyPeriod,
      },
    ]);
    const rejected = normalizeYouthAcademySchedules([
      {
        academyName: "가".repeat(youthAcademyNameMaxLength + 1),
        weekdays: [1],
        attendanceTime: "18:00",
        endTime: "19:00",
        ...validAcademyPeriod,
      },
    ]);

    assert.deepEqual(
      accepted.value.map((schedule) => schedule.attendanceMinute),
      [0, 1438],
    );
    assert.deepEqual(
      accepted.value.map((schedule) => schedule.endMinute),
      [1, 1439],
    );
    assert.match(
      rejected.error ?? "",
      new RegExp(`${youthAcademyNameMaxLength}자 이하`),
    );
    assert.deepEqual(rejected.value, []);
  });

  test("requires the academy end time to be later than attendance", () => {
    for (const [attendanceTime, endTime] of [
      ["18:00", "18:00"],
      ["18:01", "18:00"],
    ] as const) {
      const result = normalizeYouthAcademySchedules([
        {
          academyName: "새봄수학학원",
          weekdays: [1],
          attendanceTime,
          endTime,
          ...validAcademyPeriod,
        },
      ]);

      assert.match(result.error ?? "", /마치는 시간.*등원 시간보다 늦/);
      assert.deepEqual(result.value, []);
    }
  });

  test("strictly validates academy attendance periods and allows a same-day period", () => {
    const accepted = normalizeYouthAcademySchedules([
      {
        academyName: "윤년 학원",
        weekdays: [1],
        attendanceTime: "18:00",
        endTime: "19:00",
        startDate: "2028-02-29",
        endDate: "2028-02-29",
      },
      {
        academyName: "장기 학원",
        weekdays: [2],
        attendanceTime: "19:00",
        endTime: "20:00",
        startDate: "2026-09-01",
        endDate: "2027-08-31",
      },
    ]);

    assert.equal(accepted.error, undefined);
    assert.deepEqual(
      accepted.value.map(({ startDate, endDate }) => ({ startDate, endDate })),
      [
        { startDate: "2028-02-29", endDate: "2028-02-29" },
        { startDate: "2026-09-01", endDate: "2027-08-31" },
      ],
    );

    for (const [field, date] of [
      ["startDate", "2027-02-29"],
      ["endDate", "2026-04-31"],
    ] as const) {
      const result = normalizeYouthAcademySchedules([
        {
          academyName: "날짜 검증 학원",
          weekdays: [3],
          attendanceTime: "18:00",
          endTime: "19:00",
          ...validAcademyPeriod,
          [field]: date,
        },
      ]);

      assert.match(result.error ?? "", /(?:시작|종료).*YYYY-MM-DD/);
      assert.deepEqual(result.value, []);
    }

    const reversed = normalizeYouthAcademySchedules([
      {
        academyName: "기간 역전 학원",
        weekdays: [4],
        attendanceTime: "18:00",
        endTime: "19:00",
        startDate: "2026-09-02",
        endDate: "2026-09-01",
      },
    ]);

    assert.match(reversed.error ?? "", /종료.*시작.*같거나.*늦/);
    assert.deepEqual(reversed.value, []);
  });

  test("rejects malformed runtime values without throwing", () => {
    const malformedValues: unknown[] = [
      "not-an-array",
      [null],
      [
        {
          academyName: 1,
          weekdays: [1],
          attendanceTime: "18:00",
          endTime: "19:00",
          ...validAcademyPeriod,
        },
      ],
      [
        {
          academyName: "학원",
          weekdays: "1",
          attendanceTime: "18:00",
          endTime: "19:00",
          ...validAcademyPeriod,
        },
      ],
      [
        {
          academyName: "학원",
          weekdays: ["1"],
          attendanceTime: "18:00",
          endTime: "19:00",
          ...validAcademyPeriod,
        },
      ],
      [
        {
          academyName: "학원",
          weekdays: [1],
          attendanceTime: 1800,
          endTime: "19:00",
          ...validAcademyPeriod,
        },
      ],
      [
        {
          academyName: "학원",
          weekdays: [1],
          attendanceTime: "18:00",
          endTime: 1900,
          ...validAcademyPeriod,
        },
      ],
      [
        {
          academyName: "학원",
          weekdays: [1],
          attendanceTime: "18:00",
          endTime: "19:00",
          startDate: 20260901,
          endDate: "2027-02-28",
        },
      ],
      [
        {
          academyName: "학원",
          weekdays: [1],
          attendanceTime: "18:00",
          endTime: "19:00",
          startDate: "2026-09-01",
          endDate: 20270228,
        },
      ],
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
