import { mobileYouthResponse } from "@/lib/mobile-youth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return mobileYouthResponse(request, "details", async () => (await context.params).id); }
