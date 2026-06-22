import Link from "next/link";
import { Suspense } from "react";
import { AdminAttachmentPolicyManagement } from "@/components/admin-attachment-policy-management";
import { AdminAuditLogList } from "@/components/admin-audit-log-list";
import { AdminDepartmentManagement } from "@/components/admin-department-management";
import { AdminLoginHistoryList } from "@/components/admin-login-history-list";
import { AdminPositionManagement } from "@/components/admin-position-management";
import { AdminTemplateManagement } from "@/components/admin-template-management";
import { PageTitle } from "@/components/page-title";
import {
  getAdminAttachmentPolicy,
  getAdminAuditActors,
  getAdminAuditLogPage,
  getAdminDepartments,
  getAdminDocumentTemplates,
  getAdminLoginHistoryPage,
  getAdminLoginHistoryUsers,
  getAdminOverview,
  getAdminPositions,
  type AdminAuditLogFilters,
  type AdminAuditLogStatusFilter,
  type AdminLoginHistoryFilters,
  type AdminLoginHistoryResultFilter,
} from "@/lib/admin-queries";
import { isAuditActionValue } from "@/lib/audit-log-display";
import { requireAdmin } from "@/lib/auth";
import { RouteContentSkeleton } from "@/components/route-loading-shell";

type SearchParamValue = string | string[] | undefined;

type AdminPageSearchParams = {
  tab?: SearchParamValue;
  q?: SearchParamValue;
  status?: SearchParamValue;
  result?: SearchParamValue;
  user?: SearchParamValue;
  dateFrom?: SearchParamValue;
  dateTo?: SearchParamValue;
  page?: SearchParamValue;
};

const adminTabs = [
  { value: "departments", label: "부서", description: "조직 단위" },
  { value: "positions", label: "직급", description: "결재 체계" },
  { value: "templates", label: "문서 양식", description: "기안 양식" },
  { value: "attachments", label: "첨부 정책", description: "파일 제한" },
  { value: "audit", label: "감사 로그", description: "작업 이력" },
  { value: "login-history", label: "로그인 이력", description: "접속 기록" },
] as const;

type AdminTabValue = (typeof adminTabs)[number]["value"];
type AdminTabCounts = Partial<Record<AdminTabValue, string>>;
type AdminAuditLogSearchFilters = Omit<AdminAuditLogFilters, "pageSize">;
type AdminLoginHistorySearchFilters = Omit<
  AdminLoginHistoryFilters,
  "pageSize"
>;

const auditLogPageSize = 12;
const loginHistoryPageSize = 12;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminPageSearchParams>;
}) {
  const params = await searchParams;
  const activeTab = normalizeAdminTab(params.tab);

  return (
    <>
      <PageTitle
        title="관리 설정"
        description="부서, 직급, 문서 양식 같은 기준 정보를 관리하는 화면입니다."
      />

      <Suspense fallback={<RouteContentSkeleton variant="admin" />}>
        <AdminContent activeTab={activeTab} searchParams={params} />
      </Suspense>
    </>
  );
}

async function AdminContent({
  activeTab,
  searchParams,
}: {
  activeTab: AdminTabValue;
  searchParams: AdminPageSearchParams;
}) {
  await requireAdmin();
  const [overview, activePanel] = await Promise.all([
    getAdminOverview(),
    getAdminPanel(activeTab, searchParams),
  ]);
  const tabCounts = {
    departments: String(overview.departments.total),
    positions: String(overview.positions.total),
    templates: String(overview.templates.total),
    audit: "최근",
    "login-history": String(overview.loginHistories.total),
  } satisfies AdminTabCounts;

  return (
    <>
      <AdminTabs activeTab={activeTab} counts={tabCounts} />
      <div className="mt-6">{activePanel}</div>
    </>
  );
}

