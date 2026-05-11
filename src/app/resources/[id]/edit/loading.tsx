import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function EditResourceLoading() {
  return (
    <RouteLoadingShell
      title="자료 수정"
      description="등록한 자료의 제목, 내용, 첨부파일을 수정합니다."
      variant="resources"
    />
  );
}
