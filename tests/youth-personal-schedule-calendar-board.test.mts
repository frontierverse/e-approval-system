import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTitle } from "../src/components/page-title.tsx";
import {
  createPersonalScheduleEndMinuteOptions,
  createPersonalScheduleEditDraft,
  createPersonalScheduleStartMinuteOptions,
  createPersonalScheduleTypeChangeDraft,
  confirmPersonalScheduleTypeChange,
  formatPersonalScheduleCalendarLabel,
  formatPersonalScheduleStaffOption,
  formatPersonalScheduleTime,
  formatPersonalScheduleTimeRange,
  getPersonalScheduleDraftError,
  isPersonalScheduleStaffEmployedOnDate,
  occursOnPersonalScheduleDate,
  shouldConfirmPersonalScheduleTypeChange,
  YouthPersonalScheduleCalendarBoard,
  YouthPersonalScheduleCalendarSkeleton,
  YouthPersonalScheduleStudentSelect,
} from "../src/components/youth-personal-schedule-calendar-board.tsx";
import type { YouthPersonalScheduleInput } from "../src/lib/youth-personal-schedule-core.ts";
import type { YouthPersonalSchedule } from "../src/lib/youth-personal-schedules.ts";

const componentSource = readFileSync(
  new URL(
    "../src/components/youth-personal-schedule-calendar-board.tsx",
    import.meta.url,
  ),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/app/youth/personal-schedule/page.tsx", import.meta.url),
  "utf8",
);

const youths = [
  { id: "youth-001", name: "김하늘" },
  { id: "youth-002", name: "최예담" },
];

const schedules: YouthPersonalSchedule[] = [
  {
    id: "schedule-dates",
    youthId: "youth-001",
    content: "병원 진료 예약",
    scheduleType: "HOSPITAL",
    hospitalName: "한빛병원",
    escortType: "STAFF",
    escortUserId: "staff-001",
    escortName: "김민준",
    nextAppointmentDate: "2026-06-24",
    startMinute: 0,
    endMinute: 70,
    selectionMode: "DATES",
    occurrenceDates: ["2026-06-10"],
    recurrenceWeekdays: [],
    recurrenceStartDate: null,
    recurrenceEndDate: null,
  },
  {
    id: "schedule-weekdays",
    youthId: "youth-001",
    content: "저녁 영어 학원",
    scheduleType: "GENERAL",
    hospitalName: null,
    escortType: null,
    escortUserId: null,
    escortName: null,
    nextAppointmentDate: null,
    startMinute: 18 * 60,
    endMinute: 24 * 60,
    selectionMode: "WEEKDAYS",
    occurrenceDates: ["2026-06-15", "2026-06-17"],
    recurrenceWeekdays: [1, 3],
    recurrenceStartDate: "2026-06-01",
    recurrenceEndDate: "2026-06-30",
  },
];

const defaultInput: YouthPersonalScheduleInput = {
  content: "영어 학원",
  startMinute: 540,
  endMinute: 600,
  selectionMode: "DATES",
  occurrenceDates: ["2026-06-10"],
  recurrenceWeekdays: [],
  recurrenceStartDate: "",
  recurrenceEndDate: "",
};

const staffDirectory = [
  {
    id: "staff-001",
    name: "김민준",
    departmentName: "생활지원팀",
    positionName: "생활지도원",
    hireDate: "2026-01-01",
    resignationDate: null,
  },
  {
    id: "staff-002",
    name: "이서연",
    departmentName: "상담팀",
    positionName: "상담원",
    hireDate: "2026-06-10",
    resignationDate: "2026-06-24",
  },
];

