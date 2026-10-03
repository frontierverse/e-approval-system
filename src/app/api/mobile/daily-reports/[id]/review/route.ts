import { reviewMobileDailyReportResponse } from "@/lib/mobile-daily-reports";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return reviewMobileDailyReportResponse(request, (await params).id); }
