import { EmptyState } from "@/components/empty-state";
import { CompanyBusinessInfoEditModal } from "@/components/company-business-info-form";
import { UserAvatar } from "@/components/user-avatar";
import type {
  CompanyInfoAdmittedYouth,
  CompanyInfoBusiness,
  CompanyInfoData,
  CompanyInfoStaffMember,
} from "@/lib/company-info";

export function CompanyInfoBoard({ data }: { data: CompanyInfoData }) {
  return (
    <section className="space-y-6" aria-label="회사 정보">
      <BusinessInfoSection data={data} />
      <StaffSection staff={data.staff} />
      <AdmittedYouthSection youths={data.admittedYouths} />
    </section>
  );
}

export function CompanyInfoSkeleton() {
  return (
    <section className="space-y-6" aria-label="회사 정보 불러오는 중">
      <SkeletonPanel title="사업자 정보" rows={8} />
      <SkeletonPanel title="직원 목록" rows={5} />
      <SkeletonPanel title="입소중 청소년 목록" rows={5} />
    </section>
  );
}

function BusinessInfoSection({ data }: { data: CompanyInfoData }) {
  return (
    <section
      id="business"
      aria-labelledby="business-info-title"
      className="rounded-md border border-[#d9dee7] bg-white"
    >
      <SectionHeader
        title="사업자 정보"
        description={`${data.business.appName} · ${data.business.activeDepartmentCount}개 부서 · 직원 ${data.business.activeStaffCount}명 · 입소중 청소년 ${data.business.admittedYouthCount}명`}
      />
      <div className="border-t border-[#eef1f5]">
        {data.business.businesses.map((business, index) => (
          <BusinessInfoItem
            key={business.id}
            business={business}
            canManage={data.business.canManageBusinessInfo}
            showTopBorder={index > 0}
          />
        ))}
        <div className="border-t border-[#eef1f5] px-4 py-3 text-sm text-[#697386]">
          기준일 {formatDate(data.business.referenceDate)}
        </div>
      </div>
    </section>
  );
}

