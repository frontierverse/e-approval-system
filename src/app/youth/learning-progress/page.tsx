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

export default async function YouthLearningProgressPage() {
  await requireUser();
  const [youthProfiles, schedules, changeLogs] = await Promise.all([
    getYouthProfiles(),
    getYouthLearningSchedules(),
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
        youths={youthProfiles}
      />
    </>
  );
}
