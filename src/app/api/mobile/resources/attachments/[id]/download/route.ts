import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "download", async () => (await context.params).id); }
