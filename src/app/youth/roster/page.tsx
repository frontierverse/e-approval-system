import { PageTitle } from "@/components/page-title";
import { YouthRosterBoard } from "@/components/youth-roster-board";
import { requireUser } from "@/lib/auth";
import {
  getYouthRoster,
  getYouthRosterChangeLogs,
} from "@/lib/youth-roster";
import {
  createYouthAction,
  deleteYouthAction,
  deleteYouthDecisionDocumentAction,
  getYouthRosterChangeLogsAction,
  updateYouthAction,
} from "@/app/youth/actions";

type SearchParamValue = string | string[] | undefined;

type YouthRosterPageProps = {
  searchParams: Promise<{
    logPage?: SearchParamValue;
  }>;
};

export default async function YouthRosterPage({
  searchParams,
}: YouthRosterPageProps) {
  await requireUser();
  const params = await searchParams;
  const [roster, changeLogResult] = await Promise.all([
    getYouthRoster(),
    getYouthRosterChangeLogs({
      page: getSelectedPage(params.logPage),
    }),
  ]);

  return (
    <>
      <PageTitle
        title="청소년 명단"
        description="입소중인 청소년과 퇴소 청소년 현황을 확인합니다."
      />

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
        loadChangeLogs={getYouthRosterChangeLogsAction}
        updateYouth={updateYouthAction}
      />
    </>
  );
}

function getSelectedPage(value: SearchParamValue) {
  const pageValue = Array.isArray(value) ? value[0] : value;
  const page = Number(pageValue);

  return Number.isInteger(page) && page > 0 ? page : 1;
}
