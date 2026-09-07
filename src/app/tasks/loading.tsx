import { PageTitle } from "@/components/page-title";
import { MyStaffTasksSkeleton } from "@/components/my-staff-tasks";

export default function Loading() {
  return <><PageTitle title="내 할 일" description="완료한 업무에 체크해 주세요." compact /><MyStaffTasksSkeleton /></>;
}
