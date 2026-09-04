import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createHospitalAppointmentWorkSchedules } from "../src/lib/work-schedule-hospital-appointments.ts";

const workSchedulesSource = readFileSync(
  new URL("../src/lib/work-schedules.ts", import.meta.url),
  "utf8",
);
const personalScheduleActionsSource = readFileSync(
  new URL("../src/app/youth/personal-schedule/actions.ts", import.meta.url),
  "utf8",
);
const workSchedulePageSource = readFileSync(
  new URL("../src/app/work-schedule/page.tsx", import.meta.url),
  "utf8",
);
const workSchedulePrintRouteSource = readFileSync(
  new URL("../src/app/work-schedule/print/route.ts", import.meta.url),
  "utf8",
);
const youthActionsSource = readFileSync(
  new URL("../src/app/youth/actions.ts", import.meta.url),
  "utf8",
);

describe("hospital appointment work schedule integration", () => {
  test("maps current hospital appointments into read-only work schedules", () => {
    const schedules = createHospitalAppointmentWorkSchedules(
      [
        createAppointment({
          escortName: "  김 담당  ",
          hospitalName: " 익산 마음 병원 ",
          id: "staff-visit",
          occurrenceDates: ["2026-09-09"],
          youth: { dischargeDate: null, name: " 홍 길동 " },
        }),
        createAppointment({
          escortName: "보호자 이 씨",
          hospitalName: "서울 병원",
          id: "other-visit",
          occurrenceDates: ["2026-09-10"],
          startMinute: 14 * 60,
          endMinute: 15 * 60 + 10,
          youth: { dischargeDate: "2026-09-10", name: "김학생" },
        }),
      ],
      ["2026-09-09", "2026-09-10"],
    );

    assert.deepEqual(schedules, [
      {
        id: "hospital-appointment:staff-visit",
        scheduleDate: "2026-09-09",
        weekday: 3,
        startHour: 9,
        startMinute: 570,
        endHour: 11,
        endMinute: 630,
        content: "홍 길동 병원 진료",
        detailLabel: "익산 마음 병원 · 인솔자 김 담당",
        readOnly: true,
        sourceType: "hospitalAppointment",
        timeLabel: "오전 9시 30분 - 오전 10시 30분",
      },
      {
        id: "hospital-appointment:other-visit",
        scheduleDate: "2026-09-10",
        weekday: 4,
        startHour: 14,
        startMinute: 840,
        endHour: 16,
        endMinute: 910,
        content: "김학생 병원 진료",
        detailLabel: "서울 병원 · 인솔자 보호자 이 씨",
        readOnly: true,
        sourceType: "hospitalAppointment",
        timeLabel: "오후 2시 - 오후 3시 10분",
      },
    ]);
  });

  test("skips appointments outside the month, after discharge, or missing safe display data", () => {
    const schedules = createHospitalAppointmentWorkSchedules(
      [
        createAppointment({
          id: "outside-month",
          occurrenceDates: ["2026-10-01"],
        }),
        createAppointment({
          id: "after-discharge",
          occurrenceDates: ["2026-09-11"],
          youth: { dischargeDate: "2026-09-10", name: "퇴소학생" },
        }),
        createAppointment({
          hospitalName: " ",
          id: "missing-hospital",
          occurrenceDates: ["2026-09-12"],
        }),
      ],
      ["2026-09-11", "2026-09-12"],
    );

    assert.deepEqual(schedules, []);
  });

  test("queries only real hospital occurrences and does not create a next-date phantom", () => {
    assert.match(
      workSchedulesSource,
      /prisma\.youthPersonalSchedule\.findMany\([\s\S]*?scheduleType:\s*"HOSPITAL"/,
    );
    assert.match(workSchedulesSource, /hasSome:\s*appointmentDates/);
    assert.match(
      workSchedulesSource,
      /createHospitalAppointmentWorkSchedules\(\s*hospitalAppointmentRecords,\s*appointmentDates/,
    );
    assert.match(
      workSchedulesSource,
      /sourceType\?:\s*"approvedVacation"\s*\|\s*"hospitalAppointment"\s*\|\s*"manual"/,
    );

    const selectStart = workSchedulesSource.indexOf(
      "export const workScheduleHospitalAppointmentSelect",
    );
    const selectEnd = workSchedulesSource.indexOf(
      "export async function getWorkScheduleChangeLogs",
      selectStart,
    );
    const selectSource = workSchedulesSource.slice(selectStart, selectEnd);

    assert.ok(selectStart >= 0 && selectEnd > selectStart);
    assert.match(selectSource, /hospitalName:\s*true/);
    assert.match(selectSource, /escortName:\s*true/);
    assert.doesNotMatch(selectSource, /nextAppointmentDate/);
    assert.match(
      workSchedulePrintRouteSource,
      /schedule\.sourceType !== "hospitalAppointment"/,
    );
  });

  test("revalidates every personal-schedule consumer after mutations", () => {
    assert.match(
      personalScheduleActionsSource,
      /const workSchedulePath = "\/work-schedule"/,
    );
    assert.match(
      personalScheduleActionsSource,
      /const workLogPath = "\/work-schedule\/work-log"/,
    );
    assert.equal(
      (
        personalScheduleActionsSource.match(
          /revalidatePersonalScheduleConsumers\(\);/g,
        ) ?? []
      ).length,
      3,
    );
    assert.match(
      personalScheduleActionsSource,
      /function revalidatePersonalScheduleConsumers\(\)\s*\{[\s\S]*?revalidatePath\(youthPersonalSchedulePath\);[\s\S]*?revalidatePath\(workSchedulePath\);[\s\S]*?revalidatePath\(workLogPath\);/,
    );
    assert.match(workSchedulePageSource, /병원 진료 예약을 한 달력에서 확인/);
    assert.match(
      youthActionsSource,
      /function revalidateYouthPaths\(\)\s*\{[\s\S]*?revalidatePath\("\/work-schedule"\);[\s\S]*?revalidatePath\("\/work-schedule\/work-log"\);/,
    );
  });
});

function createAppointment(
  overrides: Partial<Parameters<typeof createHospitalAppointmentWorkSchedules>[0][number]> = {},
): Parameters<typeof createHospitalAppointmentWorkSchedules>[0][number] {
  return {
    id: "appointment",
    endMinute: 630,
    escortName: "김담당",
    hospitalName: "익산병원",
    occurrenceDates: ["2026-09-09"],
    startMinute: 570,
    youth: {
      dischargeDate: null,
      name: "홍길동",
    },
    ...overrides,
  };
}
