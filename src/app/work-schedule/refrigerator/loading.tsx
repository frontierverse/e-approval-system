import { PageTitle } from "@/components/page-title";

export default function WorkScheduleRefrigeratorLoading() {
  return (
    <>
      <PageTitle
        title="냉장고 관리"
        description="냉장고 보관 물품과 점검 상태를 관리합니다."
      />

      <div
        aria-label="냉장고 관리 불러오는 중"
        className="grid min-w-0 gap-5 lg:grid-cols-2"
      >
        {["바자울 1", "바자울 2"].map((title) => (
          <section
            key={title}
            className="min-w-0 overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
              <div>
                <span className="block h-5 w-20 animate-pulse rounded-md bg-[#edf1f5]" />
                <span className="mt-2 block h-4 w-32 animate-pulse rounded-md bg-[#edf1f5]" />
              </div>
              <span className="block h-9 w-16 animate-pulse rounded-md bg-[#edf1f5]" />
            </div>
            <div className="space-y-3 px-5 py-5">
              <span className="block h-4 w-full animate-pulse rounded-md bg-[#edf1f5]" />
              <span className="block h-4 w-5/6 animate-pulse rounded-md bg-[#edf1f5]" />
              <span className="block h-4 w-2/3 animate-pulse rounded-md bg-[#edf1f5]" />
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
