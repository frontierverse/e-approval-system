import { CommonScheduleBoardSkeleton } from "@/components/youth-common-schedule-board";
import { PageTitle } from "@/components/page-title";

export default function YouthCommonScheduleLoading() {
  return (
    <>
      <PageTitle title="공통 일정표" />
      <CommonScheduleBoardSkeleton />
    </>
  );
}
