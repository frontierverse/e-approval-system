import { PageTitle } from "@/components/page-title";
import { YouthCommonScheduleBoard } from "@/components/youth-common-schedule-board";
import {
  deleteWorkScheduleAction,
  saveWorkScheduleAction,
} from "@/app/work-schedule/actions";
import { requireUser } from "@/lib/auth";
import {
  getWorkScheduleChangeLogActors,
  getWorkScheduleChangeLogs,
  getWorkSchedules,
  type WorkScheduleWeekdayFilter,
} from "@/lib/work-schedules";
import { isYouthCommonScheduleWeekday } from "@/lib/youth-management-core";

type SearchParamValue = string | string[] | undefined;

type WorkSchedulePageProps = {
  searchParams: Promise<{
    logPage?: SearchParamValue;
    logStaff?: SearchParamValue;
    logWeekday?: SearchParamValue;
  }>;
};

const workScheduleBoardLabels = {
  basePath: "/work-schedule",
  boardAriaLabel: "업무 일정표",
  changeLogAriaLabel: "업무 일정표 변경내역",
  changeLogFallbackMessage: "업무 일정표 변경내역을 기록했습니다.",
  description: "오전 9시부터 오후 6시까지 요일별 업무 일정을 관리합니다.",
  loadingLabel: "업무 일정표 불러오는 중",
  noMatchingChangeLogsMessage: "조건에 맞는 변경내역이 없습니다.",
  paginationAriaLabel: "업무 일정표 변경내역 페이지",
  scheduleTitle: "업무 일정표",
  staffFilterAriaLabel: "업무 일정표 변경내역 직원 필터",
  weekdayFilterAriaLabel: "업무 일정표 변경내역 요일 필터",
};

export default async function WorkSchedulePage({
  searchParams,
}: WorkSchedulePageProps) {
  await requireUser();
  const params = await searchParams;
  const [schedules, changeLogActors] = await Promise.all([
    getWorkSchedules(),
    getWorkScheduleChangeLogActors(),
  ]);
  const selectedChangeLogActorId = getSelectedChangeLogActorId(
    params.logStaff,
    changeLogActors,
  );
  const changeLogResult = await getWorkScheduleChangeLogs({
    actorId: selectedChangeLogActorId,
    page: getSelectedPage(params.logPage),
    weekday: getSelectedWeekday(params.logWeekday),
  });

  return (
    <>
      <PageTitle
        title="업무 일정"
        description="요일별 업무 일정을 공통 시간표처럼 기록합니다."
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
        deleteSchedule={deleteWorkScheduleAction}
        labels={workScheduleBoardLabels}
        saveSchedule={saveWorkScheduleAction}
        schedules={schedules}
      />
    </>
  );
}

function getSelectedPage(value: SearchParamValue) {
  const page = Number(getSingleParam(value));

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getSelectedWeekday(value: SearchParamValue): WorkScheduleWeekdayFilter {
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
