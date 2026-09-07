import {
  youthLearningScheduleMinuteStep,
  youthLearningScheduleStartHour,
} from "@/lib/youth-management-core";

export const youthCommonScheduleEndHour = 22;

export function getYouthCommonScheduleEndMinute() {
  return youthCommonScheduleEndHour * 60;
}

export function isYouthCommonScheduleStartMinute(value: number) {
  return (
    Number.isInteger(value) &&
    value >= youthLearningScheduleStartHour * 60 &&
    value < getYouthCommonScheduleEndMinute() &&
    value % youthLearningScheduleMinuteStep === 0
  );
}

export function isYouthCommonScheduleEndMinute(value: number, startMinute: number) {
  return (
    isYouthCommonScheduleStartMinute(startMinute) &&
    Number.isInteger(value) &&
    value > startMinute &&
    value <= getYouthCommonScheduleEndMinute() &&
    value % youthLearningScheduleMinuteStep === 0
  );
}
