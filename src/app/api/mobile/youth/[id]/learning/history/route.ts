import { mobileYouthActivityResponse } from "@/lib/mobile-youth-activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "learning-history", () => context.params); }
