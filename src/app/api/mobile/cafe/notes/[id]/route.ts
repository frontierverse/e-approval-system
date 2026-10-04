import { mobileCafeResponse } from "@/lib/mobile-cafe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return mobileCafeResponse(request, "note.delete", async () => (await context.params).id); }
