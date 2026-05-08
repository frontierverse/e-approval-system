import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      title="기안작성"
      description="문서 양식을 선택하고 결재 문서를 작성합니다."
      message="기안 양식을 불러오는 중입니다."
    />
  );
}
