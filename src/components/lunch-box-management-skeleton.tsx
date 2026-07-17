const lunchBoxCalendarWeekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export function LunchBoxManagementSkeleton() {
  return (
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
              className="min-h-[8rem] border-b border-r border-[#eef1f5] px-2.5 py-2.5"
            >
              <LunchBoxSkeletonBlock className="size-8 rounded-full" />
              <LunchBoxSkeletonBlock className="mt-2 h-6 w-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
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
