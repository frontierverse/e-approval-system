"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { AppModal } from "@/components/app-modal";
import { EmptyState } from "@/components/empty-state";
import { SplitDateInput } from "@/components/split-date-input";
import { UserIdentity } from "@/components/user-identity";
import { defaultAllowedAttachmentExtensions } from "@/lib/attachment-policy-core";
import {
  getAuditActionBadgeClass,
  getAuditActionLabel,
} from "@/lib/audit-log-display";
import { formatFileSize, mergeAttachmentSelections } from "@/lib/file-display";
import {
  calculateYouthKoreanAge,
  formatYouthSchoolGradeLabel,
  getYouthDisplayAge,
  type YouthActionResult,
  type YouthCreateInput,
  youthDecisionDocumentFormFieldName,
  type YouthDecisionDocumentItem,
  type YouthFamilyContactInput,
  type YouthProfile,
  type YouthUpdateInput,
} from "@/lib/youth-management-core";
import type {
  YouthRosterChangeLog,
  YouthRosterChangeLogFilters,
  YouthRosterChangeLogsResult,
  YouthRosterData,
  YouthRosterItem,
} from "@/lib/youth-roster";
type YouthRosterBoardProps = {
  changeLogFilters?: YouthRosterChangeLogFilters;
  changeLogs?: YouthRosterChangeLog[];
  createYouth: (
    values: YouthCreateInput,
    documents?: FormData,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
  data: YouthRosterData;
  deleteYouth: (
    youthId: string,
  ) => Promise<YouthActionResult<{ youthId: string }>>;
  deleteDecisionDocument: (
    documentId: string,
  ) => Promise<YouthActionResult<{ documentId: string; youthId: string }>>;
  loadChangeLogs?: (
    page: number,
  ) => Promise<YouthActionResult<{ changeLogResult: YouthRosterChangeLogsResult }>>;
  updateYouth: (
    youthId: string,
    values: YouthUpdateInput,
    documents?: FormData,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
};

type YouthRosterModalState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      canDelete: boolean;
      youth: YouthRosterItem;
    };

type YouthFormDraft = {
  admissionDate: string;
  birthDate: string;
  decisionFiles: File[];
  dischargeDate: string;
  familyContacts: FamilyContactDraft[];
  name: string;
  phone: string;
};

type FamilyContactDraft = YouthFamilyContactInput & {
  key: string;
};

type YouthRosterSortField = "admissionDate" | "age" | "dischargeDate";
type YouthRosterSortDirection = "asc" | "desc";
type YouthRosterSortState = {
  direction: YouthRosterSortDirection;
  field: YouthRosterSortField;
};

const youthUpdateConfirmMessage =
  "정보 변경시 변경 기록이 남습니다.\n정말로 수정하시겠습니까?";
const decisionDocumentAcceptTypes = defaultAllowedAttachmentExtensions.join(",");

export function YouthRosterBoard({
  changeLogFilters,
  changeLogs = [],
  createYouth,
  data,
  deleteYouth,
  deleteDecisionDocument,
  loadChangeLogs,
  updateYouth,
}: YouthRosterBoardProps) {
  const [youths, setYouths] = useState(() => [
    ...data.admittedYouths,
    ...data.dischargedYouths,
  ]);
  const [admittedSort, setAdmittedSort] = useState<YouthRosterSortState>({
    direction: "asc",
    field: "admissionDate",
  });
  const [modal, setModal] = useState<YouthRosterModalState | null>(null);
  const rosterData = useMemo(
    () => ({
      referenceDate: data.referenceDate,
      admittedYouths: youths
        .filter((youth) => isAdmittedYouth(youth, data.referenceDate))
        .sort((first, second) =>
          compareAdmittedYouth(first, second, admittedSort),
        ),
      dischargedYouths: youths
        .filter((youth) => isDischargedYouth(youth, data.referenceDate))
        .sort(compareDischargedYouth),
    }),
    [admittedSort, data.referenceDate, youths],
  );
  const [changeLogState, setChangeLogState] = useState(() => ({
    filters: changeLogFilters ?? createDefaultChangeLogFilters(changeLogs.length),
    logs: changeLogs,
  }));
  const [changeLogError, setChangeLogError] = useState("");
  const [pendingChangeLogPage, setPendingChangeLogPage] = useState<
    number | null
  >(null);
  const [isChangeLogPending, startChangeLogTransition] = useTransition();

  const loadChangeLogPage = useCallback(
    (
      page: number,
      { updateHistory = true }: { updateHistory?: boolean } = {},
    ) => {
      if (!loadChangeLogs) {
        return;
      }

      setPendingChangeLogPage(page);

      startChangeLogTransition(async () => {
        try {
          const result = await loadChangeLogs(page);

          if (!result.ok) {
            setChangeLogError(result.error);
            return;
          }

          const { changeLogResult } = result.data;

          setChangeLogState({
            filters: {
              page: changeLogResult.page,
              pageSize: changeLogResult.pageSize,
              total: changeLogResult.total,
              totalPages: changeLogResult.totalPages,
            },
            logs: changeLogResult.logs,
          });
          setChangeLogError("");

          if (updateHistory) {
            window.history.pushState(
              { youthRosterLogPage: changeLogResult.page },
              "",
              getYouthRosterChangeLogPageHref(changeLogResult.page),
            );
          }
        } finally {
          setPendingChangeLogPage(null);
        }
      });
    },
    [loadChangeLogs],
  );

  useEffect(() => {
    if (!loadChangeLogs) {
      return;
    }

    function loadPageFromHistory() {
      loadChangeLogPage(getYouthRosterChangeLogPageFromLocation(), {
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadPageFromHistory);

    return () => window.removeEventListener("popstate", loadPageFromHistory);
  }, [loadChangeLogPage, loadChangeLogs]);

  function sortAdmittedYouths(field: YouthRosterSortField) {
    setAdmittedSort((current) =>
      current.field === field
        ? {
            field,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : {
            field,
            direction: "asc",
          },
    );
  }

  function saveYouthInRoster(youth: YouthRosterItem) {
    setYouths((current) => {
      if (current.some((item) => item.id === youth.id)) {
        return current.map((item) => (item.id === youth.id ? youth : item));
      }

      return [...current, youth];
    });
  }

  function removeYouthFromRoster(youthId: string) {
    setYouths((current) => current.filter((youth) => youth.id !== youthId));
  }

  return (
    <section className="space-y-6" aria-label="청소년 명단">
      <div className="flex justify-end">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setModal({ mode: "create" })}
          className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
        >
          청소년 추가
        </button>
      </div>
      <RosterSummary data={rosterData} />
      <YouthRosterSection
        emptyDescription="입소 상태의 청소년이 등록되면 이곳에 표시됩니다."
        emptyTitle="입소중인 청소년이 없습니다."
        onEdit={(youth) => setModal({ mode: "edit", canDelete: true, youth })}
        onSort={sortAdmittedYouths}
        referenceDate={rosterData.referenceDate}
        sortState={admittedSort}
        title="입소중인 청소년 목록"
        youths={rosterData.admittedYouths}
        variant="admitted"
      />
      <YouthRosterSection
        emptyDescription="퇴소일이 지난 청소년이 있으면 이곳에 표시됩니다."
        emptyTitle="퇴소 청소년이 없습니다."
        onEdit={(youth) => setModal({ mode: "edit", canDelete: false, youth })}
        referenceDate={rosterData.referenceDate}
        title="퇴소 청소년 목록"
        youths={rosterData.dischargedYouths}
        variant="discharged"
      />
      <YouthRosterChangeLogSection
        error={changeLogError}
        filters={changeLogState.filters}
        isPending={isChangeLogPending}
        logs={changeLogState.logs}
        onPageChange={loadChangeLogs ? loadChangeLogPage : undefined}
        pendingPage={pendingChangeLogPage}
      />
      {modal ? (
        <YouthRosterFormModal
          createYouth={createYouth}
          deleteYouth={deleteYouth}
          deleteDecisionDocument={deleteDecisionDocument}
          modal={modal}
          onClose={() => setModal(null)}
          onDeleted={removeYouthFromRoster}
          onSaved={saveYouthInRoster}
          updateYouth={updateYouth}
        />
      ) : null}
    </section>
  );
}

export function YouthRosterSkeleton() {
  return (
    <section className="space-y-6" aria-label="청소년 명단 불러오는 중">
      <section className="grid gap-3 sm:grid-cols-3">
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
      </section>
      <SkeletonPanel title="입소중인 청소년 목록" />
      <SkeletonPanel title="퇴소 청소년 목록" />
    </section>
  );
}

function RosterSummary({ data }: { data: YouthRosterData }) {
  const items = [
    {
      label: "기준일",
      value: formatDate(data.referenceDate),
    },
    {
      label: "입소중",
      value: `${data.admittedYouths.length}명`,
    },
    {
      label: "퇴소",
      value: `${data.dischargedYouths.length}명`,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3" aria-label="청소년 명단 요약">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-md border border-[#d9dee7] bg-white px-4 py-4"
        >
          <p className="text-xs font-semibold text-[#697386]">{item.label}</p>
          <p className="mt-2 break-words text-xl font-semibold text-[#16181d] [overflow-wrap:anywhere]">
            {item.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function YouthRosterChangeLogSection({
  error,
  filters,
  isPending,
  logs,
  onPageChange,
  pendingPage,
}: {
  error: string;
  filters: YouthRosterChangeLogFilters;
  isPending: boolean;
  logs: YouthRosterChangeLog[];
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
}) {
  return (
    <section
      aria-label="청소년 명단 변경기록"
      className="rounded-md border border-[#d9dee7] bg-white"
    >
      <header className="border-b border-[#eef1f5] px-4 py-4">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-base font-semibold text-[#16181d]">
            변경기록
          </h2>
          <YouthRosterChangeLogListSummary filters={filters} />
        </div>
      </header>

      {error ? (
        <p className="mx-4 mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {error}
        </p>
      ) : null}

      {logs.length > 0 ? (
        <ol
          className={[
            "divide-y divide-[#eef1f5]",
            isPending ? "opacity-60" : "",
          ].join(" ")}
        >
          {logs.map((log) => (
            <li
              key={log.id}
              className="grid gap-3 px-4 py-4 lg:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <div className="min-w-0">
                <time
                  dateTime={log.createdAt}
                  className="text-sm font-semibold text-[#394150]"
                >
                  {formatDateTime(log.createdAt)}
                </time>
                <UserIdentity
                  user={log.actor}
                  size="xs"
                  meta={log.actor.email ?? "이메일 미등록"}
                  className="mt-2"
                  nameClassName="text-[#394150]"
                />
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className={[
                      "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
                      getAuditActionBadgeClass(log.action),
                    ].join(" ")}
                  >
                    {getAuditActionLabel(log.action)}
                  </span>
                  <span className="inline-flex h-7 items-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-2.5 text-xs font-semibold text-[#394150]">
                    {getYouthRosterChangeLogTargetLabel(log)}
                  </span>
                </div>
                <p className="whitespace-pre-line break-words text-sm font-semibold leading-6 text-[#16181d] [overflow-wrap:anywhere]">
                  {log.message ?? "청소년 명단 변경기록을 기록했습니다."}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
          표시할 변경기록이 없습니다.
        </p>
      )}

      <YouthRosterChangeLogPagination
        filters={filters}
        isPending={isPending}
        onPageChange={onPageChange}
        pendingPage={pendingPage}
      />
    </section>
  );
}

function YouthRosterChangeLogListSummary({
  filters,
}: {
  filters: YouthRosterChangeLogFilters;
}) {
  if (filters.total === 0) {
    return (
      <p className="text-sm text-[#697386]">
        표시할 변경기록이 없습니다.
      </p>
    );
  }

  const firstItem = (filters.page - 1) * filters.pageSize + 1;
  const lastItem = Math.min(filters.page * filters.pageSize, filters.total);

  return (
    <p className="text-sm text-[#697386]">
      총 {filters.total}건 중 {firstItem}-{lastItem}건 표시
    </p>
  );
}

function YouthRosterChangeLogPagination({
  filters,
  isPending,
  onPageChange,
  pendingPage,
}: {
  filters: YouthRosterChangeLogFilters;
  isPending: boolean;
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
}) {
  if (filters.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="청소년 명단 변경기록 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-4 py-3"
    >
      <p className="text-sm text-[#697386]">
        {filters.page} / {filters.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <YouthRosterChangeLogPaginationLink
          disabled={filters.page <= 1 || isPending}
          href={getYouthRosterChangeLogPageHref(filters.page - 1)}
          onPageChange={onPageChange}
          page={filters.page - 1}
          pending={pendingPage === filters.page - 1}
        >
          이전
        </YouthRosterChangeLogPaginationLink>
        <YouthRosterChangeLogPaginationLink
          disabled={filters.page >= filters.totalPages || isPending}
          href={getYouthRosterChangeLogPageHref(filters.page + 1)}
          onPageChange={onPageChange}
          page={filters.page + 1}
          pending={pendingPage === filters.page + 1}
        >
          다음
        </YouthRosterChangeLogPaginationLink>
      </div>
    </nav>
  );
}

function YouthRosterChangeLogPaginationLink({
  children,
  disabled,
  href,
  onPageChange,
  page,
  pending,
}: {
  children: ReactNode;
  disabled: boolean;
  href: string;
  onPageChange?: (page: number) => void;
  page: number;
  pending: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (!onPageChange || shouldUseNativeNavigation(event)) {
          return;
        }

        event.preventDefault();
        onPageChange(page);
      }}
      className="inline-flex h-10 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
    >
      {children}
    </a>
  );
}

function getYouthRosterChangeLogPageHref(page: number) {
  if (page <= 1) {
    return "/youth/roster";
  }

  const params = new URLSearchParams({
    logPage: String(page),
  });

  return `/youth/roster?${params.toString()}`;
}

function getYouthRosterChangeLogPageFromLocation() {
  const page = Number(new URLSearchParams(window.location.search).get("logPage"));

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function getYouthRosterChangeLogTargetLabel(log: YouthRosterChangeLog) {
  if (log.targetType === "YouthSpecialNote") {
    return "특이사항";
  }

  if (log.targetType === "Youth") {
    return "기본정보";
  }

  return log.targetType;
}

function YouthRosterSection({
  emptyDescription,
  emptyTitle,
  onEdit,
  onSort,
  referenceDate,
  sortState,
  title,
  youths,
  variant,
}: {
  emptyDescription: string;
  emptyTitle: string;
  onEdit: (youth: YouthRosterItem) => void;
  onSort?: (field: YouthRosterSortField) => void;
  referenceDate: string;
  sortState?: YouthRosterSortState;
  title: string;
  youths: YouthRosterItem[];
  variant: "admitted" | "discharged";
}) {
  const canSort = variant === "admitted" && onSort && sortState;
  const rowsOpenEditor = variant === "admitted";

  return (
    <section
      aria-labelledby={`${variant}-youth-roster-title`}
      className="rounded-md border border-[#d9dee7] bg-white"
    >
      <SectionHeader
        id={`${variant}-youth-roster-title`}
        title={title}
        description={`${youths.length}명`}
      />
      {youths.length > 0 ? (
        <div className="overflow-x-auto border-t border-[#eef1f5]">
          <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
              <tr className="border-b border-[#d9dee7]">
                <th scope="col" className="px-4 py-3">
                  이름
                </th>
                {canSort ? (
                  <>
                    <SortableRosterHeader
                      field="age"
                      label="나이"
                      onSort={onSort}
                      sortState={sortState}
                    />
                    <th scope="col" className="px-4 py-3">
                      학년
                    </th>
                    <SortableRosterHeader
                      field="admissionDate"
                      label="입소 날짜"
                      onSort={onSort}
                      sortState={sortState}
                    />
                    <SortableRosterHeader
                      field="dischargeDate"
                      label="퇴소 예정"
                      onSort={onSort}
                      sortState={sortState}
                    />
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-4 py-3">
                      나이
                    </th>
                    <th scope="col" className="px-4 py-3">
                      학년
                    </th>
                    <th scope="col" className="px-4 py-3">
                      입소 날짜
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {variant === "admitted" ? "퇴소 예정" : "퇴소 날짜"}
                    </th>
                  </>
                )}
                <th scope="col" className="px-4 py-3">
                  연락처
                </th>
                <th scope="col" className="px-4 py-3">
                  가족 연락처
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f5]">
              {youths.map((youth) => (
                <tr
                  key={youth.id}
                  aria-haspopup={rowsOpenEditor ? "dialog" : undefined}
                  aria-label={
                    rowsOpenEditor ? `${youth.name} 정보 수정` : undefined
                  }
                  onClick={rowsOpenEditor ? () => onEdit(youth) : undefined}
                  onKeyDown={
                    rowsOpenEditor
                      ? (event) =>
                          handleEditableRosterRowKeyDown(event, youth, onEdit)
                      : undefined
                  }
                  role={rowsOpenEditor ? "button" : undefined}
                  tabIndex={rowsOpenEditor ? 0 : undefined}
                  className={
                    rowsOpenEditor
                      ? "group cursor-pointer transition hover:bg-[#f7fbfb] focus:bg-[#f7fbfb] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
                      : undefined
                  }
                >
                  <td className="break-words px-4 py-3 font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                        {youth.name}
                      </span>
                      {rowsOpenEditor ? (
                        <span
                          aria-hidden="true"
                          className="grid size-8 shrink-0 place-items-center rounded-md border border-[#cfd6e3] bg-white text-sm font-semibold text-[#394150] transition group-hover:border-[#196b69] group-hover:text-[#196b69]"
                        >
                          ✎
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          onClick={() => onEdit(youth)}
                          className="grid size-8 shrink-0 place-items-center rounded-md border border-[#cfd6e3] bg-white text-sm font-semibold text-[#394150] transition hover:border-[#196b69] hover:text-[#196b69] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                        >
                          <span aria-hidden="true">✎</span>
                          <span className="sr-only">
                            {youth.name} 정보 수정
                          </span>
                        </button>
                      )}
                    </span>
                  </td>
                  <TableCell>{formatYouthRosterAge(youth)}</TableCell>
                  <TableCell>
                    {formatYouthSchoolGradeLabel(youth, referenceDate) ??
                      "미등록"}
                  </TableCell>
                  <TableCell>{formatOptionalDate(youth.admissionDate)}</TableCell>
                  <TableCell>
                    {youth.dischargeDate
                      ? formatDate(youth.dischargeDate)
                      : variant === "admitted"
                        ? "입소중"
                        : "미등록"}
                  </TableCell>
                  <TableCell>{youth.phone ?? "미등록"}</TableCell>
                  <TableCell>
                    <FamilyContactList youth={youth} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-[#eef1f5] p-4">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      )}
    </section>
  );
}

function SortableRosterHeader({
  field,
  label,
  onSort,
  sortState,
}: {
  field: YouthRosterSortField;
  label: string;
  onSort: (field: YouthRosterSortField) => void;
  sortState: YouthRosterSortState;
}) {
  const isActive = sortState.field === field;
  const nextDirection =
    isActive && sortState.direction === "asc" ? "desc" : "asc";
  const sortLabel = nextDirection === "asc" ? "오름차순" : "내림차순";

  return (
    <th
      scope="col"
      aria-sort={
        isActive
          ? sortState.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className="px-4 py-3"
    >
      <button
        type="button"
        aria-label={`${label} ${sortLabel} 정렬`}
        onClick={() => onSort(field)}
        className="-mx-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#394150] transition hover:bg-[#eaf0f7] hover:text-[#196b69] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className="inline-flex w-3 justify-center text-[11px] text-[#697386]"
        >
          {isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function handleEditableRosterRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  youth: YouthRosterItem,
  onEdit: (youth: YouthRosterItem) => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onEdit(youth);
}

export function YouthRosterFormModal({
  createYouth,
  deleteYouth,
  deleteDecisionDocument,
  modal,
  onClose,
  onDeleted,
  onSaved,
  updateYouth,
}: {
  createYouth: YouthRosterBoardProps["createYouth"];
  deleteYouth: YouthRosterBoardProps["deleteYouth"];
  deleteDecisionDocument: YouthRosterBoardProps["deleteDecisionDocument"];
  modal: YouthRosterModalState;
  onClose: () => void;
  onDeleted: (youthId: string) => void;
  onSaved: (youth: YouthRosterItem) => void;
  updateYouth: YouthRosterBoardProps["updateYouth"];
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(() =>
    createYouthFormDraft(modal.mode === "edit" ? modal.youth : null),
  );
  const [savedDocuments, setSavedDocuments] = useState<
    YouthDecisionDocumentItem[]
  >(() => (modal.mode === "edit" ? modal.youth.decisionDocuments : []));
  const [error, setError] = useState("");
  const [pendingIntent, setPendingIntent] = useState<
    "delete" | "deleteDocument" | "save" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const title = modal.mode === "create" ? "청소년 추가" : "청소년 정보 수정";

  function updateDraft(values: Partial<Omit<YouthFormDraft, "familyContacts">>) {
    setDraft((current) => ({
      ...current,
      ...values,
    }));
    setError("");
  }

  function addFamilyContact() {
    setDraft((current) => ({
      ...current,
      familyContacts: [
        ...current.familyContacts,
        createFamilyContactDraft(current.familyContacts.length),
      ],
    }));
    setError("");
  }

  function removeFamilyContact(key: string) {
    setDraft((current) => ({
      ...current,
      familyContacts:
        current.familyContacts.length <= 1
          ? current.familyContacts
          : current.familyContacts.filter((contact) => contact.key !== key),
    }));
    setError("");
  }

  function updateFamilyContact(
    key: string,
    values: Partial<Omit<FamilyContactDraft, "key">>,
  ) {
    setDraft((current) => ({
      ...current,
      familyContacts: current.familyContacts.map((contact) =>
        contact.key === key ? { ...contact, ...values } : contact,
      ),
    }));
    setError("");
  }

  function addDecisionFiles(event: ChangeEvent<HTMLInputElement>) {
    const addedFiles = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (addedFiles.length === 0) {
      return;
    }

    setDraft((current) => ({
      ...current,
      decisionFiles: mergeAttachmentSelections(
        current.decisionFiles,
        addedFiles,
      ),
    }));
    setError("");
  }

  function removeDecisionFile(file: File) {
    setDraft((current) => ({
      ...current,
      decisionFiles: current.decisionFiles.filter((item) => item !== file),
    }));
    setError("");
  }

  function deleteSavedDocument(document: YouthDecisionDocumentItem) {
    if (modal.mode !== "edit") {
      return;
    }

    if (
      !window.confirm(
        `"${document.originalName}" 결정문 파일을 삭제할까요?\n삭제한 파일은 복구할 수 없습니다.`,
      )
    ) {
      return;
    }

    setError("");
    setPendingIntent("deleteDocument");

    startTransition(async () => {
      try {
        const result = await deleteDecisionDocument(document.id);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        const nextDocuments = savedDocuments.filter(
          (item) => item.id !== result.data.documentId,
        );

        setSavedDocuments(nextDocuments);
        onSaved({
          ...modal.youth,
          decisionDocuments: nextDocuments,
        });
      } finally {
        setPendingIntent(null);
      }
    });
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const values = getYouthInputFromDraft(draft);
    const documentsFormData = getDecisionDocumentsFormData(draft.decisionFiles);

    if (modal.mode === "edit" && !window.confirm(youthUpdateConfirmMessage)) {
      return;
    }

    setPendingIntent("save");

    startTransition(async () => {
      try {
        const result =
          modal.mode === "create"
            ? await createYouth(values, documentsFormData)
            : await updateYouth(modal.youth.id, values, documentsFormData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        onSaved(mapYouthProfileToRosterItem(result.data.youth));
        onClose();
      } finally {
        setPendingIntent(null);
      }
    });
  }

  function deleteCurrentYouth() {
    if (modal.mode !== "edit") {
      return;
    }

    if (!window.confirm(`${modal.youth.name} 청소년을 삭제할까요?`)) {
      return;
    }

    setError("");
    setPendingIntent("delete");

    startTransition(async () => {
      try {
        const result = await deleteYouth(modal.youth.id);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        onDeleted(result.data.youthId);
        onClose();
      } finally {
        setPendingIntent(null);
      }
    });
  }

  return (
    <AppModal
      className="max-w-2xl"
      labelledBy={titleId}
      onClose={onClose}
    >
      <form onSubmit={submitForm}>
        <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
          <header className="sticky top-0 z-10 border-b border-[#eef1f5] bg-white px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#697386]">
                  청소년 정보
                </p>
                <h2
                  id={titleId}
                  className="mt-2 break-words text-2xl font-semibold leading-tight text-[#16181d]"
                >
                  {title}
                </h2>
                <p className="mt-2 text-sm font-semibold text-[#196b69]">
                  TAB키를 이용하여 입력칸 이동 가능
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
              >
                닫기
              </button>
            </div>
          </header>

          <div className="grid gap-4 px-6 py-5">
            <label>
              <span className="flex items-center gap-2 text-sm font-semibold text-[#394150]">
                이름
                <span className="rounded-full border border-[#b8d9d7] bg-[#eef7f6] px-2 py-0.5 text-[11px] font-semibold text-[#196b69]">
                  필수
                </span>
              </span>
              <input
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                autoFocus
                className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <RosterFormField label="입소 날짜">
                <SplitDateInput
                  ariaLabel="입소 날짜"
                  value={draft.admissionDate}
                  onChange={(value) => updateDraft({ admissionDate: value })}
                />
              </RosterFormField>
              <RosterFormField label="퇴소 예정">
                <SplitDateInput
                  ariaLabel="퇴소 예정"
                  value={draft.dischargeDate}
                  onChange={(value) => updateDraft({ dischargeDate: value })}
                />
              </RosterFormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <RosterFormField label="생년월일">
                <SplitDateInput
                  ariaLabel="생년월일"
                  value={draft.birthDate}
                  onChange={(value) => updateDraft({ birthDate: value })}
                />
              </RosterFormField>
              <RosterFormField label="핸드폰 번호">
                <input
                  value={draft.phone}
                  onChange={(event) =>
                    updateDraft({ phone: normalizePhoneText(event.target.value) })
                  }
                  placeholder="010-0000-0000"
                  className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </RosterFormField>
            </div>

            <section className="rounded-md border border-[#eef1f5] bg-[#fbfcfd]">
              <div className="flex items-center justify-between gap-3 border-b border-[#eef1f5] px-4 py-3">
                <h3 className="text-sm font-semibold text-[#394150]">
                  가족 연락처
                </h3>
                <button
                  type="button"
                  onClick={addFamilyContact}
                  className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                >
                  추가
                </button>
              </div>
              <div className="grid gap-3 p-4">
                {draft.familyContacts.map((contact, index) => (
                  <div
                    key={contact.key}
                    className="grid gap-3 rounded-md border border-[#eef1f5] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
                  >
                    <RosterFormField label={`관계 ${index + 1}`}>
                      <input
                        value={contact.relationship}
                        onChange={(event) =>
                          updateFamilyContact(contact.key, {
                            relationship: event.target.value,
                          })
                        }
                        className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </RosterFormField>
                    <RosterFormField label="연락처">
                      <input
                        value={contact.phone}
                        onChange={(event) =>
                          updateFamilyContact(contact.key, {
                            phone: normalizePhoneText(event.target.value),
                          })
                        }
                        placeholder="010-0000-0000"
                        className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </RosterFormField>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeFamilyContact(contact.key)}
                        disabled={draft.familyContacts.length <= 1}
                        className="h-10 rounded-md border border-[#f0c3bd] bg-[#fff5f2] px-3 text-sm font-semibold text-[#9d3328] transition hover:bg-[#ffe9e4] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-[#eef1f5] bg-[#fbfcfd]">
              <div className="flex items-center justify-between gap-3 border-b border-[#eef1f5] px-4 py-3">
                <h3 className="text-sm font-semibold text-[#394150]">
                  결정문 파일
                </h3>
                <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus-within:ring-2 focus-within:ring-[#d7eceb]">
                  파일 선택
                  <input
                    type="file"
                    multiple
                    accept={decisionDocumentAcceptTypes}
                    onChange={addDecisionFiles}
                    className="sr-only"
                  />
                </label>
              </div>
              <div className="grid gap-3 p-4">
                {modal.mode === "edit" ? (
                  savedDocuments.length > 0 ? (
                    <ul className="grid gap-2" aria-label="등록된 결정문 파일">
                      {savedDocuments.map((document) => (
                        <li
                          key={document.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#eef1f5] bg-white px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                              {document.originalName}
                            </p>
                            <p className="mt-1 text-xs text-[#697386]">
                              {formatFileSize(document.size)} ·{" "}
                              {formatDateTime(document.createdAt)} 등록
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <a
                              href={`/youth/decision-documents/${document.id}`}
                              className="inline-flex h-9 items-center rounded-md border border-[#b8d9d7] bg-[#eef7f6] px-3 text-sm font-semibold text-[#196b69] transition hover:bg-[#ddefed]"
                            >
                              다운로드
                            </a>
                            <button
                              type="button"
                              onClick={() => deleteSavedDocument(document)}
                              disabled={pending}
                              className="h-9 rounded-md border border-[#f0c3bd] bg-[#fff5f2] px-3 text-sm font-semibold text-[#9d3328] transition hover:bg-[#ffe9e4] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {pending && pendingIntent === "deleteDocument"
                                ? "삭제 중"
                                : "삭제"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md border border-dashed border-[#cfd6e3] bg-white px-3 py-3 text-sm text-[#697386]">
                      등록된 결정문 파일이 없습니다.
                    </p>
                  )
                ) : null}

                {draft.decisionFiles.length > 0 ? (
                  <ul className="grid gap-2" aria-label="업로드할 결정문 파일">
                    {draft.decisionFiles.map((file) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d7eceb] bg-[#f4faf9] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                            {file.name}
                          </p>
                          <p className="mt-1 text-xs text-[#697386]">
                            {formatFileSize(file.size)} · 저장 시 업로드
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDecisionFile(file)}
                          disabled={pending}
                          className="h-9 shrink-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          제외
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-xs text-[#697386]">
                  선택한 파일은 저장 버튼을 누르면 함께 업로드됩니다. 파일당
                  최대 30MB, 한 번에 5개까지 등록할 수 있습니다.
                </p>
              </div>
            </section>

            {error ? (
              <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-[#eef1f5] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {modal.mode === "edit" && modal.canDelete ? (
              <button
                type="button"
                aria-label={`${modal.youth.name} 청소년 삭제`}
                onClick={deleteCurrentYouth}
                disabled={pending}
                className="h-10 rounded-md border border-[#efb4b4] bg-white px-4 text-sm font-semibold text-[#a13a3a] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending && pendingIntent === "delete" ? "삭제 중" : "삭제"}
              </button>
            ) : (
              <span aria-hidden="true" className="hidden sm:block" />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="h-10 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pending && pendingIntent === "save" ? "저장 중" : "저장"}
              </button>
            </div>
          </footer>
        </div>
      </form>
    </AppModal>
  );
}

function RosterFormField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#394150]">{label}</span>
      {children}
    </label>
  );
}

function FamilyContactList({ youth }: { youth: YouthRosterItem }) {
  if (youth.familyContacts.length === 0) {
    return "미등록";
  }

  return (
    <ul className="space-y-1">
      {youth.familyContacts.map((contact) => (
        <li
          key={contact.id}
          className="break-words leading-6 [overflow-wrap:anywhere]"
        >
          <span className="font-semibold text-[#16181d]">
            {contact.relationship ?? "관계 미등록"}
          </span>
          <span className="text-[#8a95a6]"> · </span>
          <span>{contact.phone ?? "연락처 미등록"}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHeader({
  description,
  id,
  title,
}: {
  description: string;
  id: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
      <h2 id={id} className="text-base font-semibold text-[#16181d]">
        {title}
      </h2>
      <p className="text-sm text-[#697386]">{description}</p>
    </div>
  );
}

function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="break-words px-4 py-3 text-[#394150] [overflow-wrap:anywhere]">
      {children}
    </td>
  );
}

function SkeletonPanel({ title }: { title: string }) {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white">
      <div className="flex items-end justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-base font-semibold text-[#16181d]">{title}</p>
          <SkeletonBlock className="mt-2 h-3 w-32" />
        </div>
        <SkeletonBlock className="h-4 w-12" />
      </div>
      <div className="space-y-3 border-t border-[#eef1f5] p-4">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonBlock key={index} className="h-10 w-full" />
        ))}
      </div>
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-[#e5e9f0] dark:bg-[#2a3038] ${className}`}
    />
  );
}

function createDefaultChangeLogFilters(
  total: number,
): YouthRosterChangeLogFilters {
  return {
    page: 1,
    pageSize: Math.max(total, 5),
    total,
    totalPages: 1,
  };
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "미등록";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  return year && month && day ? `${year}. ${month}. ${day}.` : value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatYouthRosterAge(youth: Pick<YouthRosterItem, "age" | "koreanAge">) {
  if (youth.age === null) {
    return "미등록";
  }

  const legalAgeLabel = `만 ${youth.age}세`;

  return youth.koreanAge === null
    ? legalAgeLabel
    : `${legalAgeLabel}(${youth.koreanAge}세)`;
}

function createYouthFormDraft(youth: YouthRosterItem | null): YouthFormDraft {
  return {
    admissionDate: youth?.admissionDate ?? "",
    birthDate: youth?.birthDate ?? "",
    decisionFiles: [],
    dischargeDate: youth?.dischargeDate ?? "",
    familyContacts:
      youth && youth.familyContacts.length > 0
        ? youth.familyContacts.map((contact, index) => ({
            key: contact.id || `family-contact-${index}`,
            phone: contact.phone ?? "",
            relationship: contact.relationship ?? "",
          }))
        : [createFamilyContactDraft(0)],
    name: youth?.name ?? "",
    phone: youth?.phone ?? "",
  };
}

function createFamilyContactDraft(index: number): FamilyContactDraft {
  return {
    key: `family-contact-draft-${Date.now()}-${index}`,
    phone: "",
    relationship: "",
  };
}

function getDecisionDocumentsFormData(files: File[]) {
  if (files.length === 0) {
    return undefined;
  }

  const formData = new FormData();

  for (const file of files) {
    formData.append(youthDecisionDocumentFormFieldName, file);
  }

  return formData;
}

function getYouthInputFromDraft(draft: YouthFormDraft): YouthCreateInput {
  return {
    admissionDate: draft.admissionDate,
    birthDate: draft.birthDate,
    dischargeDate: draft.dischargeDate,
    familyContacts: draft.familyContacts.map((contact) => ({
      phone: contact.phone,
      relationship: contact.relationship,
    })),
    name: draft.name,
    phone: draft.phone,
  };
}

function mapYouthProfileToRosterItem(youth: YouthProfile): YouthRosterItem {
  const birthDate = youth.birthDate;

  return {
    id: youth.id,
    admissionDate: youth.admissionDate,
    birthDate,
    age: getYouthDisplayAge({
      age: youth.age,
      birthDate,
    }),
    koreanAge: calculateYouthKoreanAge(birthDate),
    dischargeDate: youth.dischargeDate,
    decisionDocuments: youth.decisionDocuments,
    familyContacts: youth.familyContacts.map((contact) => ({
      id: contact.id,
      phone: contact.phone,
      relationship: contact.relationship,
    })),
    name: youth.name,
    phone: youth.phone,
  };
}

function isAdmittedYouth(youth: YouthRosterItem, referenceDate: string) {
  return !youth.dischargeDate || youth.dischargeDate >= referenceDate;
}

function isDischargedYouth(youth: YouthRosterItem, referenceDate: string) {
  return Boolean(youth.dischargeDate && youth.dischargeDate < referenceDate);
}

function compareAdmittedYouth(
  first: YouthRosterItem,
  second: YouthRosterItem,
  sortState: YouthRosterSortState,
) {
  const compared = compareAdmittedYouthSortField(first, second, sortState);

  return compared || first.name.localeCompare(second.name, "ko");
}

function compareAdmittedYouthSortField(
  first: YouthRosterItem,
  second: YouthRosterItem,
  sortState: YouthRosterSortState,
) {
  if (sortState.field === "age") {
    return compareOptionalNumber(first.age, second.age, sortState.direction);
  }

  if (sortState.field === "dischargeDate") {
    return compareOptionalDate(
      first.dischargeDate,
      second.dischargeDate,
      sortState.direction,
    );
  }

  return compareOptionalDate(
    first.admissionDate,
    second.admissionDate,
    sortState.direction,
  );
}

function compareDischargedYouth(first: YouthRosterItem, second: YouthRosterItem) {
  return (
    compareOptionalDateDesc(first.dischargeDate, second.dischargeDate) ||
    first.name.localeCompare(second.name, "ko")
  );
}

function compareOptionalDateAsc(first: string | null, second: string | null) {
  if (first && second) {
    return first.localeCompare(second);
  }

  if (first) {
    return -1;
  }

  if (second) {
    return 1;
  }

  return 0;
}

function compareOptionalDateDesc(first: string | null, second: string | null) {
  return compareOptionalDateAsc(second, first);
}

function compareOptionalDate(
  first: string | null,
  second: string | null,
  direction: YouthRosterSortDirection,
) {
  if (!first && !second) {
    return 0;
  }

  if (!first) {
    return 1;
  }

  if (!second) {
    return -1;
  }

  const compared = first.localeCompare(second);

  return direction === "asc" ? compared : -compared;
}

function compareOptionalNumber(
  first: number | null,
  second: number | null,
  direction: YouthRosterSortDirection,
) {
  if (first === null && second === null) {
    return 0;
  }

  if (first === null) {
    return 1;
  }

  if (second === null) {
    return -1;
  }

  const compared = first - second;

  return direction === "asc" ? compared : -compared;
}

function normalizePhoneText(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
