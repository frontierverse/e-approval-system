import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function NewResourceLoading() {
  return (
    <RouteLoadingShell
      title="자료 업로드"
      description="직원들과 공유할 업무 자료나 공지사항을 등록합니다."
      variant="resources"
    />
  );
}
