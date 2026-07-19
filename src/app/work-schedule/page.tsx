import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { WorkScheduleCalendarBoard } from "@/components/work-schedule-calendar-board";
import {
  deleteWorkScheduleAction,
  getWorkScheduleChangeLogsAction,
  saveWorkScheduleAction,
} from "@/app/work-schedule/actions";
import { requireUser } from "@/lib/auth";
import {
  getWorkScheduleChangeLogActors,
  getWorkScheduleChangeLogs,
  getWorkSchedules,
} from "@/lib/work-schedules";
import { normalizeWorkScheduleMonth } from "@/lib/work-schedule-calendar";
import { isYouthLearningScheduleDate } from "@/lib/youth-management-core";

export const metadata: Metadata = {
  title: "업무 일정",
};

type SearchParamValue = string | string[] | undefined;

type WorkSchedulePageProps = {
  searchParams: Promise<{
    logDate?: SearchParamValue;
    logPage?: SearchParamValue;
    logStaff?: SearchParamValue;
    month?: SearchParamValue;
  }>;
};

export default async function WorkSchedulePage({
  searchParams,
}: WorkSchedulePageProps) {
  await requireUser();
  const params = await searchParams;
  const selectedMonth = normalizeWorkScheduleMonth(getSingleParam(params.month));
  const [schedules, changeLogActors] = await Promise.all([
    getWorkSchedules(selectedMonth),
    getWorkScheduleChangeLogActors(),
  ]);
  const selectedChangeLogActorId = getSelectedChangeLogActorId(
    params.logStaff,
    changeLogActors,
  );
  const changeLogResult = await getWorkScheduleChangeLogs({
    actorId: selectedChangeLogActorId,
    page: getSelectedPage(params.logPage),
    scheduleDate: getSelectedScheduleDateFilter(params.logDate),
  });

  return (
    <>
      <PageTitle
        title="업무 일정"
        description="날짜별 업무 일정을 월간 달력으로 기록합니다."
      />

      <WorkScheduleCalendarBoard
        changeLogActors={changeLogActors}
        changeLogFilters={{
          actorId: changeLogResult.actorId,
          page: changeLogResult.page,
          pageSize: changeLogResult.pageSize,
          scheduleDate: changeLogResult.scheduleDate,
          total: changeLogResult.total,
          totalPages: changeLogResult.totalPages,
        }}
        changeLogs={changeLogResult.logs}
        deleteSchedule={deleteWorkScheduleAction}
        loadChangeLogs={getWorkScheduleChangeLogsAction}
        saveSchedule={saveWorkScheduleAction}
        schedules={schedules}
        selectedMonth={selectedMonth}
      />
    </>
  );
}

function getSelectedPage(value: SearchParamValue) {
  const page = Number(getSingleParam(value));

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getSelectedScheduleDateFilter(value: SearchParamValue) {
  const selectedDate = getSingleParam(value);

  return selectedDate && isYouthLearningScheduleDate(selectedDate)
    ? selectedDate
    : "";
}

function getSelectedChangeLogActorId(
  value: SearchParamValue,
  actors: Array<{ id: string }>,
) {
  const actorId = getSingleParam(value);

  return actorId && actors.some((actor) => actor.id === actorId)
    ? actorId
    : "all";
}

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
