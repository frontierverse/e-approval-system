import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="관리 설정"
      description="부서, 직급, 문서 양식 같은 기준 정보를 관리하는 화면입니다."
      variant="admin"
    />
  );
}
