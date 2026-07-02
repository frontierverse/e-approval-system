import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatStaffLeaveDays,
  getAnnualLeaveGrantDays,
  getLegacyVacationLeaveDeductionFromContent,
  getStaffLeaveAccrualEntries,
  getVacationLeaveDeduction,
  getVacationLeaveUsage,
} from "../src/lib/staff-leave-core.ts";

describe("staff leave core", () => {
  test("creates monthly and annual accrual entries without duplicates", () => {
    const entries = getStaffLeaveAccrualEntries({
      existingSourceKeys: ["leave:monthly:2026-02-10"],
      hireDate: "2026-01-10",
      today: "2027-01-10",
    });

    assert.equal(entries.length, 11);
    assert.equal(entries[0].sourceKey, "leave:monthly:2026-03-10");
    assert.equal(entries[0].amountHalfDays, 2);
    assert.equal(entries.at(-1)?.sourceKey, "leave:annual:2027-01-10");
    assert.equal(entries.at(-1)?.amountHalfDays, 30);
  });

  test("adds long-service annual leave days from the third completed year", () => {
    assert.equal(getAnnualLeaveGrantDays(1), 15);
    assert.equal(getAnnualLeaveGrantDays(2), 15);
    assert.equal(getAnnualLeaveGrantDays(3), 16);
    assert.equal(getAnnualLeaveGrantDays(5), 17);
    assert.equal(getAnnualLeaveGrantDays(25), 25);
  });

  test("creates vacation deductions for annual leave and half days", () => {
    const annual = getVacationLeaveDeduction({
      vacationType: "annual",
      startDate: "2026-06-22",
      endDate: "2026-06-24",
    });
    const halfDay = getVacationLeaveDeduction({
      vacationType: "half_day",
      halfDayDate: "2026-06-22",
      halfDayPeriod: "afternoon",
    });

    assert.deepEqual(annual, {
      amountHalfDays: -6,
      eventDate: "2026-06-22",
      leaveType: "annual",
      reason: "연차 2026-06-22~2026-06-24",
    });
    assert.deepEqual(halfDay, {
      amountHalfDays: -1,
      eventDate: "2026-06-22",
      leaveType: "half_day",
      reason: "오후 반차 2026-06-22",
    });
  });

  test("creates non-deducting usage records for other vacation types", () => {
    const sick = getVacationLeaveUsage({
      vacationType: "sick",
      startDate: "2026-07-02",
      endDate: "2026-07-03",
    });

    assert.deepEqual(sick, {
      amountHalfDays: 0,
      endDate: "2026-07-03",
      eventDate: "2026-07-02",
      leaveType: "sick",
      reason: "병가 2026-07-02~2026-07-03",
      startDate: "2026-07-02",
      vacationLabel: "병가",
    });
    assert.equal(
      getVacationLeaveDeduction({
        vacationType: "sick",
        startDate: "2026-07-02",
        endDate: "2026-07-03",
      }),
      null,
    );
  });

  test("creates half-day deductions from legacy vacation request content", () => {
    const deduction = getLegacyVacationLeaveDeductionFromContent(
      [
        "휴가 신청서",
        "1. 신청자 : 심태호",
        "2. 휴가 일시 및 종류 : 2026년 6월 19일 금요일 오후 반차",
        "3. 휴가 사유 : 개인 일정",
      ].join("\n"),
    );

    assert.deepEqual(deduction, {
      amountHalfDays: -1,
      eventDate: "2026-06-19",
      leaveType: "half_day",
      reason: "오후 반차 2026-06-19",
    });
  });

  test("creates annual deductions from legacy vacation request content", () => {
    const deduction = getLegacyVacationLeaveDeductionFromContent(
      "연차 사용 기간: 2026년 6월 22일 ~ 2026년 6월 24일",
    );

    assert.deepEqual(deduction, {
      amountHalfDays: -6,
      eventDate: "2026-06-22",
      leaveType: "annual",
      reason: "연차 2026-06-22~2026-06-24",
    });
  });

  test("formats half-day balances", () => {
    assert.equal(formatStaffLeaveDays(25), "12.5");
    assert.equal(formatStaffLeaveDays(30), "15");
  });
});
