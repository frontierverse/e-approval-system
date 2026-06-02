"use client";

import { useActionState } from "react";
import {
  type AdminTemplateFormState,
  createAdminTemplateAction,
  updateAdminTemplateAction,
} from "@/app/admin/actions";
import {
  AdminEditModal,
  FormMessage,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/admin-form-controls";
import { adminListStyles } from "@/lib/admin-list-styles";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  draftTemplateFormats,
  type TemplateFieldDefinition,
  type TemplateFormatDefinition,
} from "@/lib/draft-template-content";

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

      <div className={adminListStyles.panel}>
        <div className={adminListStyles.header}>
          <div>
            <h2 className={adminListStyles.title}>문서 양식 목록</h2>
            <p className={adminListStyles.description}>
              기안작성에서 선택할 수 있는 양식의 이름과 사용 여부를 관리합니다.
            </p>
          </div>
          <span className={adminListStyles.count}>
            총 {templates.length}개
          </span>
        </div>

        <div className="divide-y divide-[#eef1f5]">
          {templates.map((template) => (
            <TemplateListItem key={template.id} template={template} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplateListItem({ template }: { template: AdminTemplate }) {
  const actionButtonClass = buttonClass(
    buttonStyles.base,
    buttonStyles.neutral,
    "h-8 px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#196b69]",
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#fbfcfd]">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#16181d]">
          {template.name}
        </p>
        <p className="mt-1 truncate text-xs text-[#697386]">
          {template.description || "설명 없음"} · 사용 문서{" "}
          {template._count.documents}건
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill active={template.isActive} />
        <TemplatePreviewModal
          template={template}
          triggerClassName={actionButtonClass}
        />
        <AdminEditModal
          title={`${template.name} 양식 수정`}
          description="기안작성에 노출할 문서 양식 정보를 수정합니다."
          trigger="수정"
          triggerClassName={actionButtonClass}
        >
          <EditTemplateForm template={template} />
        </AdminEditModal>
      </div>
    </div>
  );
}

function TemplatePreviewModal({
  template,
  triggerClassName,
}: {
  template: AdminTemplate;
  triggerClassName: string;
}) {
  return (
    <AdminEditModal
      title={`${template.name} 미리보기`}
      description={template.description || "설명 없음"}
      trigger="미리보기"
      triggerClassName={triggerClassName}
    >
      <TemplatePreview template={template} />
    </AdminEditModal>
  );
}

function TemplatePreview({ template }: { template: AdminTemplate }) {
  const format: TemplateFormatDefinition | undefined =
    draftTemplateFormats[template.id];

  return (
    <article
      aria-label={`${template.name} 양식 미리보기`}
      className="rounded-md border border-[#d9dee7] bg-[#f7f9fc] p-4"
    >
      <div className="mx-auto max-w-2xl rounded-md border border-[#d9dee7] bg-white p-5 shadow-sm">
        <div className="border-b border-[#eef1f5] pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#697386]">문서 양식</p>
              <h3 className="mt-1 break-words text-lg font-semibold text-[#16181d]">
                {template.name}
              </h3>
            </div>
            <StatusPill active={template.isActive} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[#697386]">
            {template.description || "설명 없음"}
          </p>
        </div>

        <div className="mt-5 grid gap-5">
          <PreviewField
            label="제목"
            type="text"
            placeholder="문서 제목을 입력하세요"
          />

          <PreviewStaticField label="문서 양식" value={template.name} />

          {format ? (
            <TemplateFormatPreview format={format} />
          ) : (
            <section>
              <h4 className="text-sm font-semibold text-[#394150]">
                기안 내용
              </h4>
              <div className="mt-2">
                <PreviewTextarea
                  label="기안 내용"
                  placeholder="기안 내용을 입력하세요"
                />
              </div>
            </section>
          )}

          <section>
            <h4 className="text-sm font-semibold text-[#394150]">첨부파일</h4>
            <div className="mt-2 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-3 py-4 text-sm text-[#697386]">
              파일 선택
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-[#394150]">결재선</h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {["1차 결재자", "2차 결재자"].map((label) => (
                <div
                  key={label}
                  className="rounded-md border border-[#d9dee7] bg-[#fbfcfd] px-3 py-2"
                >
                  <p className="text-xs font-semibold text-[#697386]">
                    {label}
                  </p>
                  <p className="mt-1 text-sm text-[#9aa4b2]">결재자 선택</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}

function TemplateFormatPreview({
  format,
}: {
  format: TemplateFormatDefinition;
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-[#394150]">{format.title}</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {format.fields.map((field) => (
          <TemplatePreviewField key={field.id} field={field} />
        ))}
      </div>
    </section>
  );
}

function TemplatePreviewField({ field }: { field: TemplateFieldDefinition }) {
  if (field.type === "textarea") {
    return (
      <div className="sm:col-span-2">
        <PreviewTextarea
          label={field.label}
          placeholder={field.placeholder ?? "내용 입력"}
        />
      </div>
    );
  }

  return (
    <PreviewField
      label={field.label}
      placeholder={field.placeholder ?? getPreviewPlaceholder(field.type)}
      type={field.type}
    />
  );
}

function PreviewField({
  label,
  placeholder,
  type,
}: {
  label: string;
  placeholder: string;
  type: Exclude<TemplateFieldDefinition["type"], "textarea">;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-[#697386]">{label}</span>
      <input
        readOnly
        tabIndex={-1}
        type={type}
        placeholder={placeholder}
        className="mt-2 h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm text-[#394150] outline-none placeholder:text-[#9aa4b2]"
      />
    </label>
  );
}

function PreviewTextarea({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-[#697386]">{label}</span>
      <textarea
        readOnly
        tabIndex={-1}
        rows={4}
        placeholder={placeholder}
        className="mt-2 w-full min-w-0 resize-none rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm leading-6 text-[#394150] outline-none placeholder:text-[#9aa4b2]"
      />
    </label>
  );
}

function PreviewStaticField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="block min-w-0">
      <span className="text-xs font-semibold text-[#697386]">{label}</span>
      <div className="mt-2 flex h-10 w-full min-w-0 items-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm text-[#394150]">
        {value}
      </div>
    </div>
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
    <form action={formAction}>
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

function getPreviewPlaceholder(type: TemplateFieldDefinition["type"]) {
  if (type === "date") {
    return "YYYY-MM-DD";
  }

  if (type === "number") {
    return "0";
  }

  return "내용 입력";
}
