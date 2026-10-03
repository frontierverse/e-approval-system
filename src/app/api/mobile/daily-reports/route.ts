import { getMobileDailyReportListResponse, saveMobileDailyReportResponse } from "@/lib/mobile-daily-reports";

export const runtime = "nodejs";
export async function GET(request: Request) { return getMobileDailyReportListResponse(request); }
export async function POST(request: Request) { return saveMobileDailyReportResponse(request); }
