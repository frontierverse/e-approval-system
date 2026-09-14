import type { Metadata } from "next";
import { DailyReportBoard } from "@/components/daily-report-board";
import { saveDailyReportAction, reviewDailyReportAction } from "@/app/work-schedule/daily-reports/actions";
import { getDailyReportPageData } from "@/lib/daily-reports";

export const metadata: Metadata = { title: "일일 업무보고" };

export default async function DailyReportsPage({ searchParams }: {
  searchParams: Promise<{ date?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const data = await getDailyReportPageData(
    Array.isArray(params.date) ? params.date[0] : params.date,
    Array.isArray(params.page) ? params.page[0] : params.page,
  );
  return <DailyReportBoard key={`${data.mode}-${data.selectedDate}`} data={data} saveAction={saveDailyReportAction} reviewAction={reviewDailyReportAction} />;
}
