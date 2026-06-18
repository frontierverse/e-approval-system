import { PageTitle } from "@/components/page-title";
import { YouthLearningProgressBoard } from "@/components/youth-learning-progress-board";
import { requireUser } from "@/lib/auth";
import {
  getYouthLearningProgressChangeLogs,
  getYouthLearningSchedules,
} from "@/lib/youth-learning-schedules";
import { getYouthProfiles } from "@/lib/youth-management";
import {
  createLearningProgressYouthAction,
  deleteLearningProgressYouthAction,
  deleteYouthLearningScheduleAction,
  saveYouthLearningScheduleAction,
} from "@/app/youth/learning-progress/actions";
import {
  getYouthLearningScheduleToday,
  isYouthLearningScheduleDate,
} from "@/lib/youth-management-core";

type YouthLearningProgressPageProps = {
  searchParams: Promise<{
    date?: string | string[];
  }>;
};

export default async function YouthLearningProgressPage({
  searchParams,
}: YouthLearningProgressPageProps) {
  await requireUser();
  const selectedDate = getSelectedScheduleDate((await searchParams).date);
  const [youthProfiles, schedules, changeLogs] = await Promise.all([
    getYouthProfiles(),
    getYouthLearningSchedules(selectedDate),
    getYouthLearningProgressChangeLogs(),
  ]);

  return (
    <>
      <PageTitle
        title="학습진도"
        description="청소년별 학습 관련 기록과 최근 진도 흐름을 확인합니다."
      />

      <YouthLearningProgressBoard
        createYouth={createLearningProgressYouthAction}
        changeLogs={changeLogs}
        deleteSchedule={deleteYouthLearningScheduleAction}
        deleteYouth={deleteLearningProgressYouthAction}
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
