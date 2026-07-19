import { CommonScheduleBoardSkeleton } from "@/components/youth-common-schedule-board";
import { PageTitle } from "@/components/page-title";

export default function YouthCommonScheduleLoading() {
  return (
    <>
      <PageTitle
        title="공통 일정표"
        description="청소년 공통 일정을 요일과 시간대별로 관리합니다."
      />
      <CommonScheduleBoardSkeleton />
    </>
  );
}
