import type { Metadata } from "next";
import { YouthCommonScheduleBoard } from "@/components/youth-common-schedule-board";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import {
  getYouthCommonScheduleChangeLogActors,
  getYouthCommonScheduleChangeLogs,
  getYouthCommonSchedules,
} from "@/lib/youth-common-schedules";
import {
  isYouthCommonScheduleWeekday,
  type YouthCommonScheduleWeekdayFilter,
} from "@/lib/youth-management-core";
import {
  deleteYouthCommonScheduleAction,
  getYouthCommonScheduleChangeLogsAction,
  saveYouthCommonScheduleAction,
} from "@/app/youth/common-schedule/actions";

export const metadata: Metadata = {
  title: "공통 일정표",
};

type SearchParamValue = string | string[] | undefined;

type YouthCommonSchedulePageProps = {
  searchParams: Promise<{
    logPage?: SearchParamValue;
    logStaff?: SearchParamValue;
    logWeekday?: SearchParamValue;
  }>;
};

export default async function YouthCommonSchedulePage({
  searchParams,
}: YouthCommonSchedulePageProps) {
  await requireUser();
  const params = await searchParams;
  const [schedules, changeLogActors] = await Promise.all([
    getYouthCommonSchedules(),
    getYouthCommonScheduleChangeLogActors(),
  ]);
  const selectedChangeLogActorId = getSelectedChangeLogActorId(
    params.logStaff,
    changeLogActors,
  );
  const changeLogResult = await getYouthCommonScheduleChangeLogs({
    actorId: selectedChangeLogActorId,
    page: getSelectedPage(params.logPage),
    weekday: getSelectedWeekday(params.logWeekday),
  });

  return (
    <>
      <PageTitle title="공통 일정표" />
      <YouthCommonScheduleBoard
        changeLogActors={changeLogActors}
        changeLogFilters={{
          actorId: changeLogResult.actorId,
          page: changeLogResult.page,
          pageSize: changeLogResult.pageSize,
          total: changeLogResult.total,
          totalPages: changeLogResult.totalPages,
          weekday: changeLogResult.weekday,
        }}
        changeLogs={changeLogResult.logs}
        deleteSchedule={deleteYouthCommonScheduleAction}
        labels={{ scheduleTitle: "주간 시간표" }}
        loadChangeLogs={getYouthCommonScheduleChangeLogsAction}
        saveSchedule={saveYouthCommonScheduleAction}
        schedules={schedules}
      />
    </>
  );
}

function getSelectedPage(value: SearchParamValue) {
  const page = Number(getSingleParam(value));

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getSelectedWeekday(value: SearchParamValue): YouthCommonScheduleWeekdayFilter {
  const weekday = Number(getSingleParam(value));

  return isYouthCommonScheduleWeekday(weekday) ? weekday : "all";
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
