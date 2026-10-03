import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export async function GET(request: Request) { return mobileResourceResponse(request, "list"); }
export async function POST(request: Request) { return mobileResourceResponse(request, "create"); }
