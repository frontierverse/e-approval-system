import { deleteMobileStaffTaskResponse } from "@/lib/mobile-staff-tasks";

export const runtime = "nodejs";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteMobileStaffTaskResponse(request, (await params).id);
}
