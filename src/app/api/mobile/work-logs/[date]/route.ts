import { getMobileWorkLogDateResponse, deleteMobileWorkLogResponse } from "@/lib/mobile-work-logs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ date: string }> }) { return getMobileWorkLogDateResponse(request, (await context.params).date); }
export async function DELETE(request: Request, context: { params: Promise<{ date: string }> }) { return deleteMobileWorkLogResponse(request, (await context.params).date); }
