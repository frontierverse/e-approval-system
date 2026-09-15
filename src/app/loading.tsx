import { RouteContentSkeleton } from "@/components/route-loading-shell";
import { HomeDailyReportSkeleton } from "@/components/home-daily-report";

export default function Loading() {
  return <><HomeDailyReportSkeleton /><RouteContentSkeleton variant="home" /></>;
}
