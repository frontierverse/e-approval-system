import { mobileCafeResponse } from "@/lib/mobile-cafe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return mobileCafeResponse(request, "items"); }
export async function POST(request: Request) { return mobileCafeResponse(request, "item.create"); }
