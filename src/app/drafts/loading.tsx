import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="임시저장함"
      description="작성 중이거나 회수한 문서를 이어서 수정하고 결재 요청합니다."
      variant="document"
    />
  );
}
