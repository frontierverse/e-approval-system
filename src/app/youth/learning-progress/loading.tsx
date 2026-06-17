import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function YouthLearningProgressLoading() {
  return (
    <RouteLoadingShell
      title="학습진도"
      description="청소년별 학습진도 현황을 불러오는 중입니다."
      variant="resources"
    />
  );
}
