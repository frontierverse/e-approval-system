import { ChangePasswordForm } from "@/components/change-password-form";
import { PageTitle } from "@/components/page-title";
import { ProfileImageForm } from "@/components/profile-image-form";
import { UserAvatar } from "@/components/user-avatar";
import { requireUser } from "@/lib/auth";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageTitle
        title="내 계정"
        description="로그인 정보와 비밀번호를 관리합니다."
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <article className="rounded-md border border-[#d9dee7] bg-white p-5">
            <h2 className="text-base font-semibold">계정 정보</h2>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
              <UserAvatar user={user} size="lg" />
              <dl className="grid flex-1 gap-4 text-sm sm:grid-cols-2">
                <SummaryItem label="이름" value={user.name} />
                <SummaryItem label="이메일" value={user.email} />
                <SummaryItem label="부서" value={user.department.name} />
                <SummaryItem label="직급" value={user.position.name} />
              </dl>
            </div>
          </article>

          <article className="rounded-md border border-[#d9dee7] bg-white p-5">
            <h2 className="text-base font-semibold">프로필 이미지</h2>
            <p className="mt-2 text-sm text-[#697386]">
              이미지가 없으면 이름 첫 글자가 기본 이미지로 표시됩니다.
            </p>
            <div className="mt-5">
              <ProfileImageForm
                hasProfileImage={Boolean(user.profileImageStorageKey)}
              />
            </div>
          </article>
        </div>

        <article className="rounded-md border border-[#d9dee7] bg-white p-5">
          <h2 className="text-base font-semibold">비밀번호 변경</h2>
          <p className="mt-2 text-sm text-[#697386]">
            새 비밀번호는 12자 이상 입력하세요.
          </p>
          <div className="mt-5">
            <ChangePasswordForm />
          </div>
        </article>
      </section>
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[#697386]">{label}</dt>
      <dd className="mt-1 font-medium text-[#394150]">{value}</dd>
    </div>
  );
}
