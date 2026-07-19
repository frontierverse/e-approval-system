import { getDocumentTemplateFieldValuesFromFormData } from "@/lib/draft-template-content";

export type DraftFormState = {
  values?: DraftFormValues;
  errors?: {
    title?: string;
    templateId?: string;
    content?: string;
    approvers?: string;
    form?: string;
  };
};

export type DraftFormValues = {
  title: string;
  category: string;
  templateId: string;
  content: string;
  approverIds: string[];
  templateFieldValues?: Record<string, string>;
};

export type DraftFormIntent = "draft" | "submit";

export function getDraftFormIntent(formData: FormData): DraftFormIntent {
  return formData.get("intent") === "submit" ? "submit" : "draft";
}

export function getDraftFormValues(formData: FormData): DraftFormValues {
  const approverIds = formData
    .getAll("approverIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  return {
    title: String(formData.get("title") ?? "").trim(),
    category: "",
    templateId: String(formData.get("templateId") ?? "").trim(),
    content: String(formData.get("content") ?? "").trim(),
    approverIds: Array.from(new Set(approverIds)),
    templateFieldValues: getDocumentTemplateFieldValuesFromFormData(formData),
  };
}

export function validateDraftFormValues(
  values: DraftFormValues,
  options: {
    currentUserId: string;
    intent?: DraftFormIntent;
    submittedApproverIds?: string[];
    attachmentError?: string;
  },
) {
  const errors: NonNullable<DraftFormState["errors"]> = {};
  const intent = options.intent ?? "submit";
  const submittedApproverIds =
    options.submittedApproverIds ?? values.approverIds;

  if (intent === "submit" && values.title.length < 2) {
    errors.title = "제목은 2자 이상 입력하세요.";
  }

  if (values.title.length > 120) {
    errors.title = "제목은 120자 이내로 입력하세요.";
  }

  if (!values.templateId) {
    errors.templateId = "문서 양식을 선택하세요.";
  }

  if (intent === "submit" && values.content.length < 10) {
    errors.content = "기안 내용은 10자 이상 입력하세요.";
  }

  if (values.content.length > 5000) {
    errors.content = "기안 내용은 5000자 이내로 입력하세요.";
  }

  if (intent === "submit" && submittedApproverIds.length === 0) {
    errors.approvers = "결재자를 1명 이상 지정하세요.";
  }

  if (values.approverIds.length !== submittedApproverIds.length) {
    errors.approvers = "같은 결재자는 한 번만 지정할 수 있습니다.";
  }

  if (values.approverIds.includes(options.currentUserId)) {
    errors.approvers = "작성자 본인은 결재자로 지정할 수 없습니다.";
  }

  if (options.attachmentError) {
    errors.form = options.attachmentError;
  }

  return errors;
}

export function hasDraftFormErrors(errors: DraftFormState["errors"]) {
  return Boolean(errors && Object.keys(errors).length > 0);
}
