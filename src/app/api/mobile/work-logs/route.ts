import { getMobileWorkLogPageResponse, saveMobileWorkLogResponse } from "@/lib/mobile-work-logs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) { return getMobileWorkLogPageResponse(request); }
export function POST(request: Request) { return saveMobileWorkLogResponse(request); }
