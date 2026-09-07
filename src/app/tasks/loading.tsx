import { PageTitle } from "@/components/page-title";
import { MyStaffTasksSkeleton } from "@/components/my-staff-tasks";

export default function Loading() {
  return <><PageTitle title="내 할 일" compact /><MyStaffTasksSkeleton /></>;
}
