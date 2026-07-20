const lunchBoxCalendarWeekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export function LunchBoxManagementSkeleton() {
  return (
    <div className="space-y-6">
      <section
        aria-label="도시락 현황 로딩"
        className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm"
      >
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#eef1f5] px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <LunchBoxSkeletonBlock className="h-6 w-32" />
            <LunchBoxSkeletonBlock className="mt-2 h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <LunchBoxSkeletonBlock className="h-10 w-20" />
            <LunchBoxSkeletonBlock className="h-10 w-20" />
            <LunchBoxSkeletonBlock className="h-10 w-20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 text-sm">
            {lunchBoxCalendarWeekdayLabels.map((label) => (
              <div
                key={label}
                className="border-b border-r border-[#d9dee7] bg-[#f7f9fc] px-3 py-3 text-center text-xs font-semibold text-[#394150]"
              >
                {label}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, index) => (
              <div
                key={index}
                className="h-36 border-b border-r border-[#eef1f5] px-2.5 py-2.5"
              >
                <LunchBoxSkeletonBlock className="size-8 rounded-full" />
                <LunchBoxSkeletonBlock className="mt-2 h-6 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="도시락 변경 기록 로딩">
        <LunchBoxSkeletonBlock className="h-5 w-36" />
        <LunchBoxSkeletonBlock className="mt-2 h-4 w-44" />
        <ol className="mt-3 divide-y divide-[#eef1f5] border-y border-[#d9dee7] bg-white">
          {Array.from({ length: 3 }, (_, index) => (
            <li
              className="grid gap-3 px-4 py-4 lg:grid-cols-[13rem_minmax(0,1fr)]"
              key={index}
            >
              <div>
                <LunchBoxSkeletonBlock className="h-4 w-36" />
                <LunchBoxSkeletonBlock className="mt-3 h-7 w-32 rounded-full" />
              </div>
              <div>
                <LunchBoxSkeletonBlock className="h-7 w-44 rounded-full" />
                <LunchBoxSkeletonBlock className="mt-3 h-4 w-72 max-w-full" />
                <LunchBoxSkeletonBlock className="mt-3 h-12 w-full" />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function LunchBoxSkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-[#edf1f5] ${className}`}
    />
  );
}
