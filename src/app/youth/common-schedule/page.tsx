import { PageTitle } from "@/components/page-title";
import { YouthCommonScheduleBoard } from "@/components/youth-common-schedule-board";
import { requireUser } from "@/lib/auth";
import {
  getYouthCommonScheduleChangeLogActors,
  getYouthCommonScheduleChangeLogs,
  getYouthCommonSchedules,
} from "@/lib/youth-common-schedules";
import {
  isYouthLearningScheduleWeekday,
  type YouthCommonScheduleWeekdayFilter,
} from "@/lib/youth-management-core";
import {
  deleteYouthCommonScheduleAction,
  saveYouthCommonScheduleAction,
} from "@/app/youth/common-schedule/actions";

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
      <PageTitle
        title="공통 일정표"
        description="청소년관리에서 함께 적용할 요일별 공통 일정을 기록합니다."
      />

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

  return isYouthLearningScheduleWeekday(weekday) ? weekday : "all";
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
