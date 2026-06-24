import { PageTitle } from "@/components/page-title";
import { LearningProgressBoardSkeleton } from "@/components/youth-learning-progress-board";

export default function YouthLearningProgressLoading() {
  return (
    <>
      <PageTitle
        title="학습지도"
        description="청소년별 학습 관리 기록과 최근 지도 흐름을 확인합니다."
      />
      <LearningProgressBoardSkeleton />
    </>
  );
}