function mapInputToSchedule(
  id: string,
  youthId: string,
  input: YouthPersonalScheduleInput,
): YouthPersonalSchedule {
  const scheduleType = input.scheduleType ?? "GENERAL";
  const escortType = scheduleType === "HOSPITAL" ? input.escortType || null : null;

  return {
    id,
    youthId,
    content: scheduleType === "HOSPITAL" ? "병원 진료 예약" : input.content,
    scheduleType,
    hospitalName:
      scheduleType === "HOSPITAL" ? input.hospitalName?.trim() || null : null,
    escortType,
    escortUserId:
      escortType === "STAFF" ? input.escortUserId?.trim() || null : null,
    escortName:
      escortType === "OTHER"
        ? input.escortOtherName?.trim() || null
        : escortType === "STAFF"
          ? staffDirectory.find((staff) => staff.id === input.escortUserId)?.name ??
            null
          : null,
    nextAppointmentDate:
      scheduleType === "HOSPITAL"
        ? input.nextAppointmentDate?.trim() || null
        : null,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    selectionMode: input.selectionMode,
    occurrenceDates: [...input.occurrenceDates],
    recurrenceWeekdays: input.recurrenceWeekdays.filter(
      (weekday): weekday is 0 | 1 | 2 | 3 | 4 | 5 | 6 =>
        Number.isInteger(weekday) && weekday >= 0 && weekday <= 6,
    ),
    recurrenceStartDate: input.recurrenceStartDate || null,
    recurrenceEndDate: input.recurrenceEndDate || null,
  };
}

function createBoard(canManage = true) {
  return React.createElement(YouthPersonalScheduleCalendarBoard, {
    canManage,
    createSchedule: async (youthId, input) => ({
      ok: true as const,
      data: {
        schedule: mapInputToSchedule("created-schedule", youthId, input),
      },
    }),
    deleteSchedule: async (scheduleId) => ({
      ok: true as const,
      data: { scheduleId },
    }),
    schedules,
    selectedMonth: "2026-06",
    selectedYouthId: "youth-001",
    staffDirectory,
    updateSchedule: async (scheduleId, input) => ({
      ok: true as const,
      data: {
        schedule: mapInputToSchedule(scheduleId, "youth-001", input),
      },
    }),
    youths,
  });
}

