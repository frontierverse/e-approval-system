import { mobileCafeResponse } from "@/lib/mobile-cafe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return mobileCafeResponse(request, "item.hold", async () => (await context.params).id); }
