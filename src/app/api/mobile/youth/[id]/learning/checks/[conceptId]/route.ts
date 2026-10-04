import { mobileYouthActivityResponse } from "@/lib/mobile-youth-activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string; conceptId: string }> };
export async function PUT(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "concept-check", () => context.params); }
