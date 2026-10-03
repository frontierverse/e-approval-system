import { getMobileDailyReportDetailResponse } from "@/lib/mobile-daily-reports";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return getMobileDailyReportDetailResponse(request, (await params).id); }
