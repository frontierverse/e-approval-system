import { mobileYouthActivityResponse } from "@/lib/mobile-youth-activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "concept-delete", () => context.params); }
