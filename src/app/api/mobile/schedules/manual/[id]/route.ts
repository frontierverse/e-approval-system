import { getMobileManualScheduleResponse, saveMobileScheduleResponse, deleteMobileScheduleResponse } from "@/lib/mobile-schedules";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return getMobileManualScheduleResponse(request, (await context.params).id); }
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return saveMobileScheduleResponse(request, (await context.params).id); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return deleteMobileScheduleResponse(request, (await context.params).id); }