function BusinessInfoItem({
  business,
  canManage,
  showTopBorder,
}: {
  business: CompanyInfoBusiness;
  canManage: boolean;
  showTopBorder: boolean;
}) {
  const rows = [
    {
      label: "사업자명",
      value: canManage ? (
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {business.name}
          </span>
          <CompanyBusinessInfoEditModal business={business} />
        </span>
      ) : (
        business.name
      ),
    },
    {
      label: "대표자",
      value: business.representative?.name ?? "미등록",
    },
    {
      label: "사업자등록번호",
      value: business.registrationNumber ?? "미등록",
    },
    {
      label: "소재지",
      value: business.address ?? "미등록",
    },
  ];

  return (
    <div className={showTopBorder ? "border-t border-[#eef1f5]" : undefined}>
      <dl
        className="grid gap-px bg-[#eef1f5] text-sm sm:grid-cols-2 xl:grid-cols-4"
      >
        {rows.map((row) => (
          <div key={row.label} className="min-w-0 bg-white px-4 py-4">
            <dt className="text-xs font-semibold text-[#697386]">
              {row.label}
            </dt>
            <dd className="mt-1 break-words font-medium text-[#16181d] [overflow-wrap:anywhere]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StaffSection({ staff }: { staff: CompanyInfoStaffMember[] }) {
  return (
    <section
      id="staff"
      aria-labelledby="staff-list-title"
      className="rounded-md border border-[#d9dee7] bg-white"
    >
      <SectionHeader
        title="직원 목록"
        description={`재직 직원 ${staff.length}명`}
      />
      {staff.length > 0 ? (
        <div className="overflow-x-auto border-t border-[#eef1f5]">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
              <tr className="border-b border-[#d9dee7]">
                <th scope="col" className="px-4 py-3">
                  이름
                </th>
                <th scope="col" className="px-4 py-3">
                  부서
                </th>
                <th scope="col" className="px-4 py-3">
                  직급
                </th>
                <th scope="col" className="px-4 py-3">
                  이메일
                </th>
                <th scope="col" className="px-4 py-3">
                  입사일
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f5]">
              {staff.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={member} decorative />
                      <span className="min-w-0 break-words font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                        {member.name}
                      </span>
                    </div>
                  </td>
                  <TableCell>{member.departmentName}</TableCell>
                  <TableCell>{member.positionName}</TableCell>
                  <TableCell>{member.email ?? "미등록"}</TableCell>
                  <TableCell>{formatOptionalDate(member.hireDate)}</TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-[#eef1f5] p-4">
          <EmptyState
            title="표시할 직원이 없습니다."
            description="활성 상태의 재직 직원이 등록되면 이곳에 표시됩니다."
          />
        </div>
      )}
    </section>
  );
}

function AdmittedYouthSection({
  youths,
}: {
  youths: CompanyInfoAdmittedYouth[];
}) {
  return (
    <section
      id="admitted-youths"
      aria-labelledby="admitted-youth-list-title"
      className="rounded-md border border-[#d9dee7] bg-white"
    >
      <SectionHeader
        title="입소중 청소년 목록"
        description={`입소중 청소년 ${youths.length}명`}
      />
      {youths.length > 0 ? (
        <div className="overflow-x-auto border-t border-[#eef1f5]">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
              <tr className="border-b border-[#d9dee7]">
                <th scope="col" className="px-4 py-3">
                  이름
                </th>
                <th scope="col" className="px-4 py-3">
                  나이
                </th>
                <th scope="col" className="px-4 py-3">
                  입소 날짜
                </th>
                <th scope="col" className="px-4 py-3">
                  퇴소 예정
                </th>
                <th scope="col" className="px-4 py-3">
                  연락처
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f5]">
              {youths.map((youth) => (
                <tr key={youth.id}>
                  <td className="px-4 py-3 font-semibold text-[#16181d]">
                    {youth.name}
                  </td>
                  <TableCell>
                    {youth.age === null ? "미등록" : `${youth.age}세`}
                  </TableCell>
                  <TableCell>{formatOptionalDate(youth.admissionDate)}</TableCell>
                  <TableCell>
                    {youth.dischargeDate
                      ? formatDate(youth.dischargeDate)
                      : "입소중"}
                  </TableCell>
                  <TableCell>{youth.phone ?? "미등록"}</TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-[#eef1f5] p-4">
          <EmptyState
            title="입소중 청소년이 없습니다."
            description="입소 상태의 청소년이 등록되면 이곳에 표시됩니다."
          />
        </div>
      )}
    </section>
  );
}

function SectionHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  const titleId =
    title === "사업자 정보"
      ? "business-info-title"
      : title === "직원 목록"
        ? "staff-list-title"
        : "admitted-youth-list-title";

  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
      <h2 id={titleId} className="text-base font-semibold text-[#16181d]">
        {title}
      </h2>
      <p className="text-sm text-[#697386]">{description}</p>
    </div>
  );
}

function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="break-words px-4 py-3 text-[#394150] [overflow-wrap:anywhere]">
      {children}
    </td>
  );
}

function SkeletonPanel({ rows, title }: { rows: number; title: string }) {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white dark:border-[#30363d] dark:bg-[#161b22]">
      <div className="flex items-end justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-base font-semibold text-[#16181d] dark:text-[#e6edf3]">
            {title}
          </p>
          <SkeletonBlock className="mt-2 h-3 w-40" />
        </div>
        <SkeletonBlock className="h-4 w-20" />
      </div>
      <div className="space-y-3 border-t border-[#eef1f5] p-4 dark:border-[#30363d]">
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonBlock key={index} className="h-10 w-full" />
        ))}
      </div>
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-[#e5e9f0] dark:bg-[#2a3038] ${className}`}
    />
  );
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "미등록";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  return year && month && day ? `${year}. ${month}. ${day}.` : value;
}
