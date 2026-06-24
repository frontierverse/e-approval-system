import { PageTitle } from "@/components/page-title";
import { CommonScheduleBoardSkeleton } from "@/components/youth-common-schedule-board";

export default function WorkScheduleLoading() {
  return (
    <>
      <PageTitle
        title="업무 일정"
        description="요일별 업무 일정을 공통 시간표처럼 기록합니다."
      />
      <CommonScheduleBoardSkeleton
        labels={{
          basePath: "/work-schedule",
          boardAriaLabel: "업무 일정표",
          changeLogAriaLabel: "업무 일정표 변경내역",
          description:
            "오전 9시부터 오후 6시까지 요일별 업무 일정을 관리합니다.",
          loadingLabel: "업무 일정표 불러오는 중",
          scheduleTitle: "업무 일정표",
        }}
      />
    </>
  );
}
