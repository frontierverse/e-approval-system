import { mobileYouthResponse } from "@/lib/mobile-youth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return mobileYouthResponse(request, "list"); }
export async function POST(request: Request) { return mobileYouthResponse(request, "create"); }
