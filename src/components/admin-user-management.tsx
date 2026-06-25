"use client";

import { useActionState, useId, useState } from "react";
import {
  type AdminUserFormState,
  createAdminUserAction,
  resetAdminUserProfileImageAction,
  updateAdminUserAction,
} from "@/app/admin/actions";
import {
  AdminEditModal,
  FormMessage,
  SelectField,
  TextField,
} from "@/components/admin-form-controls";
import { SplitDateInput } from "@/components/split-date-input";
import { UserAvatar } from "@/components/user-avatar";
import { adminListStyles } from "@/lib/admin-list-styles";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type AdminUserManagementProps = {
  users: AdminUser[];
  departments: AdminDepartment[];
  positions: AdminPosition[];
};

type AdminUser = {
  id: string;
  name: string;
  email: string | null;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  birthDate: string | null;
  hireDate: string | null;
  resignationDate: string | null;
  profileImageStorageKey: string | null;
  profileImageUpdatedAt: string | null;
  departmentId: string;
  positionId: string;
  department: {
    name: string;
  };
  position: {
    name: string;
  };
  _count: {
    draftedDocuments: number;
    approvalSteps: number;
  };
};

type AdminDepartment = {
  id: string;
  name: string;
  isActive: boolean;
};

type AdminPosition = {
  id: string;
  name: string;
  level: number;
  isActive: boolean;
};

const initialState: AdminUserFormState = {};

