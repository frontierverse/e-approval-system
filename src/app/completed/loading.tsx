import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="완료문서함"
      description="승인완료 또는 반려로 처리가 끝난 문서를 확인하는 화면입니다."
      message="문서 목록을 불러오는 중입니다."
    />
  );
}
