"use client";

import { useActionState } from "react";
import {
  type AdminDepartmentFormState,
  createAdminDepartmentAction,
  updateAdminDepartmentAction,
} from "@/app/admin/actions";
import {
  AdminEditModal,
  FormMessage,
  SelectField,
  TextField,
} from "@/components/admin-form-controls";
import { adminListStyles } from "@/lib/admin-list-styles";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type AdminDepartmentManagementProps = {
  departments: AdminDepartment[];
};

type AdminDepartment = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  parent: {
    name: string;
  } | null;
  _count: {
    children: number;
    users: number;
  };
};

const initialState: AdminDepartmentFormState = {};

export function AdminDepartmentManagement({
  departments,
}: AdminDepartmentManagementProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <CreateDepartmentForm departments={departments} />

      <div className={adminListStyles.panel}>
        <div className={adminListStyles.header}>
          <div>
            <h2 className={adminListStyles.title}>부서 목록</h2>
            <p className={adminListStyles.description}>
              부서명, 상위 부서와 사용 여부를 관리합니다.
            </p>
          </div>
          <span className={adminListStyles.count}>
            총 {departments.length}개
          </span>
        </div>

        <div className="divide-y divide-[#eef1f5]">
          {departments.map((department) => (
            <DepartmentListItem
              key={department.id}
              department={department}
              departments={departments}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function DepartmentListItem({
  department,
  departments,
}: {
  department: AdminDepartment;
  departments: AdminDepartment[];
}) {
  return (
    <AdminEditModal
      title={`${department.name} 부서 수정`}
      description="부서명, 상위 부서, 사용 여부를 수정합니다."
      trigger={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#16181d]">
              {department.name}
            </p>
            <p className="mt-1 text-xs text-[#697386]">
              상위 {department.parent ? department.parent.name : "없음"} · 사용자{" "}
              {department._count.users}명 · 하위 부서{" "}
              {department._count.children}개
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill active={department.isActive} />
            <span className="rounded-md border border-[#cfd6e3] bg-white px-3 py-1.5 text-xs font-semibold text-[#394150]">
              수정
            </span>
          </div>
        </div>
      }
    >
      <EditDepartmentForm department={department} departments={departments} />
    </AdminEditModal>
  );
}

function CreateDepartmentForm({
  departments,
}: {
  departments: AdminDepartment[];
}) {
  const [state, formAction, pending] = useActionState(
    createAdminDepartmentAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="self-start rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <h2 className="text-base font-semibold">부서 추가</h2>
      <p className="mt-1 text-sm text-[#697386]">
        결재선과 사용자 배정에 사용할 조직 단위를 추가합니다.
      </p>

      <div className="mt-5 grid gap-4">
        <TextField
          label="부서명"
          name="name"
          defaultValue={state.values?.name}
          placeholder="바자울"
        />
        <SelectField
          label="상위 부서"
          name="parentId"
          defaultValue={state.values?.parentId}
          options={getParentDepartmentOptions(departments)}
        />
        <TextField
          label="정렬 순서"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={state.values?.sortOrder ?? "0"}
        />
        <DepartmentStatusField
          value={state.values?.isActive ?? "ACTIVE"}
        />
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
        {pending ? "생성 중" : "부서 생성"}
      </button>
    </form>
  );
}

function EditDepartmentForm({
  department,
  departments,
}: {
  department: AdminDepartment;
  departments: AdminDepartment[];
}) {
  const updateDepartment = updateAdminDepartmentAction.bind(
    null,
    department.id,
  );
  const [state, formAction, pending] = useActionState(
    updateDepartment,
    initialState,
  );

  return (
    <form action={formAction}>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <TextField
          label="부서명"
          name="name"
          defaultValue={state.values?.name ?? department.name}
        />
        <SelectField
          label="상위 부서"
          name="parentId"
          defaultValue={state.values?.parentId ?? department.parentId ?? ""}
          options={getParentDepartmentOptions(departments, department.id)}
        />
        <TextField
          label="순서"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={state.values?.sortOrder ?? department.sortOrder}
        />
        <DepartmentStatusField
          value={state.values?.isActive ?? getStatusValue(department.isActive)}
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
        <span>사용자 {department._count.users}명</span>
        <span>·</span>
        <span>하위 부서 {department._count.children}개</span>
        <span>·</span>
        <span>
          상위 {department.parent ? department.parent.name : "없음"}
        </span>
      </div>

      <FormMessage state={state} />
    </form>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={[
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        active
          ? "bg-[#e8f5ed] text-[#22633a]"
          : "bg-[#f3f5f8] text-[#697386]",
      ].join(" ")}
    >
      {active ? "활성" : "비활성"}
    </span>
  );
}

function DepartmentStatusField({ value }: { value: string }) {
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

function getParentDepartmentOptions(
  departments: AdminDepartment[],
  currentDepartmentId?: string,
) {
  return [
    {
      value: "",
      label: "상위 부서 없음",
    },
    ...departments.map((department) => ({
      value: department.id,
      label: department.name,
      disabled: department.id === currentDepartmentId,
    })),
  ];
}

function getStatusValue(isActive: boolean) {
  return isActive ? "ACTIVE" : "INACTIVE";
}
