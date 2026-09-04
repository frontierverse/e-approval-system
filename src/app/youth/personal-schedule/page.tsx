import type { Metadata } from "next";
import {
  createYouthPersonalScheduleAction,
  deleteYouthPersonalScheduleAction,
  updateYouthPersonalScheduleAction,
} from "@/app/youth/personal-schedule/actions";
import { PageTitle } from "@/components/page-title";
import {
  YouthPersonalScheduleCalendarBoard,
  YouthPersonalScheduleStudentSelect,
} from "@/components/youth-personal-schedule-calendar-board";
import { getAdmittedYouthDirectory } from "@/lib/youth-management";
import {
  getYouthPersonalSchedules,
  getYouthPersonalScheduleStaffDirectory,
} from "@/lib/youth-personal-schedules";
import { requireYouthBasicAccess } from "@/lib/youth-permissions";
import { getEffectiveYouthPermissions } from "@/lib/youth-permissions-core";
import { normalizeWorkScheduleMonth } from "@/lib/work-schedule-calendar";

export const metadata: Metadata = {
  title: "개인 일정표",
};

type SearchParamValue = string | string[] | undefined;

type YouthPersonalSchedulePageProps = {
  searchParams: Promise<{
    month?: SearchParamValue;
    youthId?: SearchParamValue;
  }>;
};

export default async function YouthPersonalSchedulePage({
  searchParams,
}: YouthPersonalSchedulePageProps) {
  const user = await requireYouthBasicAccess();
  const permissions = getEffectiveYouthPermissions(user);
  const [params, youths, staffDirectory] = await Promise.all([
    searchParams,
    getAdmittedYouthDirectory(),
    permissions.canManageYouth
      ? getYouthPersonalScheduleStaffDirectory()
      : Promise.resolve([]),
  ]);
  const selectedMonth = normalizeWorkScheduleMonth(getSingleParam(params.month));
  const requestedYouthId = getSingleParam(params.youthId);
  const selectedYouthId =
    youths.find((youth) => youth.id === requestedYouthId)?.id ??
    youths[0]?.id ??
    "";
  const schedules = selectedYouthId
    ? await getYouthPersonalSchedules(selectedYouthId, selectedMonth)
    : [];

  return (
    <>
      <PageTitle
        title="개인 일정표"
        titleAccessory={
          <YouthPersonalScheduleStudentSelect
            selectedMonth={selectedMonth}
            selectedYouthId={selectedYouthId}
            youths={youths}
          />
        }
      />
      <YouthPersonalScheduleCalendarBoard
        canManage={permissions.canManageYouth}
        createSchedule={createYouthPersonalScheduleAction}
        deleteSchedule={deleteYouthPersonalScheduleAction}
        schedules={schedules}
        selectedMonth={selectedMonth}
        selectedYouthId={selectedYouthId}
        staffDirectory={staffDirectory}
        updateSchedule={updateYouthPersonalScheduleAction}
        youths={youths}
      />
    </>
  );
}

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
