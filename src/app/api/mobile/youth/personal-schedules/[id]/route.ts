import { mobileYouthActivityResponse } from "@/lib/mobile-youth-activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "personal-detail", () => context.params); }
export async function PUT(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "personal-update", () => context.params); }
export async function DELETE(request: Request, context: RouteContext) { return mobileYouthActivityResponse(request, "personal-delete", () => context.params); }
