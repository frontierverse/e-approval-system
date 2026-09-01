import type { Metadata } from "next";
import { YouthRosterBoard } from "@/components/youth-roster-board";
import { requireYouthBasicAccess } from "@/lib/youth-permissions";
import { getEffectiveYouthPermissions } from "@/lib/youth-permissions-core";
import {
  getYouthRoster,
  getYouthRosterChangeLogs,
} from "@/lib/youth-roster";
import {
  createYouthAction,
  deleteYouthAction,
  deleteYouthDecisionDocumentAction,
  extendYouthDischargeAction,
  getYouthRosterChangeLogsAction,
  recordYouthContactViewAction,
  recordYouthDetailViewAction,
  updateYouthAction,
} from "@/app/youth/actions";

export const metadata: Metadata = {
  title: "청소년 명단",
};

type SearchParamValue = string | string[] | undefined;

type YouthRosterPageProps = {
  searchParams: Promise<{
    logPage?: SearchParamValue;
  }>;
};

export default async function YouthRosterPage({
  searchParams,
}: YouthRosterPageProps) {
  const user = await requireYouthBasicAccess();
  const permissions = getEffectiveYouthPermissions(user);
  const params = await searchParams;
  const [roster, changeLogResult] = await Promise.all([
    getYouthRoster(permissions),
    getYouthRosterChangeLogs({
      page: getSelectedPage(params.logPage),
      permissions,
    }),
  ]);

  return (
    <YouthRosterBoard
      changeLogFilters={{
        page: changeLogResult.page,
        pageSize: changeLogResult.pageSize,
        total: changeLogResult.total,
        totalPages: changeLogResult.totalPages,
      }}
      changeLogs={changeLogResult.logs}
      createYouth={createYouthAction}
      data={roster}
      deleteYouth={deleteYouthAction}
      deleteDecisionDocument={deleteYouthDecisionDocumentAction}
      extendYouthDischarge={extendYouthDischargeAction}
      loadChangeLogs={getYouthRosterChangeLogsAction}
      pageHeader
      permissions={permissions}
      recordYouthContactView={
        permissions.canViewYouthContacts
          ? recordYouthContactViewAction
          : undefined
      }
      recordYouthDetailView={
        permissions.canViewYouthDetails ? recordYouthDetailViewAction : undefined
      }
      updateYouth={updateYouthAction}
    />
  );
}

function getSelectedPage(value: SearchParamValue) {
  const pageValue = Array.isArray(value) ? value[0] : value;
  const page = Number(pageValue);

  return Number.isInteger(page) && page > 0 ? page : 1;
}
