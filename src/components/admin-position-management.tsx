"use client";

import { useActionState } from "react";
import {
  type AdminPositionFormState,
  createAdminPositionAction,
  updateAdminPositionAction,
} from "@/app/admin/actions";
import {
  FormMessage,
  SelectField,
  TextField,
} from "@/components/admin-form-controls";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type AdminPositionManagementProps = {
  positions: AdminPosition[];
};

type AdminPosition = {
  id: string;
  name: string;
  level: number;
  sortOrder: number;
  isActive: boolean;
  _count: {
    users: number;
  };
};

const initialState: AdminPositionFormState = {};

export function AdminPositionManagement({
  positions,
}: AdminPositionManagementProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <CreatePositionForm />

      <div className="rounded-md border border-[#d9dee7] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">직급 목록</h2>
            <p className="mt-1 text-sm text-[#697386]">
              결재선과 사용자 정보에 표시할 직급 체계를 관리합니다.
            </p>
          </div>
          <span className="rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 py-1.5 text-sm font-semibold text-[#394150]">
            총 {positions.length}개
          </span>
        </div>

        <div className="divide-y divide-[#eef1f5]">
          {positions.map((position) => (
            <EditPositionForm key={position.id} position={position} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CreatePositionForm() {
  const [state, formAction, pending] = useActionState(
    createAdminPositionAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="self-start rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <h2 className="text-base font-semibold">직급 추가</h2>
      <p className="mt-1 text-sm text-[#697386]">
        낮은 레벨은 실무자, 높은 레벨은 상위 결재권자로 사용합니다.
      </p>

      <div className="mt-5 grid gap-4">
        <TextField
          label="직급명"
          name="name"
          defaultValue={state.values?.name}
          placeholder="과장"
        />
        <TextField
          label="레벨"
          name="level"
          type="number"
          min={1}
          defaultValue={state.values?.level}
          placeholder="1"
        />
        <TextField
          label="정렬 순서"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={state.values?.sortOrder ?? "0"}
        />
        <PositionStatusField value={state.values?.isActive ?? "ACTIVE"} />
      </div>

      <FormMessage state={state} />

      <button
        type="submit"
        disabled={pending}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.create,
          "mt-5 h-10 w-full px-4 text-sm",
        )}
      >
        {pending ? "생성 중" : "직급 생성"}
      </button>
    </form>
  );
}

function EditPositionForm({ position }: { position: AdminPosition }) {
  const updatePosition = updateAdminPositionAction.bind(null, position.id);
  const [state, formAction, pending] = useActionState(
    updatePosition,
    initialState,
  );

  return (
    <form action={formAction} className="p-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <TextField
          label="직급명"
          name="name"
          defaultValue={state.values?.name ?? position.name}
        />
        <TextField
          label="레벨"
          name="level"
          type="number"
          min={1}
          defaultValue={state.values?.level ?? position.level}
        />
        <TextField
          label="순서"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={state.values?.sortOrder ?? position.sortOrder}
        />
        <PositionStatusField
          value={state.values?.isActive ?? getStatusValue(position.isActive)}
        />

        <div className="flex min-w-0 items-end sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 w-full min-w-0 px-4 text-sm",
            )}
          >
            {pending ? "저장 중" : "저장"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#697386]">
        <span>사용자 {position._count.users}명</span>
        <span>·</span>
        <span>레벨 {position.level}</span>
        <span>·</span>
        <span>{position.isActive ? "활성" : "비활성"}</span>
      </div>

      <FormMessage state={state} />
    </form>
  );
}

function PositionStatusField({ value }: { value: string }) {
  return (
    <SelectField
      label="상태"
      name="isActive"
      defaultValue={value}
      options={[
        { value: "ACTIVE", label: "활성" },
        { value: "INACTIVE", label: "비활성" },
      ]}
    />
  );
}

function getStatusValue(isActive: boolean) {
  return isActive ? "ACTIVE" : "INACTIVE";
}
