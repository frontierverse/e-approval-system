"use client";

import { useActionState } from "react";
import {
  type AdminTemplateFormState,
  createAdminTemplateAction,
  updateAdminTemplateAction,
} from "@/app/admin/actions";
import {
  FormMessage,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/admin-form-controls";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type AdminTemplateManagementProps = {
  templates: AdminTemplate[];
};

type AdminTemplate = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count: {
    documents: number;
  };
};

const initialState: AdminTemplateFormState = {};

export function AdminTemplateManagement({
  templates,
}: AdminTemplateManagementProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <CreateTemplateForm />

      <div className="rounded-md border border-[#d9dee7] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">문서 양식 목록</h2>
            <p className="mt-1 text-sm text-[#697386]">
              기안작성에서 선택할 수 있는 양식의 이름과 사용 여부를 관리합니다.
            </p>
          </div>
          <span className="rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 py-1.5 text-sm font-semibold text-[#394150]">
            총 {templates.length}개
          </span>
        </div>

        <div className="divide-y divide-[#eef1f5]">
          {templates.map((template) => (
            <EditTemplateForm key={template.id} template={template} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CreateTemplateForm() {
  const [state, formAction, pending] = useActionState(
    createAdminTemplateAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="self-start rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <h2 className="text-base font-semibold">문서 양식 추가</h2>
      <p className="mt-1 text-sm text-[#697386]">
        새 양식은 기본 기안 필드 구조로 생성됩니다.
      </p>

      <div className="mt-5 grid gap-4">
        <TextField
          label="양식명"
          name="name"
          defaultValue={state.values?.name}
          placeholder="휴가신청서"
        />
        <TextareaField
          label="설명"
          name="description"
          defaultValue={state.values?.description}
          placeholder="양식 설명을 입력하세요"
        />
        <TemplateStatusField value={state.values?.isActive ?? "ACTIVE"} />
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
        {pending ? "생성 중" : "양식 생성"}
      </button>
    </form>
  );
}

function EditTemplateForm({ template }: { template: AdminTemplate }) {
  const updateTemplate = updateAdminTemplateAction.bind(null, template.id);
  const [state, formAction, pending] = useActionState(
    updateTemplate,
    initialState,
  );

  return (
    <form action={formAction} className="p-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <TextField
          label="양식명"
          name="name"
          defaultValue={state.values?.name ?? template.name}
        />
        <TextareaField
          label="설명"
          name="description"
          rows={2}
          defaultValue={state.values?.description ?? template.description}
        />
        <TemplateStatusField
          value={state.values?.isActive ?? getStatusValue(template.isActive)}
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
        <span>사용 문서 {template._count.documents}건</span>
        <span>·</span>
        <span>{template.isActive ? "기안작성 노출" : "비활성"}</span>
      </div>

      <FormMessage state={state} />
    </form>
  );
}

function TemplateStatusField({ value }: { value: string }) {
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
