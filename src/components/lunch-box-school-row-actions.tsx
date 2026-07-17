"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  setLunchBoxSchoolActiveAction,
  updateLunchBoxSchoolAction,
} from "@/app/work-schedule/lunch-boxes/actions";
import { AppModal } from "@/components/app-modal";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  isLunchBoxSchoolType,
  lunchBoxSchoolTypes,
  type LunchBoxSchool,
  type LunchBoxSchoolFormState,
} from "@/lib/lunch-box-counts-core";

const initialState: LunchBoxSchoolFormState = {};
const inputClassName =
  "mt-2 h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]";
const fieldLabelClassName =
  "block text-xs font-semibold leading-4 text-[#697386]";

export function LunchBoxSchoolRowActions({
  school,
}: {
  school: LunchBoxSchool;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [isTogglePending, setIsTogglePending] = useState(false);

  function openEditModal() {
    setModalKey((currentKey) => currentKey + 1);
    setIsEditOpen(true);
  }

  async function toggleActive() {
    setIsTogglePending(true);

    try {
      await setLunchBoxSchoolActiveAction(school.id, !school.active);
    } finally {
      setIsTogglePending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={openEditModal}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.neutral,
          "h-9 px-3 text-xs",
        )}
      >
        편집
      </button>
      <button
        type="button"
        disabled={isTogglePending}
        onClick={toggleActive}
        className={buttonClass(
          buttonStyles.base,
          school.active ? buttonStyles.dangerOutline : buttonStyles.neutral,
          "h-9 px-3 text-xs",
        )}
      >
        {isTogglePending ? "처리 중" : school.active ? "비활성화" : "활성화"}
      </button>

      {isEditOpen ? (
        <LunchBoxSchoolEditModal
          key={modalKey}
          school={school}
          onClose={() => setIsEditOpen(false)}
        />
      ) : null}
    </div>
  );
}

function LunchBoxSchoolEditModal({
  school,
  onClose,
}: {
  school: LunchBoxSchool;
  onClose: () => void;
}) {
  const updateSchool = updateLunchBoxSchoolAction.bind(null, school.id);
  const editFormId = useId();
  const [state, formAction, pending] = useActionState(
    updateSchool,
    initialState,
  );
  const defaultType =
    state.values && isLunchBoxSchoolType(state.values.type)
      ? state.values.type
      : school.type;
  const [selectedType, setSelectedType] = useState(defaultType);

  useEffect(() => {
    if (state.success) {
      onClose();
    }
  }, [onClose, state.success]);

  return (
    <AppModal
      className="max-w-md"
      labelledBy={`lunch-box-school-edit-title-${school.id}`}
      onClose={onClose}
    >
      <form id={editFormId} action={formAction}>
        <div className="px-6 pb-6 pt-6">
          <p className="text-xs font-semibold text-[#697386]">학교 수정</p>
          <h3
            id={`lunch-box-school-edit-title-${school.id}`}
            className="mt-2 break-words text-xl font-semibold leading-tight text-[#16181d]"
          >
            {school.name}
          </h3>

          {state.error ? (
            <p className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
              {state.error}
            </p>
          ) : null}

          <div className="mt-5 grid min-w-0 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabelClassName}>학교명</span>
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={state.values?.name ?? school.name}
                disabled={pending}
                className={inputClassName}
              />
            </label>

            <label className="block min-w-0">
              <span className={fieldLabelClassName}>구분</span>
              <select
                name="type"
                value={selectedType}
                disabled={pending}
                onChange={(event) => {
                  const nextType = event.target.value;

                  if (isLunchBoxSchoolType(nextType)) {
                    setSelectedType(nextType);
                  }
                }}
                className={`${inputClassName} cursor-pointer`}
              >
                {lunchBoxSchoolTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </form>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#eef1f5] bg-white px-5 py-4">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-10 px-4 text-sm",
          )}
        >
          취소
        </button>
        <button
          type="submit"
          form={editFormId}
          disabled={pending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.save,
            "h-10 px-4 text-sm",
          )}
        >
          {pending ? "저장 중" : "저장"}
        </button>
      </footer>
    </AppModal>
  );
}
