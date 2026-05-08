import { Suspense } from "react";
import { AdminAttachmentPolicyManagement } from "@/components/admin-attachment-policy-management";
import { AdminAuditLogList } from "@/components/admin-audit-log-list";
import { AdminDepartmentManagement } from "@/components/admin-department-management";
import { AdminPositionManagement } from "@/components/admin-position-management";
import { AdminTemplateManagement } from "@/components/admin-template-management";
import { AdminUserManagement } from "@/components/admin-user-management";
import { PageTitle } from "@/components/page-title";
import {
  getAdminAttachmentPolicy,
  getAdminAuditLogs,
  getAdminDepartments,
  getAdminDocumentTemplates,
  getAdminOverview,
  getAdminPositions,
  getAdminReferenceData,
  getAdminUsers,
} from "@/lib/admin-queries";
import { requireAdmin } from "@/lib/auth";

export default function AdminPage() {
  return (
    <>
      <PageTitle
        title="관리자"
        description="사용자, 부서, 직급, 문서 양식 같은 기준 정보를 관리하는 화면입니다."
      />

      <Suspense fallback={<AdminPageFallback />}>
        <AdminContent />
      </Suspense>
    </>
  );
}

async function AdminContent() {
  await requireAdmin();
  const [
    overview,
    users,
    departments,
    positions,
    templates,
    attachmentPolicy,
    auditLogs,
    referenceData,
  ] = await Promise.all([
    getAdminOverview(),
    getAdminUsers(),
    getAdminDepartments(),
    getAdminPositions(),
    getAdminDocumentTemplates(),
    getAdminAttachmentPolicy(),
    getAdminAuditLogs(),
    getAdminReferenceData(),
  ]);

  const summaryItems = [
    {
      label: "사용자",
      value: String(overview.users.total),
      note: `활성 ${overview.users.active}명`,
    },
    {
      label: "부서",
      value: String(overview.departments.total),
      note: `활성 ${overview.departments.active}개`,
    },
    {
      label: "직급",
      value: String(overview.positions.total),
      note: `활성 ${overview.positions.active}개`,
    },
    {
      label: "문서 양식",
      value: String(overview.templates.total),
      note: `활성 ${overview.templates.active}개`,
    },
  ];

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        {summaryItems.map((item) => (
          <article
            key={item.label}
            className="rounded-md border border-[#d9dee7] bg-white p-5"
          >
            <p className="text-sm font-medium text-[#697386]">{item.label}</p>
            <p className="mt-4 text-3xl font-semibold text-[#16181d]">
              {item.value}
            </p>
            <p className="mt-2 text-sm text-[#697386]">{item.note}</p>
          </article>
        ))}
      </section>

      <div className="mt-6 grid gap-6">
        <AdminDepartmentManagement departments={departments} />

        <AdminPositionManagement positions={positions} />

        <AdminTemplateManagement templates={templates} />

        <AdminAttachmentPolicyManagement policy={attachmentPolicy} />

        <AdminUserManagement
          users={users}
          departments={referenceData.departments}
          positions={referenceData.positions}
        />

        <AdminAuditLogList logs={auditLogs} />
      </div>
    </>
  );
}

function AdminPageFallback() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-4">
        {["사용자", "부서", "직급", "문서 양식"].map((label) => (
          <article
            key={label}
            className="rounded-md border border-[#d9dee7] bg-white p-5"
          >
            <p className="text-sm font-medium text-[#697386]">{label}</p>
            <p className="mt-4 text-3xl font-semibold text-[#16181d]">-</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#edf1f5]">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-[#196b69]" />
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-md border border-[#d9dee7] bg-white p-5">
        <p className="text-sm font-semibold text-[#394150]">
          관리자 정보를 불러오는 중입니다.
        </p>
      </section>
    </div>
  );
}
