import { getMobileAccountImageResponse, updateMobileAccountImageResponse, deleteMobileAccountImageResponse } from "@/lib/mobile-account";
export const runtime = "nodejs";
export const GET = (request: Request) => getMobileAccountImageResponse(request, "profile");
export const POST = (request: Request) => updateMobileAccountImageResponse(request, "profile");
export const DELETE = (request: Request) => deleteMobileAccountImageResponse(request, "profile");
