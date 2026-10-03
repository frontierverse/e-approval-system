import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "upload-complete", async () => (await context.params).id); }
