import { mobileCafeResponse } from "@/lib/mobile-cafe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) { return mobileCafeResponse(request, "mutation-status", async () => (await context.params).requestId); }