describe("youth personal schedule calendar board", () => {
  test("renders a responsive 42-day month calendar without a fixed-width grid", () => {
    const html = renderToStaticMarkup(createBoard());

    assert.match(html, /aria-label="김하늘 개인 일정표"/);
    assert.match(html, /2026년 6월/);
    assert.match(html, /김하늘/);
    assert.doesNotMatch(html, /개인 일정표 학생 선택/);
    assert.match(html, /grid-cols-7/);
    assert.match(html, /max-w-full/);
    assert.doesNotMatch(html, /min-w-\[(?:8|9)\d{2}px\]/);
    assert.doesNotMatch(html, /overflow-x-auto/);
    assert.match(html, /2026년 6월 10일 \(수\) 개인 일정 등록/);
    assert.match(
      html,
      /00:00-01:10 병원 · 한빛병원 · 인솔자 김민준 · 다음 예약 2026년 6월 24일 \(수\) 병원 진료 예약 수정/,
    );
    assert.match(html, />병원<\/span> · 한빛병원/);
    assert.match(html, /18:00-24:00 저녁 영어 학원 전체 일정 묶음 수정/);
    assert.doesNotMatch(html, /hidden truncate sm:block/);
    assert.match(
      html,
      /href="\/youth\/personal-schedule\?youthId=youth-001&amp;month=2026-05"/,
    );
    assert.match(
      html,
      /href="\/youth\/personal-schedule\?youthId=youth-001&amp;month=2026-07"/,
    );
  });

  test("places the student selector directly before the personal schedule title", () => {
    const studentSelect = React.createElement(
      YouthPersonalScheduleStudentSelect,
      {
        selectedMonth: "2026-06",
        selectedYouthId: "youth-001",
        youths,
      },
    );
    const html = renderToStaticMarkup(studentSelect);
    const titleHtml = renderToStaticMarkup(
      React.createElement(PageTitle, {
        title: "개인 일정표",
        titleAccessory: studentSelect,
      }),
    );

    assert.match(html, /aria-label="개인 일정표 학생 선택"/);
    assert.match(html, /h-11/);
    assert.match(html, /text-lg/);
    assert.match(html, /<option value="youth-001" selected="">김하늘<\/option>/);
    assert.match(html, /<option value="youth-002">최예담<\/option>/);
    assert.ok(
      titleHtml.indexOf('aria-label="개인 일정표 학생 선택"') <
        titleHtml.indexOf(">개인 일정표</h1>"),
    );
    assert.match(
      pageSource,
      /<PageTitle\s+title="개인 일정표"\s+titleAccessory=\{[\s\S]*?<YouthPersonalScheduleStudentSelect/,
    );

    const emptyHtml = renderToStaticMarkup(
      React.createElement(YouthPersonalScheduleStudentSelect, {
        selectedMonth: "2026-06",
        selectedYouthId: "",
        youths: [],
      }),
    );

    assert.match(emptyHtml, /재원 중인 학생 없음/);
    assert.match(emptyHtml, /disabled=""/);
  });

  test("keeps registration read-only while exposing every schedule as a detail button", () => {
    const html = renderToStaticMarkup(createBoard(false));

    assert.match(html, /조회 전용/);
    assert.match(html, /병원 · 한빛병원/);
    assert.doesNotMatch(html, /개인 일정 등록/);
    assert.doesNotMatch(html, /전체 일정 묶음 수정/);
    assert.match(
      html,
      /00:00-01:10 병원 · 한빛병원 · 인솔자 김민준 · 다음 예약 2026년 6월 24일 \(수\) 상세 보기/,
    );
    assert.match(html, /18:00-24:00 저녁 영어 학원 상세 보기/);
    assert.match(html, /<button[^>]+aria-label="[^"]+ 상세 보기"/);
    assert.match(html, /cursor-default/);
  });

  test("renders a calendar-shaped reduced-motion loading skeleton", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthPersonalScheduleCalendarSkeleton),
    );

    assert.match(html, /aria-label="개인 일정표 로딩"/);
    assert.match(html, /grid-cols-7/);
    assert.match(html, /motion-reduce:animate-none/);
    assert.doesNotMatch(html, /overflow-x-auto/);
    assert.equal((html.match(/sm:min-h-32/g) ?? []).length, 42);
  });

  test("offers the full day in ten-minute time increments", () => {
    const startOptions = createPersonalScheduleStartMinuteOptions();
    const endOptions = createPersonalScheduleEndMinuteOptions(1430);

    assert.equal(startOptions.length, 144);
    assert.equal(startOptions[0], 0);
    assert.equal(startOptions.at(-1), 1430);
    assert.equal(
      startOptions.every((minute, index) => minute === index * 10),
      true,
    );
    assert.deepEqual(endOptions, [1440]);
    assert.equal(createPersonalScheduleEndMinuteOptions(0).at(-1), 1440);
    assert.equal(formatPersonalScheduleTime(0), "00:00");
    assert.equal(formatPersonalScheduleTime(1440), "24:00");
    assert.equal(formatPersonalScheduleTimeRange(1430, 1440), "23:50-24:00");
  });

  test("filters staff by inclusive employment boundaries and formats compact labels", () => {
    assert.equal(
      isPersonalScheduleStaffEmployedOnDate(staffDirectory[1]!, "2026-06-10"),
      true,
    );
    assert.equal(
      isPersonalScheduleStaffEmployedOnDate(staffDirectory[1]!, "2026-06-24"),
      true,
    );
    assert.equal(
      isPersonalScheduleStaffEmployedOnDate(staffDirectory[1]!, "2026-06-09"),
      false,
    );
    assert.equal(
      isPersonalScheduleStaffEmployedOnDate(staffDirectory[1]!, "2026-06-25"),
      false,
    );
    assert.equal(
      formatPersonalScheduleStaffOption(staffDirectory[0]!),
      "김민준 · 생활지원팀 · 생활지도원",
    );
  });

  test("includes structured hospital details in the calendar accessible label", () => {
    assert.equal(
      formatPersonalScheduleCalendarLabel(schedules[0]!),
      "00:00-01:10 병원 · 한빛병원 · 인솔자 김민준 · 다음 예약 2026년 6월 24일 (수)",
    );
    assert.equal(
      formatPersonalScheduleCalendarLabel(schedules[1]!),
      "18:00-24:00 저녁 영어 학원",
    );
  });

  test("confines hospital conversion to the clicked occurrence without losing general content", () => {
    const generalDraft = createPersonalScheduleEditDraft(
      schedules[1]!,
      "2026-06-17",
    );
    const hospitalDraft = createPersonalScheduleTypeChangeDraft(
      generalDraft,
      "HOSPITAL",
      "2026-06",
    );

    assert.equal(hospitalDraft.scheduleType, "HOSPITAL");
    assert.equal(hospitalDraft.selectionMode, "DATES");
    assert.deepEqual(hospitalDraft.occurrenceDates, ["2026-06-17"]);
    assert.deepEqual(hospitalDraft.recurrenceWeekdays, []);
    assert.equal(hospitalDraft.recurrenceStartDate, "");
    assert.equal(hospitalDraft.recurrenceEndDate, "");
    assert.equal(hospitalDraft.content, "저녁 영어 학원");
    assert.equal(
      createPersonalScheduleTypeChangeDraft(
        hospitalDraft,
        "GENERAL",
        "2026-06",
      ).content,
      "저녁 영어 학원",
    );

    const newlyEditedDraft = {
      ...generalDraft,
      anchorDate: "2026-06-10",
      content: "수정한 일반 일정",
      generalContent: "수정한 일반 일정",
      occurrenceDates: ["2026-06-12"],
      scheduleId: undefined,
      selectionMode: "DATES" as const,
    };
    const newlyConvertedDraft = createPersonalScheduleTypeChangeDraft(
      newlyEditedDraft,
      "HOSPITAL",
      "2026-06",
    );

    assert.deepEqual(newlyConvertedDraft.occurrenceDates, ["2026-06-12"]);
    assert.equal(
      createPersonalScheduleTypeChangeDraft(
        newlyConvertedDraft,
        "GENERAL",
        "2026-06",
      ).content,
      "수정한 일반 일정",
    );
  });

  test("warns before a new multi-date or recurring draft is reduced to one hospital date", () => {
    const baseDraft = {
      ...createPersonalScheduleEditDraft(schedules[1]!, "2026-06-17"),
      scheduleId: undefined,
    };
    const multiDateDraft = {
      ...baseDraft,
      occurrenceDates: ["2026-06-12", "2026-06-19"],
      selectionMode: "DATES" as const,
    };
    const beforeCancel = JSON.stringify(multiDateDraft);
    let warning = "";

    assert.equal(
      shouldConfirmPersonalScheduleTypeChange(multiDateDraft, "HOSPITAL"),
      true,
    );
    assert.equal(
      confirmPersonalScheduleTypeChange(
        multiDateDraft,
        "HOSPITAL",
        (message) => {
          warning = message;
          return false;
        },
      ),
      false,
    );
    assert.match(warning, /현재 선택한 날짜만 남고/);
    assert.equal(JSON.stringify(multiDateDraft), beforeCancel);

    assert.equal(
      shouldConfirmPersonalScheduleTypeChange(
        {
          ...baseDraft,
          occurrenceDates: [],
          selectionMode: "WEEKDAYS",
        },
        "HOSPITAL",
      ),
      true,
    );

    let singleDatePrompted = false;
    assert.equal(
      confirmPersonalScheduleTypeChange(
        {
          ...baseDraft,
          occurrenceDates: ["2026-06-12"],
          selectionMode: "DATES",
        },
        "HOSPITAL",
        () => {
          singleDatePrompted = true;
          return false;
        },
      ),
      true,
    );
    assert.equal(singleDatePrompted, false);
  });

  test("keeps a detached staff snapshot but requires an explicit replacement", () => {
    const draft = createPersonalScheduleEditDraft(
      {
        ...schedules[0]!,
        escortUserId: null,
        escortName: "퇴사 직원",
      },
      "2026-06-10",
    );

    assert.equal(draft.escortType, "");
    assert.equal(draft.escortOtherName, "퇴사 직원");
    assert.equal(draft.escortDisplayName, "퇴사 직원");
    assert.equal(getPersonalScheduleDraftError(draft), "인솔자를 선택하세요.");
    assert.equal(
      createPersonalScheduleTypeChangeDraft(draft, "GENERAL", "2026-06")
        .content,
      "",
    );
  });

  test("uses generated occurrence dates as the only calendar authority", () => {
    assert.equal(
      occursOnPersonalScheduleDate(schedules[0]!, "2026-06-10"),
      true,
    );
    assert.equal(
      occursOnPersonalScheduleDate(schedules[0]!, "2026-06-11"),
      false,
    );
    assert.equal(
      occursOnPersonalScheduleDate(schedules[1]!, "2026-06-15"),
      true,
    );
    assert.equal(
      occursOnPersonalScheduleDate(schedules[1]!, "2026-06-16"),
      false,
    );
    assert.equal(
      occursOnPersonalScheduleDate(
        { ...schedules[1]!, occurrenceDates: [] },
        "2026-06-15",
      ),
      false,
    );
  });

  test("validates content, dates, weekday periods, and time order before saving", () => {
    assert.equal(getPersonalScheduleDraftError(defaultInput), null);
    assert.equal(
      getPersonalScheduleDraftError({ ...defaultInput, content: "" }),
      "일정 내용을 입력하세요.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...defaultInput,
        occurrenceDates: ["2026-06-10", "2026-06-10"],
      }),
      "같은 날짜를 중복해서 선택할 수 없습니다.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...defaultInput,
        endMinute: 540,
      }),
      "종료 시간은 시작 시간보다 늦게 선택하세요.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...defaultInput,
        selectionMode: "WEEKDAYS",
        occurrenceDates: [],
        recurrenceStartDate: "2026-06-30",
        recurrenceEndDate: "2026-06-01",
        recurrenceWeekdays: [1],
      }),
      "반복 종료일은 시작일과 같거나 늦게 선택하세요.",
    );

    const hospitalInput: YouthPersonalScheduleInput = {
      ...defaultInput,
      content: "",
      escortOtherName: "",
      escortType: "STAFF",
      escortUserId: "staff-001",
      hospitalName: "한빛병원",
      nextAppointmentDate: "2026-06-24",
      scheduleType: "HOSPITAL",
    };

    assert.equal(getPersonalScheduleDraftError(hospitalInput), null);
    assert.equal(
      getPersonalScheduleDraftError({ ...hospitalInput, hospitalName: "" }),
      "병원명을 입력하세요.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...hospitalInput,
        occurrenceDates: ["2026-06-10", "2026-06-11"],
      }),
      "병원 진료 예약 날짜를 하나 선택하세요.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...hospitalInput,
        escortType: "OTHER",
        escortUserId: "",
      }),
      "기타 인솔자 이름을 입력하세요.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...hospitalInput,
        nextAppointmentDate: "2026-06-10",
      }),
      "다음 예약일은 진료 예약일보다 늦어야 합니다.",
    );
    assert.equal(
      getPersonalScheduleDraftError(
        {
          ...hospitalInput,
          escortUserId: "staff-002",
          nextAppointmentDate: "",
          occurrenceDates: ["2026-06-25"],
        },
        staffDirectory,
      ),
      "선택한 직원은 진료일에 재직 중이 아닙니다. 인솔자를 다시 선택하세요.",
    );
  });

  test("keeps modal safety and accessible date-entry contracts in source", () => {
    assert.match(componentSource, /<AppModal[\s\S]*?mobileFullscreen/);
    assert.match(componentSource, /labelledBy="youth-personal-schedule-modal-title"/);
    assert.match(componentSource, /describedBy="youth-personal-schedule-modal-description"/);
    assert.match(componentSource, /role="alert"[\s\S]*?tabIndex=\{-1\}/);
    assert.match(componentSource, /errorRef\.current\?\.focus/);
    assert.match(
      componentSource,
      /data-modal-initial-focus=\{canManage \? true : undefined\}/,
    );
    assert.match(componentSource, /<DatePickerInput[\s\S]*?적용 날짜/);
    assert.match(componentSource, /날짜 추가/);
    assert.match(componentSource, /반복 시작일/);
    assert.match(componentSource, /반복 종료일/);
    assert.match(componentSource, /grid-cols-4[\s\S]*?sm:grid-cols-7/);
    assert.match(componentSource, /window\.confirm\(/);
    assert.match(componentSource, /삭제한 일정은 복구할 수 없습니다/);
    assert.match(componentSource, /if \(!draft \|\| isPending/);
    assert.match(componentSource, /disabled=\{isFormDisabled\}/);
    assert.match(componentSource, /maxLength=\{personalScheduleContentMaxLength\}/);
    assert.match(componentSource, /await updateSchedule\(draft\.scheduleId, input\)/);
    assert.match(componentSource, /await createSchedule\(selectedYouthId, input\)/);
    assert.match(componentSource, /일정 종류/);
    assert.match(componentSource, /일반 일정/);
    assert.match(componentSource, /병원 진료 예약/);
    assert.match(componentSource, /aria-label="병원명"/);
    assert.match(componentSource, /aria-label="병원 진료일"/);
    assert.match(componentSource, /formatWorkScheduleDateLabel\(appointmentDate\)/);
    assert.match(componentSource, /aria-label="병원 인솔자 선택"/);
    assert.match(componentSource, /기타 \(직접 입력\)/);
    assert.match(componentSource, /aria-label="기타 인솔자 이름"/);
    assert.match(componentSource, /aria-label="다음 병원 예약일"/);
    assert.match(componentSource, /shiftWorkScheduleDate\(appointmentDate, 1\)/);
    assert.match(componentSource, /isPersonalScheduleStaffEmployedOnDate/);
    assert.match(componentSource, /진료일 재직 아님 · 다시 선택/);
    assert.match(
      componentSource,
      /<option disabled value=\{selectedEscortFallback\.id\}>/,
    );
    assert.match(
      componentSource,
      /기존 직원 인솔자 \{detachedStaffEscortName\}의 계정이 없어/,
    );
    assert.match(
      componentSource,
      /입력한 변경사항이 저장되지 않았습니다\. 일정을 닫으시겠습니까\?/,
    );
    assert.match(
      componentSource,
      /병원 진료 예약으로 변경하면 현재 선택한 날짜만 남고 반복 또는 다른 날짜는 제거됩니다/,
    );
    assert.match(
      componentSource,
      /일반 일정으로 변경해 저장하면 병원, 인솔자, 다음 예약 정보가 제거됩니다/,
    );
    assert.match(componentSource, /setIsDirty\(false\)[\s\S]*?setDraft\(null\)/);
    assert.match(componentSource, /otherEscortNameRef\.current\?\.focus/);
    assert.match(componentSource, /: "상세 보기"/);
    assert.match(componentSource, /병원 진료 예약 상세/);
    assert.match(componentSource, /등록된 개인 일정 정보를 확인합니다/);
    assert.match(
      componentSource,
      /const selectedEscortFallback =\s+canManage &&/,
    );
    assert.match(
      componentSource,
      /\{canManage && detachedStaffEscortName \? \(/,
    );
    assert.match(componentSource, /등록 당시 저장된 인솔자 정보입니다/);
    assert.match(componentSource, /"기록된 기타 인솔자"/);
    assert.match(componentSource, /"기록된 직원 인솔자"/);
    assert.match(componentSource, /· \{draft\.escortDisplayName\}/);
    assert.match(
      componentSource,
      /\{canManage \? \(\s*<button[\s\S]*?aria-label=\{`적용 날짜 \$\{index \+ 1\} 삭제`\}/,
    );
    assert.match(
      componentSource,
      /\{canManage \? \(\s*<button[\s\S]*?onClick=\{addOccurrenceDate\}/,
    );
    assert.match(
      componentSource,
      /data-modal-initial-focus[\s\S]*?onClick=\{closeModal\}[\s\S]*?>\s*닫기/,
    );
    const editHandlerSource = componentSource.slice(
      componentSource.indexOf("function openEditModal"),
      componentSource.indexOf("function closeModal"),
    );
    assert.match(editHandlerSource, /if \(isPending\)/);
    assert.doesNotMatch(editHandlerSource, /!canManage/);
    assert.doesNotMatch(componentSource, /sm:size-9/);
    assert.match(componentSource, /날짜를 여러 개 선택하거나 기간·요일 반복/);
    assert.match(componentSource, /수정 내용은 이 일정에 포함된 날짜 전체/);
  });
});
