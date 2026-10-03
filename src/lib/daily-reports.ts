import "server-only";

import { requireUser } from "@/lib/auth";
import { getDailyReportHomeSummaryForActor, getDailyReportPageDataForActor } from "@/lib/daily-report-queries";

export { dailyReportSelect, mapDailyReport, reportYouthWhere } from "@/lib/daily-report-queries";

export async function getDailyReportHomeSummary() {
  return getDailyReportHomeSummaryForActor(await requireUser());
}
export async function getDailyReportPageData(date?: string, page?: string) {
  return getDailyReportPageDataForActor(await requireUser(), date, page);
}
