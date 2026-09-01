import { PageTitle } from "@/components/page-title";
import { YouthPersonalScheduleCalendarSkeleton } from "@/components/youth-personal-schedule-calendar-board";

export default function YouthPersonalScheduleLoading() {
  return (
    <>
      <PageTitle title="개인 일정표" />
      <YouthPersonalScheduleCalendarSkeleton />
    </>
  );
}
