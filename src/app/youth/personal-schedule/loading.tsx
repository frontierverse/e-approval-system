import { PageTitle } from "@/components/page-title";
import { YouthPersonalScheduleCalendarSkeleton } from "@/components/youth-personal-schedule-calendar-board";

export default function YouthPersonalScheduleLoading() {
  return (
    <>
      <PageTitle
        title="개인 일정표"
        titleAccessory={
          <span
            aria-hidden="true"
            className="block h-11 w-36 animate-pulse rounded-md bg-[var(--surface-muted)] motion-reduce:animate-none sm:w-40"
          />
        }
      />
      <YouthPersonalScheduleCalendarSkeleton />
    </>
  );
}
