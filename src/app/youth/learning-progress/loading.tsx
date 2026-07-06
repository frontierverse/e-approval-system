import { PageTitle } from "@/components/page-title";

export default function YouthLearningProgressLoading() {
  return (
    <>
      <PageTitle
        title="학습진도"
        description="과목별 소단원 개념을 학생마다 숙지했는지 체크리스트로 기록합니다."
      />

      <div aria-label="학습진도 체크리스트 로딩" className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="h-10 w-20 animate-pulse rounded-md border border-[#e3e7ee] bg-[#eef1f5]"
            />
          ))}
        </div>

        <div className="h-12 animate-pulse rounded-md border border-[#e3e7ee] bg-[#eef1f5]" />

        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="rounded-md border border-[#d9dee7] bg-white shadow-sm"
          >
            <div className="border-b border-[#eef1f5] bg-[#f7f9fc] px-4 py-2.5">
              <div className="h-4 w-48 animate-pulse rounded bg-[#eef1f5]" />
            </div>
            <div className="flex flex-col gap-3 px-4 py-4">
              {Array.from({ length: 3 }, (_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="h-4 w-full max-w-96 animate-pulse rounded bg-[#f3f5f9]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
