"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  youthNoteCategories,
  youthNotePriorities,
  type YouthActionResult,
  type YouthCreateInput,
  type YouthUpdateInput,
  type YouthNoteInput,
  type YouthNoteCategory,
  type YouthNotePriority,
  type YouthProfile,
  type YouthSpecialNote,
} from "@/lib/youth-management-core";

type SelectedNote = {
  youthId: string;
  noteId: string;
};

type NoteDraft = Omit<YouthSpecialNote, "id">;

type FamilyContactDraft = {
  key: string;
  relationship: string;
  phoneMiddle: string;
  phoneLast: string;
};

type YouthManagementBoardProps = {
  createYouth: (
    values: YouthCreateInput,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
  deleteYouthNote: (
    noteId: string,
  ) => Promise<YouthActionResult<{ noteId: string; youthId: string }>>;
  initialYouths: YouthProfile[];
  updateYouth: (
    youthId: string,
    values: YouthUpdateInput,
  ) => Promise<YouthActionResult<{ youth: YouthProfile }>>;
  updateYouthNote: (
    noteId: string,
    values: YouthNoteInput,
  ) => Promise<YouthActionResult<{ note: YouthSpecialNote }>>;
};

const priorityStyles: Record<YouthNotePriority, string> = {
  보통: "border-[#2f746f] bg-[#eef8f7] text-[#17524f]",
  긴급: "border-[#c24a3a] bg-[#fff5f2] text-[#8c2f24]",
};

const priorityAccentStyles: Record<YouthNotePriority, string> = {
  보통: "before:bg-[#2f746f]",
  긴급: "before:bg-[#c24a3a]",
};

export function YouthManagementBoard({
  createYouth,
  deleteYouthNote,
  initialYouths,
  updateYouth,
  updateYouthNote,
}: YouthManagementBoardProps) {
  const [youths, setYouths] = useState(initialYouths);
  const [activeYouthId, setActiveYouthId] = useState(
    () => initialYouths[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<SelectedNote | null>(null);
  const [registeringYouth, setRegisteringYouth] = useState(false);
  const [newYouthName, setNewYouthName] = useState("");
  const [newYouthAdmissionDate, setNewYouthAdmissionDate] = useState("");
  const [newYouthDischargeDate, setNewYouthDischargeDate] = useState("");
  const [newYouthAge, setNewYouthAge] = useState("");
  const [newYouthPhoneMiddle, setNewYouthPhoneMiddle] = useState("");
  const [newYouthPhoneLast, setNewYouthPhoneLast] = useState("");
  const newYouthPhoneLastRef = useRef<HTMLInputElement>(null);
  const familyContactKey = useRef(1);
  const familyPhoneLastRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const [newYouthFamilyContacts, setNewYouthFamilyContacts] = useState<
    FamilyContactDraft[]
  >(() => [createFamilyContactDraft(0)]);
  const [registerError, setRegisterError] = useState("");
  const [editingYouthId, setEditingYouthId] = useState("");
  const [editYouthName, setEditYouthName] = useState("");
  const [editYouthAdmissionDate, setEditYouthAdmissionDate] = useState("");
  const [editYouthDischargeDate, setEditYouthDischargeDate] = useState("");
  const [editYouthAge, setEditYouthAge] = useState("");
  const [editYouthPhoneMiddle, setEditYouthPhoneMiddle] = useState("");
  const [editYouthPhoneLast, setEditYouthPhoneLast] = useState("");
  const editYouthPhoneLastRef = useRef<HTMLInputElement>(null);
  const editFamilyContactKey = useRef(1);
  const editFamilyPhoneLastRefs = useRef<
    Record<string, HTMLInputElement | null>
  >({});
  const [editYouthFamilyContacts, setEditYouthFamilyContacts] = useState<
    FamilyContactDraft[]
  >(() => [createFamilyContactDraft(0)]);
  const [editYouthError, setEditYouthError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NoteDraft>(() => emptyDraft());
  const [noteError, setNoteError] = useState("");
  const [pendingAction, startPendingAction] = useTransition();

  const activeYouth = useMemo(
    () => youths.find((youth) => youth.id === activeYouthId) ?? youths[0],
    [activeYouthId, youths],
  );
  const selectedYouth = useMemo(
    () => youths.find((youth) => youth.id === selected?.youthId),
    [selected?.youthId, youths],
  );
  const selectedNote = useMemo(
    () => selectedYouth?.notes.find((note) => note.id === selected?.noteId),
    [selected?.noteId, selectedYouth],
  );
  const editedYouth = useMemo(
    () => youths.find((youth) => youth.id === editingYouthId),
    [editingYouthId, youths],
  );
  const hasEditYouthChanges = useMemo(
    () =>
      editedYouth
        ? hasYouthDraftChanged(editedYouth, {
            name: editYouthName,
            admissionDate: editYouthAdmissionDate,
            dischargeDate: editYouthDischargeDate,
            age: editYouthAge,
            phoneMiddle: editYouthPhoneMiddle,
            phoneLast: editYouthPhoneLast,
            familyContacts: editYouthFamilyContacts,
          })
        : false,
    [
      editYouthAdmissionDate,
      editYouthAge,
      editYouthDischargeDate,
      editYouthFamilyContacts,
      editedYouth,
      editYouthName,
      editYouthPhoneLast,
      editYouthPhoneMiddle,
    ],
  );

  useEffect(() => {
    if (!selectedNote) {
      return;
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
      }
    }

    window.addEventListener("keydown", closeWithEscape);

    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [selectedNote]);

  const totalNotes = youths.reduce((total, youth) => total + youth.notes.length, 0);

  function selectYouth(youthId: string) {
    setActiveYouthId(youthId);
    closeModal();
  }

  function openNote(youthId: string, noteId: string) {
    const note = youths
      .find((youth) => youth.id === youthId)
      ?.notes.find((currentNote) => currentNote.id === noteId);

    if (!note) {
      return;
    }

    setDraft(createDraftFromNote(note));
    setSelected({ youthId, noteId });
    setNoteError("");
    setEditing(false);
  }

  function closeModal() {
    setSelected(null);
    setEditing(false);
    setNoteError("");
  }

  function openRegisterModal() {
    closeModal();
    resetRegisterForm();
    setRegisterError("");
    setRegisteringYouth(true);
  }

  function closeRegisterModal() {
    setRegisteringYouth(false);
    resetRegisterForm();
    setRegisterError("");
  }

  function resetRegisterForm() {
    setNewYouthName("");
    setNewYouthAdmissionDate("");
    setNewYouthDischargeDate("");
    setNewYouthAge("");
    setNewYouthPhoneMiddle("");
    setNewYouthPhoneLast("");
    familyContactKey.current = 1;
    setNewYouthFamilyContacts([createFamilyContactDraft(0)]);
  }

  function addFamilyContact() {
    const nextKey = familyContactKey.current;

    familyContactKey.current += 1;
    setNewYouthFamilyContacts((current) => [
      ...current,
      createFamilyContactDraft(nextKey),
    ]);
    setRegisterError("");
  }

  function removeFamilyContact(key: string) {
    setNewYouthFamilyContacts((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((contact) => contact.key !== key);
    });
    setRegisterError("");
  }

  function updateFamilyContact(
    key: string,
    values: Partial<Omit<FamilyContactDraft, "key">>,
  ) {
    setNewYouthFamilyContacts((current) =>
      current.map((contact) =>
        contact.key === key ? { ...contact, ...values } : contact,
      ),
    );
    setRegisterError("");
  }

  function openEditYouthModal(youth: YouthProfile) {
    const phoneDraft = createPhoneDraftFromValue(youth.phone);

    closeModal();
    setEditingYouthId(youth.id);
    setEditYouthName(youth.name);
    setEditYouthAdmissionDate(youth.admissionDate ?? "");
    setEditYouthDischargeDate(youth.dischargeDate ?? "");
    setEditYouthAge(youth.age === null ? "" : String(youth.age));
    setEditYouthPhoneMiddle(phoneDraft.middle);
    setEditYouthPhoneLast(phoneDraft.last);
    editFamilyContactKey.current = youth.familyContacts.length + 1;
    setEditYouthFamilyContacts(
      youth.familyContacts.length > 0
        ? youth.familyContacts.map(createFamilyContactDraftFromProfile)
        : [createFamilyContactDraft(0)],
    );
    setEditYouthError("");
  }

  function closeEditYouthModal() {
    setEditingYouthId("");
    resetEditYouthForm();
    setEditYouthError("");
  }

  function resetEditYouthForm() {
    setEditYouthName("");
    setEditYouthAdmissionDate("");
    setEditYouthDischargeDate("");
    setEditYouthAge("");
    setEditYouthPhoneMiddle("");
    setEditYouthPhoneLast("");
    editFamilyContactKey.current = 1;
    setEditYouthFamilyContacts([createFamilyContactDraft(0)]);
  }

  function addEditFamilyContact() {
    const nextKey = editFamilyContactKey.current;

    editFamilyContactKey.current += 1;
    setEditYouthFamilyContacts((current) => [
      ...current,
      createFamilyContactDraft(nextKey),
    ]);
    setEditYouthError("");
  }

  function removeEditFamilyContact(key: string) {
    setEditYouthFamilyContacts((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((contact) => contact.key !== key);
    });
    setEditYouthError("");
  }

  function updateEditFamilyContact(
    key: string,
    values: Partial<Omit<FamilyContactDraft, "key">>,
  ) {
    setEditYouthFamilyContacts((current) =>
      current.map((contact) =>
        contact.key === key ? { ...contact, ...values } : contact,
      ),
    );
    setEditYouthError("");
  }

  function registerYouth() {
    const name = newYouthName.trim();

    if (!name) {
      setRegisterError("청소년 이름을 입력하세요.");
      return;
    }

    if (youths.some((youth) => youth.name === name)) {
      setRegisterError("이미 등록된 청소년 이름입니다.");
      return;
    }

    startPendingAction(async () => {
      const result = await createYouth({
        name,
        admissionDate: newYouthAdmissionDate,
        dischargeDate: newYouthDischargeDate,
        age: newYouthAge,
        phone: getRegistrationPhoneValue(
          newYouthPhoneMiddle,
          newYouthPhoneLast,
        ),
        familyContacts: newYouthFamilyContacts.map((contact) => ({
          relationship: contact.relationship,
          phone: getRegistrationPhoneValue(
            contact.phoneMiddle,
            contact.phoneLast,
          ),
        })),
      });

      if (!result.ok) {
        setRegisterError(result.error);
        return;
      }

      setYouths((current) => [...current, result.data.youth]);
      setActiveYouthId(result.data.youth.id);
      closeRegisterModal();
    });
  }

  function saveEditedYouth() {
    const name = editYouthName.trim();

    if (!editingYouthId) {
      return;
    }

    if (!hasEditYouthChanges) {
      return;
    }

    if (!name) {
      setEditYouthError("청소년 이름을 입력하세요.");
      return;
    }

    if (
      youths.some(
        (youth) => youth.id !== editingYouthId && youth.name === name,
      )
    ) {
      setEditYouthError("이미 등록된 청소년 이름입니다.");
      return;
    }

    startPendingAction(async () => {
      const result = await updateYouth(editingYouthId, {
        name,
        admissionDate: editYouthAdmissionDate,
        dischargeDate: editYouthDischargeDate,
        age: editYouthAge,
        phone: getRegistrationPhoneValue(
          editYouthPhoneMiddle,
          editYouthPhoneLast,
        ),
        familyContacts: editYouthFamilyContacts.map((contact) => ({
          relationship: contact.relationship,
          phone: getRegistrationPhoneValue(
            contact.phoneMiddle,
            contact.phoneLast,
          ),
        })),
      });

      if (!result.ok) {
        setEditYouthError(result.error);
        return;
      }

      setYouths((current) =>
        current
          .map((youth) =>
            youth.id === result.data.youth.id ? result.data.youth : youth,
          )
          .sort((first, second) => first.name.localeCompare(second.name, "ko")),
      );
      setActiveYouthId(result.data.youth.id);
      closeEditYouthModal();
    });
  }

  function updateSelectedNote() {
    if (!selected || !selectedNote) {
      return;
    }

    if (!editing) {
      setDraft(createDraftFromNote(selectedNote));
      setNoteError("");
      setEditing(true);
      return;
    }

    const values = {
      title: draft.title.trim() || selectedNote.title,
      summary: draft.summary.trim() || selectedNote.summary,
      detail: draft.detail.trim() || selectedNote.detail,
      category: draft.category,
      recordedAt: draft.recordedAt,
      author: draft.author.trim() || selectedNote.author,
      priority: draft.priority,
    };

    startPendingAction(async () => {
      const result = await updateYouthNote(selectedNote.id, values);

      if (!result.ok) {
        setNoteError(result.error);
        return;
      }

      const nextNote = result.data.note;

      setYouths((current) =>
        current.map((youth) =>
          youth.id === selected.youthId
            ? {
                ...youth,
                notes: youth.notes.map((note) =>
                  note.id === selected.noteId ? nextNote : note,
                ),
              }
            : youth,
        ),
      );
      setDraft(createDraftFromNote(nextNote));
      setNoteError("");
      setEditing(false);
    });
  }

  function deleteSelectedNote() {
    if (!selected || !selectedNote) {
      return;
    }

    if (!window.confirm(`"${selectedNote.title}" 특이사항을 삭제할까요?`)) {
      return;
    }

    startPendingAction(async () => {
      const result = await deleteYouthNote(selectedNote.id);

      if (!result.ok) {
        setNoteError(result.error);
        return;
      }

      setYouths((current) =>
        current.map((youth) =>
          youth.id === result.data.youthId
            ? {
                ...youth,
                notes: youth.notes.filter(
                  (note) => note.id !== result.data.noteId,
                ),
              }
            : youth,
        ),
      );
      closeModal();
    });
  }

  return (
    <>
      <section className="rounded-md border border-[#d9dee7] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#eef1f5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              청소년별 특이사항
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              {youths.length}명 · 특이사항 {totalNotes}건
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <button
              type="button"
              onClick={openRegisterModal}
              className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
            >
              등록
            </button>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#697386]">
              {youthNotePriorities.map((priority) => (
                <span
                  key={priority}
                  className={`rounded-full border px-2.5 py-1 ${priorityStyles[priority]}`}
                >
                  {priority}
                </span>
              ))}
            </div>
          </div>
        </div>

        {registeringYouth ? (
          <div
            role="presentation"
            className="fixed inset-0 z-50 grid place-items-center bg-[#101418]/55 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeRegisterModal();
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="youth-register-modal-title"
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-[#d9dee7] bg-white shadow-xl"
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  registerYouth();
                }}
              >
                <header className="relative border-b border-[#eef1f5] px-5 py-4 pr-20">
                  <button
                    type="button"
                    onClick={closeRegisterModal}
                    className="absolute right-4 top-4 h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                  >
                    닫기
                  </button>
                  <h2
                    id="youth-register-modal-title"
                    className="break-words text-xl font-semibold text-[#16181d] [overflow-wrap:anywhere]"
                  >
                    청소년 등록
                  </h2>
                </header>

                <div className="grid gap-4 px-5 py-5">
                  <label>
                    <span className="flex items-center gap-2 text-sm font-semibold text-[#394150]">
                      이름
                      <span className="rounded-full border border-[#b8d9d7] bg-[#eef7f6] px-2 py-0.5 text-[11px] font-semibold text-[#196b69]">
                        필수
                      </span>
                    </span>
                    <input
                      value={newYouthName}
                      onChange={(event) => {
                        setNewYouthName(event.target.value);
                        setRegisterError("");
                      }}
                      autoFocus
                      className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <OptionalRegisterField label="입소날짜">
                      <input
                        type="date"
                        value={newYouthAdmissionDate}
                        onChange={(event) =>
                          setNewYouthAdmissionDate(event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </OptionalRegisterField>
                    <OptionalRegisterField label="퇴소날짜">
                      <input
                        type="date"
                        value={newYouthDischargeDate}
                        onChange={(event) =>
                          setNewYouthDischargeDate(event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </OptionalRegisterField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <OptionalRegisterField label="나이">
                      <input
                        type="number"
                        min="0"
                        max="150"
                        value={newYouthAge}
                        onChange={(event) => setNewYouthAge(event.target.value)}
                        className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </OptionalRegisterField>
                    <OptionalRegisterField label="핸드폰 번호">
                      <div className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                        <input
                          type="tel"
                          value="010"
                          readOnly
                          aria-label="핸드폰 번호 앞자리"
                          className="h-11 w-full rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 text-center text-sm font-semibold text-[#394150]"
                        />
                        <input
                          type="tel"
                          value={newYouthPhoneMiddle}
                          onChange={(event) => {
                            const nextValue = normalizePhonePart(
                              event.target.value,
                              4,
                            );

                            setNewYouthPhoneMiddle(nextValue);
                            focusPhoneInputWhenFilled(
                              nextValue,
                              4,
                              newYouthPhoneLastRef.current,
                            );
                          }}
                          inputMode="numeric"
                          maxLength={4}
                          aria-label="핸드폰 번호 중간자리"
                          className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                        />
                        <input
                          type="tel"
                          ref={newYouthPhoneLastRef}
                          value={newYouthPhoneLast}
                          onChange={(event) =>
                            setNewYouthPhoneLast(
                              normalizePhonePart(event.target.value, 4),
                            )
                          }
                          inputMode="numeric"
                          maxLength={4}
                          aria-label="핸드폰 번호 끝자리"
                          className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                        />
                      </div>
                    </OptionalRegisterField>
                  </div>

                  <section className="rounded-md border border-[#d9dee7] bg-[#fbfcfd] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold text-[#394150]">
                        가족 연락처
                      </h3>
                      <button
                        type="button"
                        onClick={addFamilyContact}
                        className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        가족 추가
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3">
                      {newYouthFamilyContacts.map((contact, index) => (
                        <div
                          key={contact.key}
                          className="grid gap-3 rounded-md border border-[#eef1f5] bg-white p-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_auto] sm:items-center"
                        >
                          <label>
                            <input
                              value={contact.relationship}
                              onChange={(event) =>
                                updateFamilyContact(contact.key, {
                                  relationship: event.target.value,
                                })
                              }
                              placeholder="어머니, 아버지 등"
                              aria-label={`가족 ${index + 1} 관계`}
                              className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                            />
                          </label>
                          <div>
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                              <input
                                type="tel"
                                value="010"
                                readOnly
                                aria-label={`가족 ${index + 1} 연락처 앞자리`}
                                className="h-11 w-full rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 text-center text-sm font-semibold text-[#394150]"
                              />
                              <input
                                type="tel"
                                value={contact.phoneMiddle}
                                onChange={(event) => {
                                  const nextValue = normalizePhonePart(
                                    event.target.value,
                                    4,
                                  );

                                  updateFamilyContact(contact.key, {
                                    phoneMiddle: nextValue,
                                  });
                                  focusPhoneInputWhenFilled(
                                    nextValue,
                                    4,
                                    familyPhoneLastRefs.current[contact.key],
                                  );
                                }}
                                inputMode="numeric"
                                maxLength={4}
                                aria-label={`가족 ${index + 1} 연락처 중간자리`}
                                className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                              />
                              <input
                                type="tel"
                                ref={(element) => {
                                  if (element) {
                                    familyPhoneLastRefs.current[contact.key] =
                                      element;
                                  } else {
                                    delete familyPhoneLastRefs.current[
                                      contact.key
                                    ];
                                  }
                                }}
                                value={contact.phoneLast}
                                onChange={(event) =>
                                  updateFamilyContact(contact.key, {
                                    phoneLast: normalizePhonePart(
                                      event.target.value,
                                      4,
                                    ),
                                  })
                                }
                                inputMode="numeric"
                                maxLength={4}
                                aria-label={`가족 ${index + 1} 연락처 끝자리`}
                                className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFamilyContact(contact.key)}
                            disabled={newYouthFamilyContacts.length <= 1}
                            className={[
                              "h-11 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 sm:w-16",
                              newYouthFamilyContacts.length > 1
                                ? "border-[#b91c1c] bg-[#d92525] text-white hover:bg-[#b91c1c]"
                                : "border-[#cfd6e3] bg-white text-[#394150] hover:bg-[#f7f9fc]",
                            ].join(" ")}
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  {registerError ? (
                    <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                      {registerError}
                    </p>
                  ) : null}
                </div>

                <footer className="flex justify-end gap-2 border-t border-[#eef1f5] bg-white px-5 py-4">
                  <button
                    type="submit"
                    disabled={pendingAction}
                    className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f]"
                  >
                    {pendingAction ? "등록 중" : "등록"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}

        {editingYouthId ? (
          <div
            role="presentation"
            className="fixed inset-0 z-50 grid place-items-center bg-[#101418]/55 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeEditYouthModal();
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="youth-edit-modal-title"
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-[#d9dee7] bg-white shadow-xl"
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  saveEditedYouth();
                }}
              >
                <header className="relative border-b border-[#eef1f5] px-5 py-4 pr-20">
                  <button
                    type="button"
                    onClick={closeEditYouthModal}
                    className="absolute right-4 top-4 h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                  >
                    닫기
                  </button>
                  <h2
                    id="youth-edit-modal-title"
                    className="break-words text-xl font-semibold text-[#16181d] [overflow-wrap:anywhere]"
                  >
                    청소년 정보 수정
                  </h2>
                </header>

                <div className="grid gap-4 px-5 py-5">
                  <label>
                    <span className="flex items-center gap-2 text-sm font-semibold text-[#394150]">
                      이름
                      <span className="rounded-full border border-[#b8d9d7] bg-[#eef7f6] px-2 py-0.5 text-[11px] font-semibold text-[#196b69]">
                        필수
                      </span>
                    </span>
                    <input
                      value={editYouthName}
                      onChange={(event) => {
                        setEditYouthName(event.target.value);
                        setEditYouthError("");
                      }}
                      autoFocus
                      className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <OptionalRegisterField label="입소날짜">
                      <input
                        type="date"
                        value={editYouthAdmissionDate}
                        onChange={(event) =>
                          setEditYouthAdmissionDate(event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </OptionalRegisterField>
                    <OptionalRegisterField label="퇴소날짜">
                      <input
                        type="date"
                        value={editYouthDischargeDate}
                        onChange={(event) =>
                          setEditYouthDischargeDate(event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </OptionalRegisterField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <OptionalRegisterField label="나이">
                      <input
                        type="number"
                        min="0"
                        max="150"
                        value={editYouthAge}
                        onChange={(event) => setEditYouthAge(event.target.value)}
                        className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </OptionalRegisterField>
                    <OptionalRegisterField label="핸드폰 번호">
                      <div className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                        <input
                          type="tel"
                          value="010"
                          readOnly
                          aria-label="수정 핸드폰 번호 앞자리"
                          className="h-11 w-full rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 text-center text-sm font-semibold text-[#394150]"
                        />
                        <input
                          type="tel"
                          value={editYouthPhoneMiddle}
                          onChange={(event) => {
                            const nextValue = normalizePhonePart(
                              event.target.value,
                              4,
                            );

                            setEditYouthPhoneMiddle(nextValue);
                            focusPhoneInputWhenFilled(
                              nextValue,
                              4,
                              editYouthPhoneLastRef.current,
                            );
                          }}
                          inputMode="numeric"
                          maxLength={4}
                          aria-label="수정 핸드폰 번호 중간자리"
                          className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                        />
                        <input
                          type="tel"
                          ref={editYouthPhoneLastRef}
                          value={editYouthPhoneLast}
                          onChange={(event) =>
                            setEditYouthPhoneLast(
                              normalizePhonePart(event.target.value, 4),
                            )
                          }
                          inputMode="numeric"
                          maxLength={4}
                          aria-label="수정 핸드폰 번호 끝자리"
                          className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                        />
                      </div>
                    </OptionalRegisterField>
                  </div>

                  <section className="rounded-md border border-[#d9dee7] bg-[#fbfcfd] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold text-[#394150]">
                        가족 연락처
                      </h3>
                      <button
                        type="button"
                        onClick={addEditFamilyContact}
                        className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        가족 추가
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3">
                      {editYouthFamilyContacts.map((contact, index) => (
                        <div
                          key={contact.key}
                          className="grid gap-3 rounded-md border border-[#eef1f5] bg-white p-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_auto] sm:items-center"
                        >
                          <label>
                            <input
                              value={contact.relationship}
                              onChange={(event) =>
                                updateEditFamilyContact(contact.key, {
                                  relationship: event.target.value,
                                })
                              }
                              placeholder="어머니, 아버지 등"
                              aria-label={`수정 가족 ${index + 1} 관계`}
                              className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                            />
                          </label>
                          <div>
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                              <input
                                type="tel"
                                value="010"
                                readOnly
                                aria-label={`수정 가족 ${index + 1} 연락처 앞자리`}
                                className="h-11 w-full rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 text-center text-sm font-semibold text-[#394150]"
                              />
                              <input
                                type="tel"
                                value={contact.phoneMiddle}
                                onChange={(event) => {
                                  const nextValue = normalizePhonePart(
                                    event.target.value,
                                    4,
                                  );

                                  updateEditFamilyContact(contact.key, {
                                    phoneMiddle: nextValue,
                                  });
                                  focusPhoneInputWhenFilled(
                                    nextValue,
                                    4,
                                    editFamilyPhoneLastRefs.current[
                                      contact.key
                                    ],
                                  );
                                }}
                                inputMode="numeric"
                                maxLength={4}
                                aria-label={`수정 가족 ${index + 1} 연락처 중간자리`}
                                className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                              />
                              <input
                                type="tel"
                                ref={(element) => {
                                  if (element) {
                                    editFamilyPhoneLastRefs.current[
                                      contact.key
                                    ] = element;
                                  } else {
                                    delete editFamilyPhoneLastRefs.current[
                                      contact.key
                                    ];
                                  }
                                }}
                                value={contact.phoneLast}
                                onChange={(event) =>
                                  updateEditFamilyContact(contact.key, {
                                    phoneLast: normalizePhonePart(
                                      event.target.value,
                                      4,
                                    ),
                                  })
                                }
                                inputMode="numeric"
                                maxLength={4}
                                aria-label={`수정 가족 ${index + 1} 연락처 끝자리`}
                                className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEditFamilyContact(contact.key)}
                            disabled={editYouthFamilyContacts.length <= 1}
                            className={[
                              "h-11 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 sm:w-16",
                              editYouthFamilyContacts.length > 1
                                ? "border-[#b91c1c] bg-[#d92525] text-white hover:bg-[#b91c1c]"
                                : "border-[#cfd6e3] bg-white text-[#394150] hover:bg-[#f7f9fc]",
                            ].join(" ")}
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  {editYouthError ? (
                    <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                      {editYouthError}
                    </p>
                  ) : null}
                </div>

                <footer className="flex justify-end gap-2 border-t border-[#eef1f5] bg-white px-5 py-4">
                  <button
                    type="submit"
                    disabled={pendingAction || !hasEditYouthChanges}
                    className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] disabled:cursor-not-allowed disabled:bg-[#cfd6e3] disabled:text-[#697386]"
                  >
                    {pendingAction ? "저장 중" : "저장"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}

        {youths.length > 0 ? (
          <>
            <div className="border-b border-[#eef1f5] px-4 pt-3">
              <div
                role="tablist"
                aria-label="청소년 선택"
                className="scrollbar-none flex gap-2 overflow-x-auto pb-3"
              >
                {youths.map((youth) => {
                  const active = youth.id === activeYouth?.id;

                  return (
                    <button
                      key={youth.id}
                      id={`${youth.id}-tab`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`${youth.id}-panel`}
                      onClick={() => selectYouth(youth.id)}
                      className={[
                        "inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#d7eceb]",
                        active
                          ? "border-[#196b69] bg-[#196b69] text-white"
                          : "border-[#d9dee7] bg-white text-[#394150] hover:border-[#b9c4d2] hover:bg-[#f7f9fc]",
                      ].join(" ")}
                    >
                      <span>{youth.name}</span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-xs",
                          active
                            ? "bg-white/20 text-white"
                            : "bg-[#eef4f4] text-[#196b69]",
                        ].join(" ")}
                      >
                        {youth.notes.length}건
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {activeYouth ? (
              <div className="p-4">
                <YouthMetaSummary
                  youth={activeYouth}
                  onEdit={() => openEditYouthModal(activeYouth)}
                />

                <section
                  id={`${activeYouth.id}-panel`}
                  role="tabpanel"
                  aria-labelledby={`${activeYouth.id}-tab`}
                  className="mt-4 min-h-[24rem] rounded-md border border-[#d9dee7] bg-[#fbfcfd]"
                >
                  <header className="border-b border-[#eef1f5] bg-white px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="break-words text-base font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                        {activeYouth.name}
                      </h3>
                      <span className="text-sm font-medium text-[#697386]">
                        특이사항 {activeYouth.notes.length}건
                      </span>
                    </div>
                  </header>

                  <div className="grid gap-3 p-3">
                    {activeYouth.notes.length > 0 ? (
                      activeYouth.notes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => openNote(activeYouth.id, note.id)}
                          className={`relative min-h-32 rounded-md border border-[#d9dee7] bg-white p-4 text-left shadow-sm transition before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full hover:border-[#196b69] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#d7eceb] ${priorityAccentStyles[note.priority]}`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                                {note.title}
                              </span>
                              <span className="mt-1 block text-xs font-medium text-[#697386]">
                                {note.category} · {formatDate(note.recordedAt)}
                              </span>
                            </span>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityStyles[note.priority]}`}
                            >
                              {note.priority}
                            </span>
                          </span>
                          <span className="mt-3 block line-clamp-3 text-sm leading-6 text-[#394150]">
                            {note.summary}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-[#cfd6e3] bg-white px-4 py-6 text-sm text-[#697386]">
                        등록된 특이사항이 없습니다.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            ) : null}
          </>
        ) : (
          <p className="p-5 text-sm text-[#697386]">
            등록된 청소년이 없습니다.
          </p>
        )}
      </section>

      {selectedNote && selectedYouth ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-[#101418]/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="youth-note-modal-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-[#d9dee7] bg-white shadow-xl"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updateSelectedNote();
              }}
            >
              <header className="relative border-b border-[#eef1f5] px-5 py-4 pr-20">
                <button
                  type="button"
                  onClick={closeModal}
                  className="absolute right-4 top-4 h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
                >
                  닫기
                </button>
                <p className="text-sm font-semibold text-[#697386]">
                  {selectedYouth.name}
                </p>
                {editing ? (
                  <>
                    <h2 id="youth-note-modal-title" className="sr-only">
                      {draft.title || selectedNote.title}
                    </h2>
                    <label className="mt-2 block">
                      <span className="sr-only">특이사항 제목</span>
                      <input
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-lg font-semibold text-[#16181d] outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    </label>
                  </>
                ) : (
                  <h2
                    id="youth-note-modal-title"
                    className="mt-1 break-words text-xl font-semibold text-[#16181d] [overflow-wrap:anywhere]"
                  >
                    {selectedNote.title}
                  </h2>
                )}
              </header>

              <div className="grid gap-5 px-5 py-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <NoteField label="분류">
                    {editing ? (
                      <select
                        value={draft.category}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            category: event.target.value as YouthNoteCategory,
                          }))
                        }
                        className="h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        {youthNoteCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    ) : (
                      selectedNote.category
                    )}
                  </NoteField>
                  <NoteField label="기록일">
                    {editing ? (
                      <input
                        type="date"
                        value={draft.recordedAt}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            recordedAt: event.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      />
                    ) : (
                      formatDate(selectedNote.recordedAt)
                    )}
                  </NoteField>
                  <NoteField label="중요도">
                    {editing ? (
                      <select
                        value={draft.priority}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            priority: event.target.value as YouthNotePriority,
                          }))
                        }
                        className="h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                      >
                        {youthNotePriorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    ) : (
                      selectedNote.priority
                    )}
                  </NoteField>
                </div>

                <NoteField label="기록자">
                  {editing ? (
                    <input
                      value={draft.author}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          author: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-[#cfd6e3] px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                    />
                  ) : (
                    selectedNote.author
                  )}
                </NoteField>

                <NoteField label="요약">
                  {editing ? (
                    <textarea
                      value={draft.summary}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          summary: event.target.value,
                        }))
                      }
                      rows={3}
                      className="w-full resize-y rounded-md border border-[#cfd6e3] px-3 py-2 text-sm leading-6 outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                    />
                  ) : (
                    selectedNote.summary
                  )}
                </NoteField>

                <NoteField label="세부사항">
                  {editing ? (
                    <textarea
                      value={draft.detail}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          detail: event.target.value,
                        }))
                      }
                      rows={6}
                      className="w-full resize-y rounded-md border border-[#cfd6e3] px-3 py-2 text-sm leading-6 outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{selectedNote.detail}</span>
                  )}
                </NoteField>

                {noteError ? (
                  <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                    {noteError}
                  </p>
                ) : null}
              </div>

              <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#eef1f5] bg-white px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={deleteSelectedNote}
                  disabled={pendingAction}
                  className="h-10 rounded-md border border-[#f0c3bd] bg-[#fff5f2] px-4 text-sm font-semibold text-[#9d3328] transition hover:bg-[#ffe9e4]"
                >
                  {pendingAction ? "처리 중" : "삭제"}
                </button>
                <button
                  type="submit"
                  disabled={pendingAction}
                  className="h-10 rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f]"
                >
                  {pendingAction && editing ? "저장 중" : "수정"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function NoteField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#697386]">{label}</p>
      <div className="mt-2 text-sm leading-6 text-[#394150]">{children}</div>
    </div>
  );
}

function OptionalRegisterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="text-sm font-semibold text-[#394150]">{label}</span>
      {children}
    </label>
  );
}

function createFamilyContactDraft(key: number): FamilyContactDraft {
  return {
    key: `family-contact-${key}`,
    relationship: "",
    phoneMiddle: "",
    phoneLast: "",
  };
}

function createFamilyContactDraftFromProfile(
  contact: YouthProfile["familyContacts"][number],
): FamilyContactDraft {
  const phoneDraft = createPhoneDraftFromValue(contact.phone);

  return {
    key: contact.id,
    relationship: contact.relationship ?? "",
    phoneMiddle: phoneDraft.middle,
    phoneLast: phoneDraft.last,
  };
}

function YouthMetaSummary({
  onEdit,
  youth,
}: {
  onEdit: () => void;
  youth: YouthProfile;
}) {
  const dday = getDischargeDday(youth.dischargeDate);

  return (
    <section
      aria-label={`${youth.name} 기본 정보`}
      className="rounded-md border border-[#d9dee7] bg-white p-4"
    >
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="h-9 rounded-md border border-[#196b69] bg-[#196b69] px-3 text-sm font-semibold text-white transition hover:bg-[#12514f] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
        >
          기본 정보 수정
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <YouthMetaItem label="입소 날짜" value={formatOptionalDate(youth.admissionDate)} />
        <YouthMetaItem label="퇴소 날짜" value={formatOptionalDate(youth.dischargeDate)} />
        <YouthMetaItem label="퇴소까지" value={dday} highlight />
        <YouthMetaItem
          label="나이"
          value={youth.age === null ? "미입력" : `${youth.age}세`}
        />
        <YouthMetaItem label="핸드폰 번호" value={youth.phone ?? "미입력"} />
      </div>
      <div className="mt-3 border-t border-[#eef1f5] pt-3">
        <p className="text-xs font-semibold text-[#697386]">가족 연락처</p>
        {youth.familyContacts.length > 0 ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {youth.familyContacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-3"
              >
                <p className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                  {contact.relationship ?? "관계 미입력"}
                </p>
                <p className="mt-1 break-words text-sm font-medium text-[#394150] [overflow-wrap:anywhere]">
                  {contact.phone ?? "연락처 미입력"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm font-medium text-[#394150]">미입력</p>
        )}
      </div>
    </section>
  );
}

function YouthMetaItem({
  highlight = false,
  label,
  value,
}: {
  highlight?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-3">
      <p className="text-xs font-semibold text-[#697386]">{label}</p>
      <p
        className={[
          "mt-1 break-words text-sm font-semibold [overflow-wrap:anywhere]",
          highlight ? "text-[#196b69]" : "text-[#16181d]",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function emptyDraft(): NoteDraft {
  return {
    title: "",
    summary: "",
    detail: "",
    category: "보호관찰",
    recordedAt: "",
    author: "",
    priority: "보통",
  };
}

function createDraftFromNote(note: YouthSpecialNote): NoteDraft {
  return {
    title: note.title,
    summary: note.summary,
    detail: note.detail,
    category: note.category,
    recordedAt: note.recordedAt,
    author: note.author,
    priority: note.priority,
  };
}

function getRegistrationPhoneValue(middle: string, last: string) {
  return middle || last ? `010-${middle}-${last}` : "";
}

function createPhoneDraftFromValue(value: string | null) {
  const match = /^010-(\d{3,4})-(\d{4})$/.exec(value ?? "");

  return {
    middle: match?.[1] ?? "",
    last: match?.[2] ?? "",
  };
}

function hasYouthDraftChanged(
  youth: YouthProfile,
  draft: {
    admissionDate: string;
    age: string;
    dischargeDate: string;
    familyContacts: FamilyContactDraft[];
    name: string;
    phoneLast: string;
    phoneMiddle: string;
  },
) {
  const phoneDraft = createPhoneDraftFromValue(youth.phone);

  return (
    youth.name !== draft.name.trim() ||
    (youth.admissionDate ?? "") !== draft.admissionDate ||
    (youth.dischargeDate ?? "") !== draft.dischargeDate ||
    (youth.age === null ? "" : String(youth.age)) !== draft.age.trim() ||
    phoneDraft.middle !== draft.phoneMiddle ||
    phoneDraft.last !== draft.phoneLast ||
    JSON.stringify(getComparableFamilyContacts(youth.familyContacts)) !==
      JSON.stringify(getComparableFamilyContactDrafts(draft.familyContacts))
  );
}

function getComparableFamilyContacts(
  contacts: YouthProfile["familyContacts"],
) {
  return contacts
    .map((contact) => ({
      phone: contact.phone ?? "",
      relationship: contact.relationship ?? "",
    }))
    .filter((contact) => contact.relationship || contact.phone);
}

function getComparableFamilyContactDrafts(contacts: FamilyContactDraft[]) {
  return contacts
    .map((contact) => ({
      phone: getRegistrationPhoneValue(contact.phoneMiddle, contact.phoneLast),
      relationship: contact.relationship.trim(),
    }))
    .filter((contact) => contact.relationship || contact.phone);
}

function normalizePhonePart(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function focusPhoneInputWhenFilled(
  value: string,
  maxLength: number,
  input: HTMLInputElement | null | undefined,
) {
  if (value.length === maxLength) {
    input?.focus();
  }
}

function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month, day] = value.split("-");

  return `${year}.${month}.${day}`;
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "미입력";
}

function getDischargeDday(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "미정";
  }

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const target = new Date(`${value}T00:00:00`);
  const diff = Math.round(
    (target.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diff === 0) {
    return "D-Day";
  }

  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}
