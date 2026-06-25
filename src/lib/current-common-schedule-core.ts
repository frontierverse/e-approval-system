import {
  isYouthCommonScheduleWeekday,
  youthCommonScheduleWeekdays,
  type YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";

export type CurrentCommonScheduleClock = {
  currentMinute: number;
  weekday: number;
};

export type CurrentCommonScheduleSource = {
  content: string;
  endMinute: number;
  id: string;
  startMinute: number;
  weekday: number;
};

export type CurrentCommonScheduleAlert = {
  content: string;
  timeLabel: string;
  weekdayLabel: string;
};

const koreanTimeZone = "Asia/Seoul";

export function createCurrentCommonScheduleAlert(
  schedules: readonly CurrentCommonScheduleSource[],
  clock = getKoreanCurrentCommonScheduleClock(),
): CurrentCommonScheduleAlert | null {
  const weekday = isYouthCommonScheduleWeekday(clock.weekday)
    ? clock.weekday
    : null;

  if (weekday === null || !Number.isInteger(clock.currentMinute)) {
    return null;
  }

  const currentSchedule = schedules
    .filter((schedule) =>
      isCurrentCommonSchedule(schedule, weekday, clock.currentMinute),
    )
    .sort(compareCurrentCommonSchedules)[0];

  if (!currentSchedule) {
    return null;
  }

  return {
    content: currentSchedule.content.trim(),
    timeLabel: formatCurrentCommonScheduleTimeRange(
      currentSchedule.startMinute,
      currentSchedule.endMinute,
    ),
    weekdayLabel: formatCurrentCommonScheduleWeekday(weekday),
  };
}

export function getKoreanCurrentCommonScheduleClock(
  date = new Date(),
): CurrentCommonScheduleClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: koreanTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    Number.isInteger(hour) &&
    Number.isInteger(minute)
  ) {
    return {
      currentMinute: hour * 60 + minute,
      weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    };
  }

  return {
    currentMinute: date.getHours() * 60 + date.getMinutes(),
    weekday: date.getDay(),
  };
}

function isCurrentCommonSchedule(
  schedule: CurrentCommonScheduleSource,
  weekday: YouthLearningScheduleWeekday,
  currentMinute: number,
) {
  return (
    schedule.weekday === weekday &&
    schedule.startMinute <= currentMinute &&
    currentMinute < schedule.endMinute
  );
}

function compareCurrentCommonSchedules(
  first: CurrentCommonScheduleSource,
  second: CurrentCommonScheduleSource,
) {
  return (
    second.startMinute - first.startMinute ||
    first.endMinute - second.endMinute ||
    first.content.localeCompare(second.content, "ko-KR")
  );
}

function formatCurrentCommonScheduleWeekday(
  weekday: YouthLearningScheduleWeekday,
) {
  return (
    youthCommonScheduleWeekdays.find((item) => item.value === weekday)?.shortLabel ??
    `${weekday}`
  );
}

function formatCurrentCommonScheduleTimeRange(
  startMinute: number,
  endMinute: number,
) {
  return `${formatCurrentCommonScheduleTime(startMinute)}-${formatCurrentCommonScheduleTime(
    endMinute,
  )}`;
}

function formatCurrentCommonScheduleTime(minute: number) {
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;

  return `${String(hour).padStart(2, "0")}:${String(minutePart).padStart(
    2,
    "0",
  )}`;
}
