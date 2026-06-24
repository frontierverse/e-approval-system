"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";
import { EmptyState } from "@/components/empty-state";
import type { YouthRosterData, YouthRosterItem } from "@/lib/youth-roster";
import type {
  YouthActionResult,
  YouthCreateInput,
  YouthFamilyContactInput,
  YouthProfile,
  YouthUpdateInput,
} from "@/lib/youth-management-core";

type YouthRosterBoardProps = {
  createYouth: (
    values: YouthCreateInput,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
  data: YouthRosterData;
  updateYouth: (
    youthId: string,
    values: YouthUpdateInput,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
};

type YouthRosterModalState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      youth: YouthRosterItem;
    };

type YouthFormDraft = {
  admissionDate: string;
  age: string;
  dischargeDate: string;
  familyContacts: FamilyContactDraft[];
  name: string;
  phone: string;
};

type FamilyContactDraft = YouthFamilyContactInput & {
  key: string;
};

export function YouthRosterBoard({
  createYouth,
  data,
  updateYouth,
}: YouthRosterBoardProps) {
  const [youths, setYouths] = useState(() => [
    ...data.admittedYouths,
    ...data.dischargedYouths,
  ]);
  const [modal, setModal] = useState<YouthRosterModalState | null>(null);
  const rosterData = useMemo(
    () => ({
      referenceDate: data.referenceDate,
      admittedYouths: youths
        .filter((youth) => isAdmittedYouth(youth, data.referenceDate))
        .sort(compareAdmittedYouth),
      dischargedYouths: youths
        .filter((youth) => isDischargedYouth(youth, data.referenceDate))
        .sort(compareDischargedYouth),
    }),
    [data.referenceDate, youths],
  );

  function saveYouthInRoster(youth: YouthRosterItem) {
    setYouths((current) => {
      if (current.some((item) => item.id === youth.id)) {
        return current.map((item) => (item.id === youth.id ? youth : item));
      }

      return [...current, youth];
    });
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
        onEdit={(youth) => setModal({ mode: "edit", youth })}
        title="입소중인 청소년 목록"
        youths={rosterData.admittedYouths}
        variant="admitted"
      />
      <YouthRosterSection
        emptyDescription="퇴소일이 지난 청소년이 있으면 이곳에 표시됩니다."
        emptyTitle="퇴소 청소년이 없습니다."
        onEdit={(youth) => setModal({ mode: "edit", youth })}
        title="퇴소 청소년 목록"
        youths={rosterData.dischargedYouths}
        variant="discharged"
      />
      {modal ? (
        <YouthRosterFormModal
          createYouth={createYouth}
          modal={modal}
          onClose={() => setModal(null)}
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

function YouthRosterSection({
  emptyDescription,
  emptyTitle,
  onEdit,
  title,
  youths,
  variant,
}: {
  emptyDescription: string;
  emptyTitle: string;
  onEdit: (youth: YouthRosterItem) => void;
  title: string;
  youths: YouthRosterItem[];
  variant: "admitted" | "discharged";
}) {
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
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
              <tr className="border-b border-[#d9dee7]">
                <th scope="col" className="px-4 py-3">
                  이름
                </th>
                <th scope="col" className="px-4 py-3">
                  나이
                </th>
                <th scope="col" className="px-4 py-3">
                  입소 날짜
                </th>
                <th scope="col" className="px-4 py-3">
                  {variant === "admitted" ? "퇴소 예정" : "퇴소 날짜"}
                </th>
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
                <tr key={youth.id}>
                  <td className="break-words px-4 py-3 font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                        {youth.name}
                      </span>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => onEdit(youth)}
                        className="grid size-8 shrink-0 place-items-center rounded-md border border-[#cfd6e3] bg-white text-sm font-semibold text-[#394150] transition hover:border-[#196b69] hover:text-[#196b69] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        <span aria-hidden="true">✎</span>
                        <span className="sr-only">{youth.name} 정보 수정</span>
                      </button>
                    </span>
                  </td>
                  <TableCell>
                    {youth.age === null ? "미등록" : `${youth.age}세`}
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

function YouthRosterFormModal({
  createYouth,
  modal,
  onClose,
  onSaved,
  updateYouth,
}: {
  createYouth: YouthRosterBoardProps["createYouth"];
  modal: YouthRosterModalState;
  onClose: () => void;
  onSaved: (youth: YouthRosterItem) => void;
  updateYouth: YouthRosterBoardProps["updateYouth"];
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(() =>
    createYouthFormDraft(modal.mode === "edit" ? modal.youth : null),
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const title = modal.mode === "create" ? "청소년 추가" : "청소년 정보 수정";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

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

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const values = getYouthInputFromDraft(draft);

    startTransition(async () => {
      const result =
        modal.mode === "create"
          ? await createYouth(values)
          : await updateYouth(modal.youth.id, values);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSaved(mapYouthProfileToRosterItem(result.data.youth));
      onClose();
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
                <DatePickerInput
                  value={draft.admissionDate}
                  onChange={(event) =>
                    updateDraft({ admissionDate: event.target.value })
                  }
                  className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </RosterFormField>
              <RosterFormField label="퇴소 날짜">
                <DatePickerInput
                  value={draft.dischargeDate}
                  onChange={(event) =>
                    updateDraft({ dischargeDate: event.target.value })
                  }
                  className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </RosterFormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <RosterFormField label="나이">
                <input
                  type="number"
                  min="0"
                  max="150"
                  value={draft.age}
                  onChange={(event) => updateDraft({ age: event.target.value })}
                  className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
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

            {error ? (
              <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#eef1f5] bg-white px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "저장 중" : "저장"}
            </button>
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
      className={`block animate-pulse rounded bg-[#e5e9f0] ${className}`}
    />
  );
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "미등록";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  return year && month && day ? `${year}. ${month}. ${day}.` : value;
}

function createYouthFormDraft(youth: YouthRosterItem | null): YouthFormDraft {
  return {
    admissionDate: youth?.admissionDate ?? "",
    age: youth?.age === null || youth?.age === undefined ? "" : String(youth.age),
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

function getYouthInputFromDraft(draft: YouthFormDraft): YouthCreateInput {
  return {
    admissionDate: draft.admissionDate,
    age: draft.age,
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
  return {
    id: youth.id,
    admissionDate: youth.admissionDate,
    age: youth.age,
    dischargeDate: youth.dischargeDate,
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

function compareAdmittedYouth(first: YouthRosterItem, second: YouthRosterItem) {
  return (
    compareOptionalDateAsc(first.admissionDate, second.admissionDate) ||
    first.name.localeCompare(second.name, "ko")
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
