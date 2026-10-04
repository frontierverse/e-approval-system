import { mobileYouthActivityResponse } from "@/lib/mobile-youth-activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return mobileYouthActivityResponse(request, "rules"); }
export async function POST(request: Request) { return mobileYouthActivityResponse(request, "rule-create"); }
