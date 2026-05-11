import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function DocumentDetailLoading() {
  return (
    <RouteLoadingShell
      title="문서 상세"
      description="문서 상태, 본문, 첨부파일과 결재선을 불러오는 중입니다."
      variant="documentDetail"
    />
  );
}
