import { getMobileDailyReportEditorResponse } from "@/lib/mobile-daily-reports";

export const runtime = "nodejs";
export async function GET(request: Request) { return getMobileDailyReportEditorResponse(request); }
