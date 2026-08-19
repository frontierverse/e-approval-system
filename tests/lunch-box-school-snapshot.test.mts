import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createLunchBoxSchoolCountSnapshot } from "../src/lib/lunch-box-school-snapshot.ts";

const school = {
  active: true,
  id: "school-1",
  name: "테스트초",
  preservationClass: 1,
  type: "elementary",
};
const counts = [
  {
    class1Count: 22,
    class2Count: 20,
    class3Count: 21,
    class4Count: 0,
    date: "2026-08-24",
    deliveryDriverCount: 0,
    linkedCount: 19,
    preservationCount: 1,
  },
  {
    class1Count: 23,
    class2Count: 20,
    class3Count: 21,
    class4Count: 0,
    date: "2026-08-21",
    deliveryDriverCount: 0,
    linkedCount: 19,
    preservationCount: 1,
  },
];

describe("lunch-box school count snapshot", () => {
  test("is stable regardless of database result ordering", () => {
    assert.equal(
      createLunchBoxSchoolCountSnapshot({ counts, school }),
      createLunchBoxSchoolCountSnapshot({ counts: [...counts].reverse(), school }),
    );
  });

  test("changes when any displayed school metadata or dated quantity changes", () => {
    const baseline = createLunchBoxSchoolCountSnapshot({ counts, school });
    const changedInputs = [
      { school: { ...school, active: false }, counts },
      { school: { ...school, name: "변경초" }, counts },
      { school: { ...school, preservationClass: 2 }, counts },
      { school: { ...school, type: "kindergarten" }, counts },
      {
        school,
        counts: counts.map((count, index) =>
          index === 0 ? { ...count, class1Count: count.class1Count + 1 } : count,
        ),
      },
      {
        school,
        counts: counts.map((count, index) =>
          index === 0 ? { ...count, date: "2026-08-25" } : count,
        ),
      },
    ];

    for (const input of changedInputs) {
      assert.notEqual(
        createLunchBoxSchoolCountSnapshot(input),
        baseline,
      );
    }
  });
});
