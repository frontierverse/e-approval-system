import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "upload-grant", async () => (await context.params).id); }
