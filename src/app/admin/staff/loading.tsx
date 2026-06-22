import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="직원 정보"
      description="직원 계정, 권한, 입퇴사일과 조직 정보를 관리하는 화면입니다."
      variant="adminStaff"
    />
  );
}
