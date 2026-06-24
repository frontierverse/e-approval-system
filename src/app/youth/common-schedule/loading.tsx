import { PageTitle } from "@/components/page-title";
import { CommonScheduleBoardSkeleton } from "@/components/youth-common-schedule-board";

export default function YouthCommonScheduleLoading() {
  return (
    <>
      <PageTitle
        title="공통 일정표"
        description="청소년관리에 함께 적용할 요일별 공통 일정을 기록합니다."
      />
      <CommonScheduleBoardSkeleton />
    </>
  );
}
