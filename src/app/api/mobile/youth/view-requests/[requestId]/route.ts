import { mobileYouthResponse } from "@/lib/mobile-youth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) { return mobileYouthResponse(request, "view-status", async () => (await context.params).requestId); }
