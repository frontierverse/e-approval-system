import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="알림"
      description="결재 요청, 승인, 반려, 완료 알림을 확인합니다."
      variant="notifications"
    />
  );
}
