import { PageTitle } from "@/components/page-title";

export function RouteLoadingShell({
  title,
  description,
  titleAccessory,
  descriptionAccessory,
  action,
  variant = "document",
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  titleAccessory?: React.ReactNode;
  descriptionAccessory?: React.ReactNode;
  action?: React.ReactNode;
  variant?:
    | "home"
    | "document"
    | "draft"
    | "admin"
    | "adminStaff"
    | "account"
    | "notifications"
    | "resources"
    | "documentDetail";
}) {
  return (
    <>
      <PageTitle
        title={title}
        description={description}
        titleAccessory={titleAccessory}
        descriptionAccessory={descriptionAccessory}
        action={action}
      />
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
    | "adminStaff"
    | "account"
    | "notifications"
    | "resources"
    | "documentDetail";
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

  if (variant === "adminStaff") {
    return <AdminStaffSkeleton />;
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

  if (variant === "documentDetail") {
    return <DocumentDetailSkeleton />;
  }

  return <DocumentSkeleton />;
}

function HomeSkeleton() {
  return (
    <>
      <section className="grid grid-cols-2 gap-2">
        {["회수 후 보완", "진행 중인 내 기안"].map((label) => (
          <SummaryCardSkeleton key={label} label={label} />
        ))}
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-2 xl:items-start">
        <HomePanelSkeleton title="내 기안 진행" rows={2} />
        <HomePanelSkeleton title="내 관련 문서의 최근 변경" rows={2} />
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

function DocumentDetailSkeleton() {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="space-y-6">
        <article className="rounded-md border border-[#d9dee7] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eef1f5] pb-4">
            <div>
              <p className="text-sm font-semibold text-[#697386]">문서 상태</p>
              <div className="mt-2 flex items-center gap-3">
                <SkeletonBlock className="h-7 w-20" />
                <SkeletonBlock className="h-4 w-16" />
              </div>
              <SkeletonBlock className="mt-3 h-2 w-48 max-w-full rounded-full" />
            </div>
            <div className="grid gap-2 text-right">
              {[0, 1, 2].map((row) => (
                <SkeletonBlock key={row} className="h-4 w-32" />
              ))}
            </div>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {["작성자", "작성자 소속", "카테고리", "현재 결재자", "첨부파일", "보관 정책"].map(
              (label, index) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-[#697386]">
                    {label}
                  </dt>
                  <dd className="mt-2">
                    {index === 0 || index === 3 ? (
                      <PersonSkeleton />
                    ) : (
                      <SkeletonBlock className="h-4 w-36 max-w-full" />
                    )}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </article>

        <PanelSkeleton title="문서 본문" rows={4} />
        <PanelSkeleton title="첨부파일" rows={2} />
        <div className="xl:hidden">
          <PanelSkeleton title="결재 진행" rows={3} />
        </div>
        <PanelSkeleton title="감사 이력" rows={3} />
      </div>

      <aside className="scrollbar-stable self-start space-y-6 xl:sticky xl:top-0 xl:max-h-[calc(100vh-10.25rem)] xl:overflow-y-auto">
        <article className="rounded-md border border-[#d9dee7] bg-white p-5">
          <p className="text-base font-semibold text-[#16181d]">결재 처리</p>
          <SkeletonBlock className="mt-4 h-20 w-full" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </article>
        <div className="hidden xl:block">
          <PanelSkeleton title="결재선" rows={3} />
        </div>
      </aside>
    </section>
  );
}

function DraftSkeleton() {
  return (
    <form className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 xl:col-start-1 xl:row-start-1">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <FieldSkeleton label="제목" />
          <FieldSkeleton label="문서 양식" />
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            기안 내용
          </p>
          <SkeletonBlock className="mt-2 h-56 w-full" />
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            첨부파일
          </p>
          <SkeletonBlock className="mt-2 h-14 w-full" />
          <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
        </div>
      </section>

      <aside className="scrollbar-stable self-start rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 xl:sticky xl:top-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:max-h-[calc(100vh-10.25rem)] xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-[var(--foreground)]">
              결재선
            </p>
            <SkeletonBlock className="mt-1 h-3 w-24" />
          </div>
          <SkeletonBlock className="h-6 w-10" />
        </div>

        <div className="mt-3">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            지정된 결재자
          </p>
          <div className="mt-2 flex min-h-16 items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5">
            <SkeletonBlock className="size-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <PersonSkeleton />
            </div>
            <SkeletonBlock className="h-6 w-14 shrink-0" />
          </div>
        </div>
      </aside>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 xl:col-start-1 xl:row-start-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#16181d]">
              저장 및 결재 요청
            </p>
            <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
          </div>
          <div className="flex justify-end gap-2 sm:shrink-0">
            <SkeletonBlock className="h-11 w-24" />
            <SkeletonBlock className="h-11 w-24" />
          </div>
        </div>
      </section>
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
          {[
            "부서",
            "직급",
            "문서 양식",
            "첨부 정책",
            "감사 로그",
            "로그인 이력",
          ].map((label) => (
              <div
                key={label}
                className="min-w-32 shrink-0 rounded-t-md bg-white/70 px-4 py-3"
              >
                <p className="text-sm font-semibold text-[#697386]">{label}</p>
                <SkeletonBlock className="mt-2 h-3 w-16" />
              </div>
          ))}
        </div>
      </section>

      <PanelSkeleton title="부서 관리" rows={5} />
    </div>
  );
}

function AdminStaffSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <PanelSkeleton title="직원 추가" rows={6} />
      <PanelSkeleton title="직원 정보" rows={5} />
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
    <article className="flex min-h-16 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:min-h-[4.25rem] sm:px-3.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[var(--foreground)] sm:text-sm">
          {label}
        </p>
        <SkeletonBlock className="mt-1 hidden h-3 w-16 sm:block" />
      </div>
      <SkeletonBlock className="h-7 w-12 shrink-0" />
    </article>
  );
}

function HomePanelSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex min-h-12 items-center justify-between border-b border-[var(--border)] px-4">
        <p className="text-sm font-semibold text-[var(--foreground)] sm:text-base">
          {title}
        </p>
        <SkeletonBlock className="h-4 w-12" />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="px-4 py-2.5">
            <SkeletonBlock className="h-4 w-3/5" />
            <SkeletonBlock className="mt-1.5 h-3 w-4/5" />
          </div>
        ))}
      </div>
    </section>
  );
}

function PanelSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-base font-semibold text-[var(--foreground)]">{title}</p>
      <div className="mt-5 divide-y divide-[var(--border)]">
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
      className={`animate-pulse rounded-md bg-[var(--surface-muted)] motion-reduce:animate-none ${className}`}
    />
  );
}
