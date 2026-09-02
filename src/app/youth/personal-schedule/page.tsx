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
import { getYouthPersonalSchedules } from "@/lib/youth-personal-schedules";
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
  const [params, youths] = await Promise.all([
    searchParams,
    getAdmittedYouthDirectory(),
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
  const permissions = getEffectiveYouthPermissions(user);

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
        updateSchedule={updateYouthPersonalScheduleAction}
        youths={youths}
      />
    </>
  );
}

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