async function getAdminPanel(
  activeTab: AdminTabValue,
  searchParams: AdminPageSearchParams,
) {
  if (activeTab === "departments") {
    const departments = await getAdminDepartments();

    return <AdminDepartmentManagement departments={departments} />;
  }

  if (activeTab === "positions") {
    const positions = await getAdminPositions();

    return <AdminPositionManagement positions={positions} />;
  }

  if (activeTab === "templates") {
    const templates = await getAdminDocumentTemplates();

    return <AdminTemplateManagement templates={templates} />;
  }

  if (activeTab === "attachments") {
    const attachmentPolicy = await getAdminAttachmentPolicy();

    return <AdminAttachmentPolicyManagement policy={attachmentPolicy} />;
  }

  if (activeTab === "login-history") {
    const filters = getLoginHistoryFilters(searchParams);
    const [historyPage, users] = await Promise.all([
      getAdminLoginHistoryPage({
        ...filters,
        pageSize: loginHistoryPageSize,
      }),
      getAdminLoginHistoryUsers(),
    ]);

    return (
      <AdminLoginHistoryList
        histories={historyPage.histories}
        users={users}
        filters={filters}
        page={historyPage.page}
        pageSize={historyPage.pageSize}
        total={historyPage.total}
        totalPages={historyPage.totalPages}
      />
    );
  }

  const filters = getAuditLogFilters(searchParams);
  const [auditPage, actors] = await Promise.all([
    getAdminAuditLogPage({
      ...filters,
      pageSize: auditLogPageSize,
    }),
    getAdminAuditActors(),
  ]);

  return (
    <AdminAuditLogList
      logs={auditPage.logs}
      actors={actors}
      filters={filters}
      page={auditPage.page}
      pageSize={auditPage.pageSize}
      total={auditPage.total}
      totalPages={auditPage.totalPages}
    />
  );
}

function AdminTabs({
  activeTab,
  counts,
}: {
  activeTab: AdminTabValue;
  counts: AdminTabCounts;
}) {
  return (
    <nav
      aria-label="관리자 항목"
      className="border-b border-[#d9dee7]"
    >
      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        {adminTabs.map((tab) => {
          const active = tab.value === activeTab;

          return (
            <Link
              key={tab.value}
              href={getAdminTabHref(tab.value)}
              aria-current={active ? "page" : undefined}
              className={[
                "group relative flex min-w-32 shrink-0 cursor-pointer flex-col gap-1 rounded-t-md border border-transparent px-4 py-3 text-left transition-colors",
                active
                  ? "border-[#c9dddb] border-b-white bg-white text-[#0f5553]"
                  : "text-[#394150] hover:border-[#c7dfdc] hover:bg-[#e7f5f3] hover:text-[#12343b]",
              ].join(" ")}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                {tab.label}
                {counts[tab.value] ? (
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs font-semibold transition-colors",
                      active
                        ? "bg-[#d7eceb] text-[#0f5553]"
                        : "bg-[#e9edf3] text-[#697386] group-hover:bg-white group-hover:text-[#12343b]",
                    ].join(" ")}
                  >
                    {counts[tab.value]}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-[#697386] transition-colors group-hover:text-[#44515f]">
                {tab.description}
              </span>
              <span
                aria-hidden="true"
                className={[
                  "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#196b69] transition-opacity",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-45",
                ].join(" ")}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function getAdminTabHref(tab: AdminTabValue) {
  return tab === "departments" ? "/admin" : `/admin?tab=${tab}`;
}

function getAuditLogFilters(
  params: AdminPageSearchParams,
): AdminAuditLogSearchFilters {
  return {
    query: normalizeTextParam(params.q),
    status: normalizeAuditStatus(params.status),
    actorId: normalizeActorId(params.user),
    dateFrom: normalizeDate(params.dateFrom),
    dateTo: normalizeDate(params.dateTo),
    page: normalizePage(params.page),
  };
}

function getLoginHistoryFilters(
  params: AdminPageSearchParams,
): AdminLoginHistorySearchFilters {
  return {
    query: normalizeTextParam(params.q),
    result: normalizeLoginResult(params.result),
    userId: normalizeActorId(params.user),
    dateFrom: normalizeDate(params.dateFrom),
    dateTo: normalizeDate(params.dateTo),
    page: normalizePage(params.page),
  };
}

function normalizeAdminTab(value: SearchParamValue): AdminTabValue {
  const tab = getSingleParam(value);

  return adminTabs.some((item) => item.value === tab)
    ? (tab as AdminTabValue)
    : "departments";
}

function normalizeLoginResult(
  value: SearchParamValue,
): AdminLoginHistoryResultFilter {
  const result = getSingleParam(value);

  return result === "success" || result === "failure" ? result : "all";
}

function normalizeAuditStatus(
  value: SearchParamValue,
): AdminAuditLogStatusFilter {
  const status = getSingleParam(value);

  return status && isAuditActionValue(status) ? status : "all";
}

function normalizeActorId(value: SearchParamValue) {
  const actorId = getSingleParam(value)?.trim();

  return actorId ? actorId : "all";
}

function normalizeTextParam(value: SearchParamValue) {
  return getSingleParam(value)?.trim() ?? "";
}

function normalizePage(value: SearchParamValue) {
  const page = Number(getSingleParam(value));

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeDate(value: SearchParamValue) {
  const date = getSingleParam(value);

  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
