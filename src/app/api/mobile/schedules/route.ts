import { getMobileSchedulePageResponse, saveMobileScheduleResponse } from "@/lib/mobile-schedules";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) { return getMobileSchedulePageResponse(request); }
export function POST(request: Request) { return saveMobileScheduleResponse(request); }