export function AdminUserManagement({
  users,
  departments,
  positions,
}: AdminUserManagementProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <CreateUserForm departments={departments} positions={positions} />

      <div className={adminListStyles.panel}>
        <div className={adminListStyles.header}>
          <div>
            <h2 className={adminListStyles.title}>직원 정보</h2>
            <p className={adminListStyles.description}>
              직원 계정 권한과 조직 정보를 수정합니다.
            </p>
          </div>
          <span className={adminListStyles.count}>
            총 {users.length}명
          </span>
        </div>

        <div className="divide-y divide-[#eef1f5]">
          {users.map((user) => (
            <UserListItem
              key={user.id}
              user={user}
              departments={departments}
              positions={positions}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function UserListItem({
  user,
  departments,
  positions,
}: {
  user: AdminUser;
  departments: AdminDepartment[];
  positions: AdminPosition[];
}) {
  return (
    <AdminEditModal
      title="직원 정보 수정"
      description="권한, 상태, 조직 정보와 비밀번호를 재설정합니다."
      showTabNavigationNotice
      trigger={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar user={user} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#16181d]">
                {user.name}
              </p>
              <p className="mt-1 truncate text-xs text-[#697386]">
                {formatUserEmail(user.email)} · {user.department.name} /{" "}
                {user.position.name}
              </p>
              <p className="mt-1 text-xs text-[#697386]">
                작성 문서 {user._count.draftedDocuments}건 · 결재 참여{" "}
                {user._count.approvalSteps}건
              </p>
              <p className="mt-1 text-xs text-[#697386]">
                {formatEmploymentPeriod(user)}
              </p>
              <p className="mt-1 text-xs text-[#697386]">
                {formatBirthDateLabel(user.birthDate)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RolePill role={user.role} />
            <StatusPill active={user.status === "ACTIVE"} />
            <span className="rounded-md border border-[#cfd6e3] bg-white px-3 py-1.5 text-xs font-semibold text-[#394150]">
              수정
            </span>
          </div>
        </div>
      }
    >
      <EditUserForm
        user={user}
        departments={departments}
        positions={positions}
      />
    </AdminEditModal>
  );
}

function CreateUserForm({
  departments,
  positions,
}: {
  departments: AdminDepartment[];
  positions: AdminPosition[];
}) {
  const [state, formAction, pending] = useActionState(
    createAdminUserAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="self-start rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <h2 className="text-base font-semibold">직원 추가</h2>
      <p className="mt-2 text-sm font-semibold text-[#196b69]">
        TAB키를 사용하여 입력칸 이동 가능
      </p>
      <p className="mt-1 text-sm text-[#697386]">
        직원 계정의 기본 조직 정보를 입력합니다. (초기 비밀번호: 0000)
      </p>

      <div className="mt-5 grid gap-4">
        <TextField
          label="이름"
          name="name"
          defaultValue={state.values?.name}
          placeholder="홍길동"
        />
        <TextField
          label="이메일"
          description="선택"
          name="email"
          type="email"
          defaultValue={state.values?.email}
          placeholder="입력하지 않아도 생성됩니다"
        />
        <div className="grid min-w-0 gap-3">
          <AdminSplitDateField
            label="생년월일"
            description="선택"
            name="birthDate"
            defaultValue={state.values?.birthDate}
          />
          <AdminSplitDateField
            label="입사일"
            description="선택"
            name="hireDate"
            defaultValue={state.values?.hireDate}
          />
          <AdminSplitDateField
            label="퇴사일"
            description="선택"
            name="resignationDate"
            defaultValue={state.values?.resignationDate}
          />
        </div>
        <SelectField
          label="부서"
          name="departmentId"
          defaultValue={state.values?.departmentId}
          options={departments.map((department) => ({
            value: department.id,
            label: department.name,
            disabled: !department.isActive,
          }))}
        />
        <SelectField
          label="직급"
          name="positionId"
          defaultValue={state.values?.positionId}
          options={positions.map((position) => ({
            value: position.id,
            label: `${position.name} · Lv.${position.level}`,
            disabled: !position.isActive,
          }))}
        />
        <RoleStatusFields
          role={state.values?.role ?? "USER"}
          status={state.values?.status ?? "ACTIVE"}
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
        {pending ? "생성 중" : "직원 생성"}
      </button>
    </form>
  );
}

function EditUserForm({
  user,
  departments,
  positions,
}: {
  user: AdminUser;
  departments: AdminDepartment[];
  positions: AdminPosition[];
}) {
  const updateUser = updateAdminUserAction.bind(null, user.id);
  const resetProfileImage = resetAdminUserProfileImageAction.bind(null, user.id);
  const [state, formAction, pending] = useActionState(updateUser, initialState);
  const [resetState, resetFormAction, resetPending] = useActionState(
    resetProfileImage,
    initialState,
  );

  return (
    <form action={formAction}>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#697386]">계정</p>
          <input type="hidden" name="email" value={user.email ?? ""} />
          <div className="mt-2 flex min-w-0 items-start gap-3">
            <UserAvatar user={user} />
            <div className="min-w-0 flex-1">
              <input
                name="name"
                defaultValue={state.values?.name ?? user.name}
                className="h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#16181d] outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
              />
              <p className="mt-1 truncate text-xs text-[#697386]">
                {formatUserEmail(user.email)}
              </p>
              <p className="mt-1 text-xs text-[#697386]">
                {user.profileImageStorageKey ? "프로필 이미지 등록" : "기본 이미지"}
              </p>
              {user.profileImageStorageKey ? (
                <button
                  type="submit"
                  formAction={resetFormAction}
                  disabled={pending || resetPending}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.dangerOutline,
                    "mt-2 h-8 px-3 text-xs",
                  )}
                >
                  {resetPending ? "초기화 중" : "프로필 초기화"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <SelectField
            label="부서"
            name="departmentId"
            defaultValue={state.values?.departmentId ?? user.departmentId}
            options={departments.map((department) => ({
              value: department.id,
              label: department.name,
              disabled: !department.isActive,
            }))}
          />
          <SelectField
            label="직급"
            name="positionId"
            defaultValue={state.values?.positionId ?? user.positionId}
            options={positions.map((position) => ({
              value: position.id,
              label: position.name,
              disabled: !position.isActive,
            }))}
          />
        </div>

        <div className="grid min-w-0 gap-3 sm:col-span-2 lg:grid-cols-3">
          <AdminSplitDateField
            label="생년월일"
            description="선택"
            name="birthDate"
            ariaLabel="수정 생년월일"
            defaultValue={state.values?.birthDate ?? user.birthDate ?? ""}
          />
          <AdminSplitDateField
            label="입사일"
            description="선택"
            name="hireDate"
            ariaLabel="수정 입사일"
            defaultValue={state.values?.hireDate ?? user.hireDate ?? ""}
          />
          <AdminSplitDateField
            label="퇴사일"
            description="선택"
            name="resignationDate"
            ariaLabel="수정 퇴사일"
            defaultValue={
              state.values?.resignationDate ?? user.resignationDate ?? ""
            }
          />
        </div>

        <RoleStatusFields
          role={state.values?.role ?? user.role}
          status={state.values?.status ?? user.status}
        />

        <TextField
          label="새 비밀번호 재설정"
          description="현재 비밀번호 불필요"
          name="password"
          type="password"
          placeholder="4자 이상 입력 시 변경"
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
        <span>작성 문서 {user._count.draftedDocuments}</span>
        <span>·</span>
        <span>결재 참여 {user._count.approvalSteps}</span>
        <span>·</span>
        <span>
          현재 {user.department.name} / {user.position.name}
        </span>
        <span>·</span>
        <span>{formatEmploymentPeriod(user)}</span>
      </div>

      <FormMessage state={state} />
      <FormMessage state={resetState} />
    </form>
  );
}

function AdminSplitDateField({
  ariaLabel,
  defaultValue,
  description,
  label,
  name,
}: {
  ariaLabel?: string;
  defaultValue?: string | null;
  description?: string;
  label: string;
  name: string;
}) {
  const descriptionId = useId();
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <label className="block min-w-0">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-[#697386]">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-xs text-[#9aa4b2]">
            {description}
          </span>
        ) : null}
      </span>
      <input type="hidden" name={name} value={value} />
      <SplitDateInput
        ariaLabel={ariaLabel ?? label}
        value={value}
        onChange={setValue}
        className="h-10"
      />
    </label>
  );
}

function RolePill({ role }: { role: "USER" | "ADMIN" }) {
  return (
    <span
      className={[
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        role === "ADMIN"
          ? "bg-[#eef7f6] text-[#196b69]"
          : "bg-[#f3f5f8] text-[#697386]",
      ].join(" ")}
    >
      {role === "ADMIN" ? "관리자" : "사용자"}
    </span>
  );
}

function formatUserEmail(email: string | null) {
  return email || "이메일 미등록";
}

function formatEmploymentPeriod({
  hireDate,
  resignationDate,
}: Pick<AdminUser, "hireDate" | "resignationDate">) {
  const hireLabel = hireDate ? `입사 ${formatDateValue(hireDate)}` : "입사일 미등록";
  const resignationLabel = resignationDate
    ? `퇴사 ${formatDateValue(resignationDate)}`
    : "재직 중";

  return `${hireLabel} · ${resignationLabel}`;
}

function formatBirthDateLabel(value: string | null) {
  return value ? `생년월일 ${formatDateValue(value)}` : "생년월일 미등록";
}

function formatDateValue(value: string) {
  return value.replaceAll("-", ". ") + ".";
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

function RoleStatusFields({ role, status }: { role: string; status: string }) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <SelectField
        label="권한"
        name="role"
        defaultValue={role}
        options={[
          { value: "USER", label: "사용자" },
          { value: "ADMIN", label: "관리자" },
        ]}
      />
      <SelectField
        label="상태"
        name="status"
        defaultValue={status}
        options={[
          { value: "ACTIVE", label: "활성" },
          { value: "INACTIVE", label: "비활성" },
        ]}
      />
    </div>
  );
}
