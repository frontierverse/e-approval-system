import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="받은결재함"
      description="현재 로그인한 사용자가 승인 또는 반려해야 할 결재 문서를 모아보는 화면입니다."
      message="문서 목록을 불러오는 중입니다."
    />
  );
}
