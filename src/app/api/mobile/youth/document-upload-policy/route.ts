import { mobileYouthDecisionResponse } from "@/lib/mobile-youth-decision-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) { return mobileYouthDecisionResponse(request, "policy"); }
