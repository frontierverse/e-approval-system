import { PageTitle } from "@/components/page-title";
import { WorkScheduleCalendarSkeleton } from "@/components/work-schedule-calendar-board";

export default function WorkScheduleLoading() {
  return (
    <>
      <PageTitle
        title="업무 일정"
        description="날짜별 업무 일정을 월간 달력으로 기록합니다."
      />
      <WorkScheduleCalendarSkeleton />
    </>
  );
}
