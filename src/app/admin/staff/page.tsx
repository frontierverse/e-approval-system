import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminUserManagement } from "@/components/admin-user-management";
import { PageTitle } from "@/components/page-title";
import { RouteContentSkeleton } from "@/components/route-loading-shell";
import { getAdminReferenceData, getAdminUsers } from "@/lib/admin-queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "직원 정보",
};

export default function AdminStaffPage() {
  return (
    <>
      <PageTitle
        title="직원 정보"
        description="직원 계정, 권한, 입퇴사일과 조직 정보를 관리하는 화면입니다."
      />

      <Suspense fallback={<RouteContentSkeleton variant="adminStaff" />}>
        <AdminStaffContent />
      </Suspense>
    </>
  );
}

async function AdminStaffContent() {
  await requireAdmin();
  const [users, referenceData] = await Promise.all([
    getAdminUsers(),
    getAdminReferenceData(),
  ]);

  return (
    <AdminUserManagement
      users={users}
      departments={referenceData.departments}
      positions={referenceData.positions}
    />
  );
}
