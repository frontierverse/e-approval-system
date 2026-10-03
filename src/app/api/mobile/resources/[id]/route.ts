import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "detail", async () => (await context.params).id); }
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "update", async () => (await context.params).id); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "delete", async () => (await context.params).id); }
