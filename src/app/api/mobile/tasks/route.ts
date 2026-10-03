import { createMobileStaffTaskResponse, getMobileStaffTasksResponse } from "@/lib/mobile-staff-tasks";

export const runtime = "nodejs";
export const GET = getMobileStaffTasksResponse;
export const POST = createMobileStaffTaskResponse;
