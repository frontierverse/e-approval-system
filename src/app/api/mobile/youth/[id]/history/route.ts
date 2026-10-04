import { mobileYouthResponse } from "@/lib/mobile-youth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return mobileYouthResponse(request, "history", async () => (await context.params).id); }
