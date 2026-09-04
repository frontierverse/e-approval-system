import type { Metadata } from "next";
import {
  deleteWorkLogAction,
  saveWorkLogAction,
} from "@/app/work-schedule/work-log/actions";
import { PageTitle } from "@/components/page-title";
import { WorkLogBoard } from "@/components/work-log-board";
import { requireUser } from "@/lib/auth";
import { getWorkLogToday, isWorkLogDate } from "@/lib/work-log-core";
import { getWorkLogPageData } from "@/lib/work-logs";

export const metadata: Metadata = {
  title: "업무일지",
};

type SearchParamValue = string | string[] | undefined;

export default async function WorkLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: SearchParamValue }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = getWorkLogToday();
  const requestedDate = getSingleParam(params.date);
  const selectedDate =
    requestedDate && isWorkLogDate(requestedDate) && requestedDate <= today
      ? requestedDate
      : today;
  const pageData = await getWorkLogPageData({
    authorId: user.id,
    selectedDate,
    today,
  });

  return (
    <>
      <PageTitle
        compact
        title="업무일지"
        description="날짜별 업무를 기록하고 최근 1년의 작성 흐름을 확인합니다."
      />

      <WorkLogBoard
        key={selectedDate}
        contributionDates={pageData.contributionDates}
        deleteAction={deleteWorkLogAction}
        linkedScheduleState={pageData.linkedScheduleState}
        recentLogs={pageData.recentLogs}
        saveAction={saveWorkLogAction}
        selectedDate={selectedDate}
        selectedLog={pageData.selectedLog}
        today={today}
      />
    </>
  );
}

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
