import { getMobileScheduleChangesResponse } from "@/lib/mobile-schedules";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) { return getMobileScheduleChangesResponse(request); }
