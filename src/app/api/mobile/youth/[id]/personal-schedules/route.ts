import { mobileYouthActivityResponse } from "@/lib/mobile-youth-activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "personal-list", () => context.params); }
export async function POST(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "personal-create", () => context.params); }
