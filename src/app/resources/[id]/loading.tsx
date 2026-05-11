import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function ResourceDetailLoading() {
  return (
    <RouteLoadingShell
      title="자료 상세"
      description="자료 내용과 첨부파일을 불러오는 중입니다."
      variant="resources"
    />
  );
}
