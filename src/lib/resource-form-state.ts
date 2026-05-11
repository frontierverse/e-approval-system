import {
  isResourceCategory,
  normalizeResourceCategory,
  type ResourceCategory,
} from "@/lib/resource-library-core";

export type ResourceFormValues = {
  title: string;
  summary: string;
  category: ResourceCategory;
};

export type ResourceFormState = {
  values?: ResourceFormValues;
  errors?: {
    title?: string;
    summary?: string;
    category?: string;
    attachments?: string;
    form?: string;
  };
};

export function getResourceFormValues(formData: FormData): ResourceFormValues {
  return {
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim(),
    category: normalizeResourceCategory(
      String(formData.get("category") ?? "").trim(),
    ),
  };
}

export function validateResourceFormValues(
  values: ResourceFormValues,
  options: {
    attachmentError?: string;
  } = {},
) {
  const errors: NonNullable<ResourceFormState["errors"]> = {};

  if (values.title.length < 2) {
    errors.title = "제목은 2자 이상 입력하세요.";
  }

  if (values.title.length > 120) {
    errors.title = "제목은 120자 이내로 입력하세요.";
  }

  if (values.summary.length < 5) {
    errors.summary = "내용은 5자 이상 입력하세요.";
  }

  if (values.summary.length > 1000) {
    errors.summary = "내용은 1000자 이내로 입력하세요.";
  }

  if (!isResourceCategory(values.category)) {
    errors.category = "자료 분류를 선택하세요.";
  }

  if (options.attachmentError) {
    errors.attachments = options.attachmentError;
  }

  return errors;
}

export function hasResourceFormErrors(errors: ResourceFormState["errors"]) {
  return Boolean(errors && Object.keys(errors).length > 0);
}
