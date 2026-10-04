import { mobileYouthResponse } from "@/lib/mobile-youth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return mobileYouthResponse(request, "detail", async () => (await context.params).id); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return mobileYouthResponse(request, "patch", async () => (await context.params).id); }
