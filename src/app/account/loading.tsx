import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="내 계정"
      description="로그인 정보와 비밀번호를 관리합니다."
      variant="account"
    />
  );
}
