import { PageTitle } from "@/components/page-title";
import { YouthLearningProgressBoard } from "@/components/youth-learning-progress-board";
import { requireUser } from "@/lib/auth";
import {
  getYouthLearningProgressChangeLogActors,
  getYouthLearningProgressChangeLogs,
  getYouthLearningSchedules,
} from "@/lib/youth-learning-schedules";
import { getYouthProfiles } from "@/lib/youth-management";
import {
  deleteYouthLearningScheduleAction,
  getYouthLearningProgressChangeLogsAction,
  getYouthLearningSchedulesAction,
  saveYouthLearningScheduleAction,
} from "@/app/youth/learning-progress/actions";
import {
  getYouthLearningScheduleToday,
  isYouthLearningScheduleDate,
} from "@/lib/youth-management-core";

type YouthLearningProgressPageProps = {
  searchParams: Promise<{
    date?: string | string[];
    logDate?: string | string[];
    logPage?: string | string[];
    logStaff?: string | string[];
  }>;
};

export default async function YouthLearningProgressPage({
  searchParams,
}: YouthLearningProgressPageProps) {
  await requireUser();
  const params = await searchParams;
  const selectedDate = getSelectedScheduleDate(params.date);
  const selectedChangeLogDate = getSelectedScheduleDateFilter(params.logDate);
  const selectedChangeLogPage = getSelectedPage(params.logPage);
  const [youthProfiles, schedules, changeLogActors] = await Promise.all([
    getYouthProfiles(),
    getYouthLearningSchedules(selectedDate),
    getYouthLearningProgressChangeLogActors(),
  ]);
  const selectedChangeLogActorId = getSelectedChangeLogActorId(
    params.logStaff,
    changeLogActors,
  );
  const changeLogResult = await getYouthLearningProgressChangeLogs({
    actorId: selectedChangeLogActorId,
    page: selectedChangeLogPage,
    scheduleDate: selectedChangeLogDate,
  });

  return (
    <>
      <PageTitle
        title="학습진도"
        description="청소년별 학습 관련 기록과 최근 진도 흐름을 확인합니다."
      />

      <YouthLearningProgressBoard
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
        deleteSchedule={deleteYouthLearningScheduleAction}
        loadChangeLogs={getYouthLearningProgressChangeLogsAction}
        loadSchedules={getYouthLearningSchedulesAction}
        saveSchedule={saveYouthLearningScheduleAction}
        schedules={schedules}
        selectedDate={selectedDate}
        youths={youthProfiles}
      />
    </>
  );
}

function getSelectedScheduleDate(value: string | string[] | undefined) {
  const selectedDate = Array.isArray(value) ? value[0] : value;

  return selectedDate && isYouthLearningScheduleDate(selectedDate)
    ? selectedDate
    : getYouthLearningScheduleToday();
}

function getSelectedScheduleDateFilter(value: string | string[] | undefined) {
  const selectedDate = Array.isArray(value) ? value[0] : value;

  return selectedDate && isYouthLearningScheduleDate(selectedDate)
    ? selectedDate
    : "";
}

function getSelectedPage(value: string | string[] | undefined) {
  const pageValue = Array.isArray(value) ? value[0] : value;
  const page = Number(pageValue);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getSelectedChangeLogActorId(
  value: string | string[] | undefined,
  actors: Array<{ id: string }>,
) {
  const actorId = Array.isArray(value) ? value[0] : value;

  return actorId && actors.some((actor) => actor.id === actorId)
    ? actorId
    : "all";
}
