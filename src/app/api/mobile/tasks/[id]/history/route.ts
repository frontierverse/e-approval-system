import { getMobileStaffTaskHistoryResponse } from "@/lib/mobile-staff-tasks";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getMobileStaffTaskHistoryResponse(request, (await params).id);
}
