import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createBirthdayAlertItems,
  createBirthdayTopbarAlert,
  getUpcomingBirthday,
  type BirthdayAlertPerson,
} from "../src/lib/birthday-alerts-core.ts";

const people: BirthdayAlertPerson[] = [
  {
    birthDate: "1990-06-25",
    detailLabel: "바자울 / 팀장",
    id: "staff-001",
    kind: "staff",
    name: "김민지",
  },
  {
    birthDate: "2009-07-26",
    detailLabel: "입소중 청소년",
    id: "youth-001",
    kind: "youth",
    name: "이하늘",
  },
  {
    birthDate: "1988-08-10",
    detailLabel: "법인 / 주임",
    id: "staff-002",
    kind: "staff",
    name: "박서준",
  },
];

describe("birthday alerts", () => {
  test("creates birthday alert items within thirty-one days", () => {
    const items = createBirthdayAlertItems(people, "2026-06-25");

    assert.equal(items.length, 2);
    assert.equal(items[0].name, "김민지");
    assert.equal(items[0].ddayLabel, "D-Day");
    assert.equal(items[0].birthdayDate, "2026-06-25");
    assert.equal(items[0].typeLabel, "직원");
    assert.equal(items[1].name, "이하늘");
    assert.equal(items[1].ddayLabel, "D-31");
    assert.equal(items[1].typeLabel, "입소중");
  });

  test("creates a topbar alert from the nearest birthday", () => {
    const alert = createBirthdayTopbarAlert(people, "2026-06-25");

    assert.equal(alert?.personName, "김민지");
    assert.equal(alert?.ddayLabel, "D-Day");
    assert.equal(alert?.items.length, 2);
  });

  test("calculates upcoming birthdays across year boundaries", () => {
    assert.deepEqual(getUpcomingBirthday("1990-01-05", "2026-12-31"), {
      birthdayDate: "2027-01-05",
      daysUntil: 5,
      ddayLabel: "D-5",
    });
    assert.equal(getUpcomingBirthday("not-a-date", "2026-12-31"), null);
  });
});
