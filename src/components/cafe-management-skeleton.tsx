export function CafeManagementSkeleton() {
  return (
    <div className="space-y-5">
      <CafeItemRegistrationSkeleton />
      <CafeItemListSkeleton />
    </div>
  );
}

export function CafeItemRegistrationSkeleton() {
  return (
    <section
      aria-label="카페 물품 등록 로딩"
      className="rounded-md border border-[#d9dee7] bg-white p-5 shadow-sm"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] pb-4">
        <h2 className="text-base font-semibold text-[#16181d]">물품 등록</h2>
        <CafeSkeletonBlock className="h-10 w-20" />
      </div>

      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-4">
        <CafeFieldSkeleton className="lg:col-span-2" label="물품명" />
        <CafeFieldSkeleton label="물품 종류" />
        <CafeDateFieldSkeleton className="lg:col-span-2" label="구매일" />
        <CafeDateFieldSkeleton className="lg:col-span-2" label="유통기한" />
        <CafeFieldSkeleton label="가격" />
        <CafeFieldSkeleton className="lg:col-span-2" label="구매 사유" />
      </div>
    </section>
  );
}

export function CafeItemListSkeleton() {
  return (
    <section
      aria-label="카페 물품 목록 로딩"
      className="rounded-md border border-[#d9dee7] bg-white shadow-sm"
    >
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              물품 목록
            </h2>
            <CafeSkeletonBlock className="mt-2 h-4 w-40" />
          </div>
          <CafeSkeletonBlock className="h-8 w-32" />
        </div>

        <div className="mt-4 flex min-w-0 flex-wrap items-end gap-2">
          <CafeFieldSkeleton className="w-56" label="검색" />
          <CafeFieldSkeleton className="w-36" label="종류" />
          <CafeFieldSkeleton className="w-44" label="사용 기한" />
          <CafeSkeletonBlock className="h-10 w-20" />
          <CafeSkeletonBlock className="h-10 w-20" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="w-full min-w-[1080px] text-sm">
          <div className="grid grid-cols-[18rem_8rem_9rem_10rem_9rem_8rem_minmax(16rem,1fr)] border-b border-[#eef1f5] bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
            {[
              "물품",
              "종류",
              "구매일",
              "사용 기한",
              "유통기한",
              "가격",
              "구매 사유",
            ].map((label) => (
              <div key={label} className="px-6 py-3.5">
                {label}
              </div>
            ))}
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="grid grid-cols-[18rem_8rem_9rem_10rem_9rem_8rem_minmax(16rem,1fr)] border-b border-[#eef1f5] last:border-b-0"
            >
              <div className="px-6 py-5">
                <CafeSkeletonBlock className="h-4 w-40 max-w-full" />
                <CafeSkeletonBlock className="mt-2 h-3 w-24" />
              </div>
              <CafeTableCellSkeleton />
              <CafeTableCellSkeleton />
              <div className="px-6 py-5">
                <CafeSkeletonBlock className="h-8 w-16 rounded-md" />
                <CafeSkeletonBlock className="mt-2 h-3 w-20" />
              </div>
              <CafeTableCellSkeleton />
              <CafeTableCellSkeleton />
              <div className="px-6 py-5">
                <CafeSkeletonBlock className="h-4 w-48 max-w-full" />
                <CafeSkeletonBlock className="mt-2 h-4 w-32 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4">
        <CafeSkeletonBlock className="h-4 w-20" />
        <div className="flex gap-2">
          <CafeSkeletonBlock className="h-10 w-16" />
          <CafeSkeletonBlock className="h-10 w-16" />
        </div>
      </div>
    </section>
  );
}

function CafeDateFieldSkeleton({
  className = "",
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <div className={`block min-w-0 ${className}`}>
      <p className="text-xs font-semibold text-[#697386]">{label}</p>
      <div className="mt-2 grid min-w-0 grid-cols-3 gap-2">
        <CafeSkeletonBlock className="h-10 w-full" />
        <CafeSkeletonBlock className="h-10 w-full" />
        <CafeSkeletonBlock className="h-10 w-full" />
      </div>
    </div>
  );
}

function CafeFieldSkeleton({
  className = "",
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <div className={`block min-w-0 ${className}`}>
      <p className="text-xs font-semibold text-[#697386]">{label}</p>
      <CafeSkeletonBlock className="mt-2 h-10 w-full" />
    </div>
  );
}

function CafeTableCellSkeleton() {
  return (
    <div className="px-6 py-5">
      <CafeSkeletonBlock className="h-4 w-24 max-w-full" />
    </div>
  );
}

function CafeSkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-[#edf1f5] ${className}`}
    />
  );
}
