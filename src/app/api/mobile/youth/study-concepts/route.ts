import { mobileYouthActivityResponse } from "@/lib/mobile-youth-activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) { return mobileYouthActivityResponse(request, "concept-create"); }
export async function GET(request: Request) { return mobileYouthActivityResponse(request, "concepts"); }
