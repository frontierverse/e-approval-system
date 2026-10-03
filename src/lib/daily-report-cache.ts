import "server-only";
import { revalidatePath } from "next/cache";
import { dailyReportPath } from "@/lib/daily-report-core";

export function revalidateDailyReports() {
  revalidatePath(dailyReportPath);
  revalidatePath("/");
}
