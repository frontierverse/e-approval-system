import { completeMobileStaffTaskResponse } from "@/lib/mobile-staff-tasks";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return completeMobileStaffTaskResponse(request, (await params).id);
}
