import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="업무 홈"
      description="결재 대기 문서, 진행 중인 요청 문서, 완료 문서 현황을 확인합니다."
      variant="home"
    />
  );
}
