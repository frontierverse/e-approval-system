import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminStaffTaskBoard, type StaffTaskAdminFilters } from "@/components/admin-staff-task-board";
import { requireAdmin } from "@/lib/auth";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { getAdminStaffTasks, getStaffTaskAssignees, getStaffTaskEmployeeSummaries } from "@/lib/staff-tasks";
import Loading from "./loading";

export const metadata: Metadata = { title: "직원 할 일" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AdminStaffTasksPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<Loading />}><AdminStaffTasksContent searchParams={searchParams} /></Suspense>;
}

async function AdminStaffTasksContent({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const requestedStatus = singleValue(params.status);
  const status = requestedStatus === "pending" || requestedStatus === "completed" || requestedStatus === "overdue" ? requestedStatus : "all";
  const filters: StaffTaskAdminFilters = {
    status,
    assigneeId: singleValue(params.assigneeId),
    query: singleValue(params.query).trim().slice(0, 100),
  };
  const requestedPage = Number(singleValue(params.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [data, assignees, employees] = await Promise.all([
    getAdminStaffTasks({ ...filters, page }),
    getStaffTaskAssignees(),
    getStaffTaskEmployeeSummaries(),
  ]);

  return <AdminStaffTaskBoard data={data} assignees={assignees} employees={employees} filters={filters} referenceDate={getKoreanDateValue()} />;
}

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}
