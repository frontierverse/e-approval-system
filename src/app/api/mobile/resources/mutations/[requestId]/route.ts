import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) { return mobileResourceResponse(request, "mutation", async () => (await context.params).requestId); }
