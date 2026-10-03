import { getMobileAccountImageResponse, updateMobileAccountImageResponse, deleteMobileAccountImageResponse } from "@/lib/mobile-account";
export const runtime = "nodejs";
export const GET = (request: Request) => getMobileAccountImageResponse(request, "signature");
export const POST = (request: Request) => updateMobileAccountImageResponse(request, "signature");
export const DELETE = (request: Request) => deleteMobileAccountImageResponse(request, "signature");
