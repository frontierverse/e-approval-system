import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "upload-status", async () => (await context.params).id); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "upload-cancel", async () => (await context.params).id); }
