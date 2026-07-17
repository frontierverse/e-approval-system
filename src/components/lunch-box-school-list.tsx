"use client";

import { useActionState, useState } from "react";
import { createLunchBoxSchoolAction } from "@/app/work-schedule/lunch-boxes/actions";
import { EmptyState } from "@/components/empty-state";
import { LunchBoxSchoolRowActions } from "@/components/lunch-box-school-row-actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  getLunchBoxSchoolTypeLabel,
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

export function LunchBoxSchoolList({
  schools,
}: {
  schools: LunchBoxSchool[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <LunchBoxSchoolRegistrationForm />
      <LunchBoxSchoolTable schools={schools} />
    </div>
  );
}

function LunchBoxSchoolRegistrationForm() {
  const [state, formAction, pending] = useActionState(
    createLunchBoxSchoolAction,
    initialState,
  );
  const defaultType =
    state.values && isLunchBoxSchoolType(state.values.type)
      ? state.values.type
      : "elementary";
  const [selectedType, setSelectedType] = useState(defaultType);

  return (
    <section
      key={state.resetKey ?? "draft"}
      className="rounded-md border border-[#d9dee7] bg-white p-5 shadow-sm"
    >
      <h2 className="text-base font-semibold text-[#16181d]">학교 등록</h2>

      <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block min-w-0 sm:col-span-2">
          <span className={fieldLabelClassName}>학교명</span>
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={state.values?.name ?? ""}
            placeholder="예: 이리동초"
            className={inputClassName}
          />
        </label>

        <label className="block min-w-0">
          <span className={fieldLabelClassName}>구분</span>
          <select
            name="type"
            value={selectedType}
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

        <button
          type="submit"
          disabled={pending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.save,
            "h-10 w-full self-end px-4 text-sm sm:w-auto",
          )}
        >
          {pending ? "등록 중" : "등록"}
        </button>
      </form>

      {state.error ? (
        <p className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-3 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a]">
          {state.success}
        </p>
      ) : null}
    </section>
  );
}

function LunchBoxSchoolTable({ schools }: { schools: LunchBoxSchool[] }) {
  if (schools.length === 0) {
    return (
      <EmptyState
        title="등록된 학교가 없습니다"
        description="위 양식으로 학교를 등록하면 도시락 개수 표에 나타납니다."
      />
    );
  }

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white shadow-sm">
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-base font-semibold text-[#16181d]">학교 목록</h2>
      </div>
      <div className="overflow-x-auto px-5 py-4">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#eef1f5] text-left text-xs font-semibold text-[#697386]">
              <th className="py-2 pr-3">학교명</th>
              <th className="px-2 py-2">구분</th>
              <th className="px-2 py-2">상태</th>
              <th className="px-2 py-2 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((school) => (
              <tr key={school.id} className="border-b border-[#f3f5f8]">
                <td className="py-2 pr-3 font-medium text-[#16181d]">
                  {school.name}
                </td>
                <td className="px-2 py-2 text-[#697386]">
                  {getLunchBoxSchoolTypeLabel(school.type)}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      school.active
                        ? "bg-[#e8f5ed] text-[#22633a]"
                        : "bg-[#f3f5f8] text-[#697386]"
                    }`}
                  >
                    {school.active ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <LunchBoxSchoolRowActions school={school} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
