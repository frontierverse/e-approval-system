import { PageTitle } from "@/components/page-title";

export function RouteLoadingShell({
  title,
  description,
  variant = "document",
}: {
  title: string;
  description: string;
  variant?:
    | "home"
    | "document"
    | "draft"
    | "admin"
    | "account"
    | "notifications"
    | "resources";
}) {
  return (
    <>
      <PageTitle title={title} description={description} />
      <RouteContentSkeleton variant={variant} />
    </>
  );
}

export function RouteContentSkeleton({
  variant,
}: {
  variant:
    | "home"
    | "document"
    | "draft"
    | "admin"
    | "account"
    | "notifications"
    | "resources";
}) {
  if (variant === "home") {
    return <HomeSkeleton />;
  }

  if (variant === "draft") {
    return <DraftSkeleton />;
  }

  if (variant === "admin") {
    return <AdminSkeleton />;
  }

  if (variant === "account") {
    return <AccountSkeleton />;
  }

  if (variant === "notifications") {
    return <NotificationSkeleton />;
  }

  if (variant === "resources") {
    return <ResourcesSkeleton />;
  }

  return <DocumentSkeleton />;
}

function HomeSkeleton() {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        {[
          "임시저장/회수",
          "받은 결재 대기",
          "진행 중 결재 요청",
          "완료 문서",
        ].map((label) => (
          <SummaryCardSkeleton key={label} label={label} />
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_22rem]">
        <PanelSkeleton title="최근 결재 활동" rows={5} />
        <PanelSkeleton title="내 결재 대기" rows={3} />
      </section>
    </>
  );
}

function DocumentSkeleton() {
  return (
    <>
      <section className="mb-4 rounded-md border border-[#d9dee7] bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_10rem_10rem_auto_auto]">
          <FieldSkeleton label="검색" />
          <FieldSkeleton label="시작일" />
          <FieldSkeleton label="종료일" />
          <FieldSkeleton label="상태" />
          <FieldSkeleton label="정렬" />
          <div className="flex items-end">
            <SkeletonBlock className="h-10 w-full min-w-20" />
          </div>
          <div className="hidden items-end lg:flex">
            <SkeletonBlock className="h-10 w-full min-w-20" />
          </div>
        </div>
        <SkeletonBlock className="mt-3 h-3 w-36" />
      </section>

      <DocumentResultsSkeleton />
    </>
  );
}

export function DocumentResultsSkeleton() {
  return (
    <>
      <section className="overflow-hidden rounded-md border border-[#d9dee7] bg-white">
        <div className="hidden lg:block">
          <div className="grid grid-cols-[2fr_1fr_1fr_0.7fr_0.8fr_0.8fr] border-b border-[#d9dee7] bg-[#fbfcfd] px-5 py-3 text-xs font-semibold text-[#697386]">
            {["제목", "작성자", "현재 결재자", "진행", "상태", "일자"].map(
              (label) => (
                <span key={label}>{label}</span>
              ),
            )}
          </div>
          {[0, 1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="grid grid-cols-[2fr_1fr_1fr_0.7fr_0.8fr_0.8fr] gap-5 border-b border-[#eef1f5] px-5 py-4 last:border-b-0"
            >
              <div>
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="mt-2 h-3 w-2/5" />
              </div>
              <PersonSkeleton />
              <PersonSkeleton />
              <SkeletonBlock className="h-4 w-10" />
              <SkeletonBlock className="h-6 w-16 rounded-full" />
              <SkeletonBlock className="h-4 w-20" />
            </div>
          ))}
        </div>

        <div className="divide-y divide-[#eef1f5] lg:hidden">
          {[0, 1, 2].map((row) => (
            <div key={row} className="p-4">
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="mt-2 h-3 w-1/2" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <PersonSkeleton />
                <PersonSkeleton />
                <SkeletonBlock className="h-4 w-12" />
                <SkeletonBlock className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function DraftSkeleton() {
  return (
    <form className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-md border border-[#d9dee7] bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <FieldSkeleton label="제목" />
          <FieldSkeleton label="문서 분류" />
        </div>

        <div className="mt-5">
          <FieldSkeleton label="문서 양식" />
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-[#394150]">기안 내용</p>
          <SkeletonBlock className="mt-2 h-72 w-full" />
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-[#394150]">첨부파일</p>
          <SkeletonBlock className="mt-2 h-11 w-full" />
          <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <SkeletonBlock className="h-10 w-24" />
          <SkeletonBlock className="h-10 w-24" />
        </div>
      </section>

      <aside className="rounded-md border border-[#d9dee7] bg-white p-5">
        <p className="text-base font-semibold text-[#16181d]">결재선</p>
        <div className="mt-4 grid gap-3">
          <FieldSkeleton label="부서" />
          <FieldSkeleton label="결재자 검색" />
        </div>
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="rounded-md border border-[#eef1f5] p-3"
            >
              <PersonSkeleton />
            </div>
          ))}
        </div>
      </aside>
    </form>
  );
}

function AdminSkeleton() {
  return (
    <div className="grid gap-6">
      <section
        aria-label="관리자 항목 불러오는 중"
        className="border-b border-[#d9dee7]"
      >
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {["사용자", "부서", "직급", "문서 양식", "첨부 정책", "감사 로그"].map(
            (label) => (
              <div
                key={label}
                className="min-w-32 shrink-0 rounded-t-md bg-white/70 px-4 py-3"
              >
                <p className="text-sm font-semibold text-[#697386]">{label}</p>
                <SkeletonBlock className="mt-2 h-3 w-16" />
              </div>
            ),
          )}
        </div>
      </section>

      <PanelSkeleton title="사용자 관리" rows={5} />
    </div>
  );
}

function AccountSkeleton() {
  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        <article className="rounded-md border border-[#d9dee7] bg-white p-5">
          <p className="text-base font-semibold text-[#16181d]">계정 정보</p>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            <SkeletonBlock className="size-24 rounded-full" />
            <dl className="grid flex-1 gap-4 text-sm sm:grid-cols-2">
              {["이름", "이메일", "부서", "직급"].map((label) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-[#697386]">
                    {label}
                  </dt>
                  <dd>
                    <SkeletonBlock className="mt-2 h-4 w-32" />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </article>

        <PanelSkeleton title="프로필 이미지" rows={2} />
      </div>

      <PanelSkeleton title="비밀번호 변경" rows={4} />
    </section>
  );
}

function NotificationSkeleton() {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white">
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="grid gap-2 border-b border-[#eef1f5] px-5 py-4 last:border-b-0"
        >
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-6 w-16 rounded-full" />
            <SkeletonBlock className="h-6 w-20 rounded-full" />
            <SkeletonBlock className="ml-auto h-3 w-24" />
          </div>
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-3 w-full" />
        </div>
      ))}
    </section>
  );
}

function ResourcesSkeleton() {
  return (
    <>
      <section className="mb-4 rounded-md border border-[#d9dee7] bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto_auto]">
          <FieldSkeleton label="검색" />
          <FieldSkeleton label="분류" />
          <div className="flex items-end">
            <SkeletonBlock className="h-10 w-full min-w-20" />
          </div>
          <div className="hidden items-end lg:flex">
            <SkeletonBlock className="h-10 w-full min-w-20" />
          </div>
        </div>
        <SkeletonBlock className="mt-3 h-3 w-20" />
      </section>

      <PanelSkeleton title="자료 목록" rows={4} />
    </>
  );
}

function SummaryCardSkeleton({ label }: { label: string }) {
  return (
    <article className="rounded-md border border-[#d9dee7] bg-white p-5">
      <p className="text-sm font-medium text-[#697386]">{label}</p>
      <SkeletonBlock className="mt-4 h-9 w-16" />
      <SkeletonBlock className="mt-3 h-3 w-24" />
    </article>
  );
}

function PanelSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5">
      <p className="text-base font-semibold text-[#16181d]">{title}</p>
      <div className="mt-5 divide-y divide-[#eef1f5]">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="py-4 first:pt-0 last:pb-0">
            <SkeletonBlock className="h-4 w-3/5" />
            <SkeletonBlock className="mt-2 h-3 w-4/5" />
          </div>
        ))}
      </div>
    </section>
  );
}

function FieldSkeleton({ label }: { label: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#697386]">{label}</p>
      <SkeletonBlock className="mt-2 h-10 w-full" />
    </div>
  );
}

function PersonSkeleton() {
  return (
    <div>
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="mt-2 h-3 w-32" />
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-[#edf1f5] ${className}`}
    />
  );
}
