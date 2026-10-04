import { mobileCafeResponse } from "@/lib/mobile-cafe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return mobileCafeResponse(request, "item", async () => (await context.params).id); }
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return mobileCafeResponse(request, "item.update", async () => (await context.params).id); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return mobileCafeResponse(request, "item.delete", async () => (await context.params).id); }
