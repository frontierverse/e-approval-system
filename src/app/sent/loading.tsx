import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="제출 문서함"
      description="내가 작성하고 결재 요청한 문서의 진행 상태를 확인하는 화면입니다."
      variant="document"
    />
  );
}
