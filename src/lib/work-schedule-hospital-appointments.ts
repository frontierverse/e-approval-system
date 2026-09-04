import {
  getYouthLearningScheduleEndHourFromMinute,
  getYouthLearningScheduleStartHourFromMinute,
  getYouthLearningScheduleWeekday,
  isYouthLearningScheduleDate,
  type YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";

export type WorkScheduleHospitalAppointmentSource = {
  id: string;
  endMinute: number;
  escortName: string | null;
  hospitalName: string | null;
  occurrenceDates: string[];
  startMinute: number;
  youth: {
    dischargeDate: string | null;
    name: string;
  };
};

export type HospitalAppointmentWorkSchedule = {
  id: string;
  scheduleDate: string;
  weekday: YouthLearningScheduleWeekday;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
  detailLabel: string;
  readOnly: true;
  sourceType: "hospitalAppointment";
  timeLabel: string;
};

export function createHospitalAppointmentWorkSchedules(
  records: readonly WorkScheduleHospitalAppointmentSource[],
  includedDates: readonly string[],
): HospitalAppointmentWorkSchedule[] {
  const includedDateSet = new Set(
    includedDates.filter(isYouthLearningScheduleDate),
  );

  return records.flatMap((record) => {
    const scheduleDate = record.occurrenceDates.find((date) =>
      includedDateSet.has(date),
    );
    const youthName = normalizeWorkScheduleHospitalLabel(record.youth.name);
    const hospitalName = normalizeWorkScheduleHospitalLabel(
      record.hospitalName ?? "",
    );
    const escortName = normalizeWorkScheduleHospitalLabel(
      record.escortName ?? "",
    );
    const dischargeDate = record.youth.dischargeDate?.trim() ?? "";

    if (
      !scheduleDate ||
      !youthName ||
      !hospitalName ||
      !escortName ||
      (dischargeDate && dischargeDate < scheduleDate)
    ) {
      return [];
    }

    return [
      {
        id: `hospital-appointment:${record.id}`,
        scheduleDate,
        weekday: getYouthLearningScheduleWeekday(scheduleDate),
        startHour: getYouthLearningScheduleStartHourFromMinute(
          record.startMinute,
        ),
        startMinute: record.startMinute,
        endHour: getYouthLearningScheduleEndHourFromMinute(record.endMinute),
        endMinute: record.endMinute,
        content: `${youthName} 병원 진료`,
        detailLabel: `${hospitalName} · 인솔자 ${escortName}`,
        readOnly: true,
        sourceType: "hospitalAppointment" as const,
        timeLabel: formatWorkScheduleHospitalTimeRange(
          record.startMinute,
          record.endMinute,
        ),
      },
    ];
  });
}

function normalizeWorkScheduleHospitalLabel(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function formatWorkScheduleHospitalTimeRange(
  startMinute: number,
  endMinute: number,
) {
  return `${formatWorkScheduleHospitalMinute(startMinute)} - ${formatWorkScheduleHospitalMinute(endMinute)}`;
}

function formatWorkScheduleHospitalMinute(minute: number) {
  if (minute === 24 * 60) {
    return "24:00";
  }

  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour === 0 ? 12 : hour <= 12 ? hour : hour - 12;

  return minutePart === 0
    ? `${period} ${displayHour}시`
    : `${period} ${displayHour}시 ${minutePart}분`;
}
