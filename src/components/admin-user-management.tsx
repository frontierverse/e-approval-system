"use client";

import { useActionState } from "react";
import {
  type AdminUserFormState,
  createAdminUserAction,
  resetAdminUserProfileImageAction,
  updateAdminUserAction,
} from "@/app/admin/actions";
import {
  FormMessage,
  SelectField,
  TextField,
} from "@/components/admin-form-controls";
import { UserAvatar } from "@/components/user-avatar";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type AdminUserManagementProps = {
  users: AdminUser[];
  departments: AdminDepartment[];
  positions: AdminPosition[];
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
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

      <div className="rounded-md border border-[#d9dee7] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">사용자 목록</h2>
            <p className="mt-1 text-sm text-[#697386]">
              사용자 권한과 조직 정보를 수정합니다.
            </p>
          </div>
          <span className="rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 py-1.5 text-sm font-semibold text-[#394150]">
            총 {users.length}명
          </span>
        </div>

        <div className="divide-y divide-[#eef1f5]">
          {users.map((user) => (
            <EditUserForm
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
      <h2 className="text-base font-semibold">사용자 추가</h2>
      <p className="mt-1 text-sm text-[#697386]">
        새 계정의 기본 조직 정보와 초기 비밀번호를 입력합니다.
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
          name="email"
          type="email"
          defaultValue={state.values?.email}
          placeholder="user@company.local"
        />
        <TextField
          label="초기 비밀번호"
          name="password"
          type="password"
          placeholder="8자 이상"
        />
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
        {pending ? "생성 중" : "사용자 생성"}
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
    <form action={formAction} className="p-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#697386]">계정</p>
          <input type="hidden" name="email" value={user.email} />
          <div className="mt-2 flex min-w-0 items-start gap-3">
            <UserAvatar user={user} />
            <div className="min-w-0 flex-1">
              <input
                name="name"
                defaultValue={state.values?.name ?? user.name}
                className="h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#16181d] outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
              />
              <p className="mt-1 truncate text-xs text-[#697386]">
                {user.email}
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

        <RoleStatusFields
          role={state.values?.role ?? user.role}
          status={state.values?.status ?? user.status}
        />

        <TextField
          label="새 비밀번호"
          name="password"
          type="password"
          placeholder="변경 시 입력"
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
      </div>

      <FormMessage state={state} />
      <FormMessage state={resetState} />
    </form>
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
