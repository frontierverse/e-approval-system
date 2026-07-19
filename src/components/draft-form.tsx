"use client";

import Link from "next/link";
import {
  type FormEvent,
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createDraftAction } from "@/app/drafts/new/actions";
import { createSignedUploadUrlAction } from "@/app/attachments/actions";
import { AttachmentFileRow } from "@/components/attachment-file-row";
import { DatePickerInput } from "@/components/date-picker-input";
import { PendingOverlay } from "@/components/form-pending-overlay";
import {
  documentContentLineNumberColumnClass,
  documentContentTextColumnBaseClass,
} from "@/components/line-numbered-document-content";
import { useAttachmentThumbnailUrls } from "@/components/use-attachment-thumbnail-urls";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { UserIdentity } from "@/components/user-identity";
import { getApprovalLinePolicyError } from "@/lib/approval-line-policy";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { DraftFormState, DraftFormValues } from "@/lib/draft-form-state";
import {
  compileDocumentTemplateContentFromSchema,
  getDocumentTemplateInitialFieldValues,
  getSafeRenderableDocumentTemplateFields,
  getTemplateFieldInputName,
  validateDocumentTemplateContentValues,
} from "@/lib/draft-template-content";
import {
  vacationRequestTemplateId,
  type DocumentTemplateField,
} from "@/lib/document-template-schema";
import {
  getAttachmentSelectionKey,
  getFileExtension,
  mergeAttachmentSelections,
  type AttachmentSelectionFile,
} from "@/lib/file-display";

type DraftFormProps = {
  templates: {
    id: string;
    name: string;
    description: string | null;
    schema: unknown;
  }[];
  attachmentPolicy: {
    maxFileCount: number;
    maxFileSizeMb: number;
    allowedExtensions: string[];
  };
  approverCandidates: ApprovalCandidate[];
  allowedApproverPositionName?: string;
  action?: DraftFormAction;
  cancelHref?: string;
  defaultApproverIds?: string[];
  initialValues?: DraftFormValues;
  existingAttachments?: ExistingAttachment[];
  mode?: "create" | "edit";
};

type DraftFormAction = (
  state: DraftFormState,
  formData: FormData,
) => Promise<DraftFormState>;

type DraftSubmitIntent = "draft" | "submit" | null;
type DraftFormErrorField = Exclude<
  keyof NonNullable<DraftFormState["errors"]>,
  "form"
>;

type UploadedAttachmentMetadata = {
  originalName: string;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

type ApprovalCandidate = {
  id: string;
  name: string;
  email: string | null;
  departmentName: string;
  positionName: string;
  positionLevel: number;
  profileImageStorageKey?: string | null;
  profileImageUpdatedAt?: string | null;
};

type ExistingAttachment = {
  id: string;
  mimeType?: string | null;
  originalName: string;
  signedSourceAttachmentId?: string | null;
  size: number;
};

type DraftFormFieldsProps = DraftFormProps & {
  errors?: DraftFormState["errors"];
  formAction: (formData: FormData) => void;
  initialValues: DraftFormValues;
  pending: boolean;
};

const initialState: DraftFormState = {};
export function DraftForm({
  templates,
  attachmentPolicy,
  approverCandidates,
  allowedApproverPositionName,
  action = createDraftAction,
  cancelHref,
  defaultApproverIds = [],
  initialValues: providedInitialValues,
  existingAttachments = [],
  mode = "create",
}: DraftFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState,
  );
  const initialValues = getInitialValues(
    state,
    templates,
    providedInitialValues,
    defaultApproverIds,
  );

  return (
    <DraftFormFields
      templates={templates}
      attachmentPolicy={attachmentPolicy}
      approverCandidates={approverCandidates}
      allowedApproverPositionName={allowedApproverPositionName}
      cancelHref={cancelHref}
      errors={state.errors}
      existingAttachments={existingAttachments}
      formAction={formAction}
      initialValues={initialValues}
      mode={mode}
      pending={pending}
    />
  );
}

function DraftFormFields({
  templates,
  attachmentPolicy,
  approverCandidates,
  allowedApproverPositionName,
  cancelHref,
  errors,
  existingAttachments = [],
  formAction,
  initialValues,
  mode = "create",
  pending,
}: DraftFormFieldsProps) {
  const [title, setTitle] = useState(initialValues.title);
  const [templateId, setTemplateId] = useState(initialValues.templateId);
  const [content, setContent] = useState(initialValues.content);
  const [templateFieldValues, setTemplateFieldValues] = useState<
    Record<string, string>
  >(() => getInitialTemplateFieldValues(initialValues, templates));
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>(
    initialValues.approverIds,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const selectedFileThumbnailUrls = useAttachmentThumbnailUrls(selectedFiles);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [activeSubmitIntent, setActiveSubmitIntent] =
    useState<DraftSubmitIntent>(null);
  const [isClientSubmitting, setIsClientSubmitting] = useState(false);
  const hadPendingSinceSubmitRef = useRef(false);
  const clientActionPendingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [isCandidateDirectoryOpen, setIsCandidateDirectoryOpen] = useState(
    initialValues.approverIds.length === 0,
  );
  const [clearedServerErrorState, setClearedServerErrorState] = useState<{
    errors: DraftFormState["errors"];
    fields: Set<DraftFormErrorField>;
  }>(() => ({ errors, fields: new Set() }));
  const clearedServerErrors =
    clearedServerErrorState.errors === errors
      ? clearedServerErrorState.fields
      : new Set<DraftFormErrorField>();
  const titleHasError = Boolean(
    errors?.title && !clearedServerErrors.has("title"),
  );
  const templateHasError = Boolean(
    errors?.templateId && !clearedServerErrors.has("templateId"),
  );
  const contentHasError = Boolean(
    errors?.content && !clearedServerErrors.has("content"),
  );
  const approverHasError = Boolean(
    errors?.approvers && !clearedServerErrors.has("approvers"),
  );
  const attachmentHasError = Boolean(attachmentError);
  const isEditMode = mode === "edit";
  const retainedAttachmentCount =
    getRetainedAttachmentCount(removedAttachmentIds);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );
  const selectedTemplateFields = useMemo(() => {
    if (!selectedTemplate) {
      return [];
    }

    return getSafeRenderableDocumentTemplateFields(
      selectedTemplate.schema,
    ).filter((field) =>
      isDraftFormTemplateFieldVisible(
        selectedTemplate.id,
        field,
        templateFieldValues,
      ),
    );
  }, [selectedTemplate, templateFieldValues]);
  const usesStructuredTemplate = selectedTemplate
    ? getSafeRenderableDocumentTemplateFields(selectedTemplate.schema).length > 0
    : false;
  const structuredContent =
    usesStructuredTemplate && selectedTemplate
      ? compileDocumentTemplateContentFromSchema(
          selectedTemplate.schema,
          templateFieldValues,
          content,
        )
      : content;

  const errorBorderClass = "border-[#cc1f1f] ring-2 ring-[#f4c7c7]";

  const eligibleApproverCandidates = useMemo(
    () =>
      allowedApproverPositionName
        ? approverCandidates.filter(
            (candidate) =>
              candidate.positionName === allowedApproverPositionName,
          )
        : approverCandidates,
    [allowedApproverPositionName, approverCandidates],
  );

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          eligibleApproverCandidates.map(
            (candidate) => candidate.departmentName,
          ),
        ),
      ).sort((a, b) => a.localeCompare(b, "ko-KR")),
    [eligibleApproverCandidates],
  );

  const selectedApprovers = useMemo(
    () =>
      selectedApproverIds
        .map((id) =>
          approverCandidates.find((candidate) => candidate.id === id),
        )
        .filter(isApprovalCandidate),
    [approverCandidates, selectedApproverIds],
  );
  const submitBlockReason = useMemo(
    () =>
      getDraftSubmitBlockReason({
        attachmentError,
        content: structuredContent,
        selectedApproverIds,
        selectedApprovers,
        selectedTemplate,
        templateFieldValues,
        title,
        allowedApproverPositionName,
      }),
    [
      attachmentError,
      selectedApproverIds,
      selectedApprovers,
      selectedTemplate,
      structuredContent,
      templateFieldValues,
      title,
      allowedApproverPositionName,
    ],
  );
  const canSubmitForApproval = submitBlockReason === null;

  const availableApprovers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

    return eligibleApproverCandidates.filter((candidate) => {
      if (selectedApproverIds.includes(candidate.id)) {
        return false;
      }

      if (
        departmentFilter !== "all" &&
        candidate.departmentName !== departmentFilter
      ) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        candidate.name,
        candidate.email ?? "",
        candidate.departmentName,
        candidate.positionName,
      ]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedQuery);
    });
  }, [
    departmentFilter,
    eligibleApproverCandidates,
    query,
    selectedApproverIds,
  ]);
  const isFixedSingleApprover = Boolean(
    allowedApproverPositionName &&
      eligibleApproverCandidates.length === 1 &&
      selectedApproverIds.length === 1 &&
      selectedApproverIds[0] === eligibleApproverCandidates[0].id,
  );

  useEffect(() => {
    syncAttachmentInputFiles(attachmentInputRef.current, selectedFiles);
  }, [errors, selectedFiles]);

  useEffect(() => {
    if (!errors || Object.keys(errors).length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(
          '[aria-invalid="true"], [data-form-error-target="true"]',
        )
        ?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [errors]);

  useEffect(() => {
    if (pending && activeSubmitIntent) {
      hadPendingSinceSubmitRef.current = true;
    }

    if (pending && isClientSubmitting) {
      clientActionPendingRef.current = true;
    }

    if (
      !pending &&
      activeSubmitIntent &&
      hadPendingSinceSubmitRef.current
    ) {
      hadPendingSinceSubmitRef.current = false;
      setActiveSubmitIntent(null);
    }

    if (!pending && isClientSubmitting && clientActionPendingRef.current) {
      clientActionPendingRef.current = false;
      setIsClientSubmitting(false);
    }
  }, [activeSubmitIntent, isClientSubmitting, pending]);

  function setSubmitIntent(intent: DraftSubmitIntent) {
    if (intent) {
      hadPendingSinceSubmitRef.current = false;
    }

    setActiveSubmitIntent(intent);
  }

  function clearSubmitIntent() {
    setActiveSubmitIntent(null);
  }

  function clearServerError(field: DraftFormErrorField) {
    setClearedServerErrorState((current) => {
      const fields =
        current.errors === errors
          ? current.fields
          : new Set<DraftFormErrorField>();

      if (fields.has(field)) {
        return current.errors === errors ? current : { errors, fields };
      }

      return {
        errors,
        fields: new Set(fields).add(field),
      };
    });
  }

  function addApprover(approverId: string) {
    if (selectedApproverIds.includes(approverId)) {
      return;
    }

    const candidate = approverCandidates.find(
      (approver) => approver.id === approverId,
    );

    if (!candidate) {
      return;
    }

    const next = allowedApproverPositionName
      ? [approverId]
      : [...selectedApproverIds, approverId];
    const policyError = getApprovalLinePolicyError(
      next
        .map((id) =>
          id === approverId
            ? candidate
            : approverCandidates.find((approver) => approver.id === id),
        )
        .filter(isApprovalCandidate),
    );

    if (policyError) {
      window.alert(policyError);
      return;
    }

    setSelectedApproverIds(next);
    clearServerError("approvers");

    if (allowedApproverPositionName) {
      setIsCandidateDirectoryOpen(false);
    }
  }

  function removeApprover(approverId: string) {
    const next = selectedApproverIds.filter((id) => id !== approverId);

    setSelectedApproverIds(next);
    clearServerError("approvers");

    if (next.length === 0) {
      setIsCandidateDirectoryOpen(true);
    }
  }

  function moveApprover(approverId: string, direction: -1 | 1) {
    const index = selectedApproverIds.indexOf(approverId);
    const nextIndex = index + direction;

    if (
      index < 0 ||
      nextIndex < 0 ||
      nextIndex >= selectedApproverIds.length
    ) {
      return;
    }

    const next = [...selectedApproverIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const policyError = getApprovalLinePolicyError(
      next
        .map((id) =>
          approverCandidates.find((candidate) => candidate.id === id),
        )
        .filter(isApprovalCandidate),
    );

    if (policyError) {
      window.alert(policyError);
      return;
    }

    setSelectedApproverIds(next);
    clearServerError("approvers");
  }

  function handleAttachmentChange(fileList: FileList | null) {
    const nextFiles = mergeAttachmentSelections(
      selectedFiles,
      Array.from(fileList ?? []),
    );
    const fileError = validateAttachmentFiles(
      nextFiles,
      attachmentPolicy,
      retainedAttachmentCount,
    );

    if (fileError) {
      syncAttachmentInputFiles(attachmentInputRef.current, selectedFiles);
      setAttachmentError(fileError);
      return;
    }

    setSelectedFiles(nextFiles);
    syncAttachmentInputFiles(attachmentInputRef.current, nextFiles);
    setAttachmentError(null);
  }

  function removeSelectedFile(fileKey: string) {
    const nextFiles = selectedFiles.filter(
      (file) => getAttachmentSelectionKey(file) !== fileKey,
    );

    setSelectedFiles(nextFiles);
    syncAttachmentInputFiles(attachmentInputRef.current, nextFiles);
    setAttachmentError(
      validateAttachmentFiles(nextFiles, attachmentPolicy, retainedAttachmentCount),
    );
  }

  function toggleRemovedAttachment(attachmentId: string) {
    setRemovedAttachmentIds((current) => {
      const next = current.includes(attachmentId)
        ? current.filter((id) => id !== attachmentId)
        : [...current, attachmentId];

      setAttachmentError(
        validateAttachmentFiles(
          selectedFiles,
          attachmentPolicy,
          getRetainedAttachmentCount(next),
        ),
      );

      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const input = form.elements.namedItem("attachments");
    const submitter = (event.nativeEvent as unknown as {
      submitter?: HTMLElement | null;
    }).submitter;
    const submitIntent = getSubmitIntent(submitter);
    const attachmentInput =
      input instanceof HTMLInputElement ? input : null;
    const fileError =
      attachmentInput
        ? validateAttachmentFiles(
            attachmentInput.files,
            attachmentPolicy,
            retainedAttachmentCount,
          )
        : null;

    if (fileError) {
      event.preventDefault();
      clearSubmitIntent();
      setAttachmentError(fileError);
      return;
    }

    setAttachmentError(null);
    setSubmitIntent(submitIntent);

    if (!attachmentInput?.files || attachmentInput.files.length === 0) {
      return;
    }

    event.preventDefault();
    setIsClientSubmitting(true);

    try {
      const uploadedAttachments = await uploadAttachmentFiles(
        Array.from(attachmentInput.files),
      );
      const formData = new FormData(form);

      formData.delete("attachments");
      formData.set("uploadedAttachmentsJson", JSON.stringify(uploadedAttachments));
      formData.set("title", title);
      formData.set("templateId", templateId);
      formData.set("content", structuredContent);
      setTemplateFieldFormDataValues(formData, templateFieldValues);

      if (submitIntent) {
        formData.set("intent", submitIntent);
      }

      startTransition(() => {
        formAction(formData);
      });
    } catch (error) {
      console.error("Client-side attachment upload failed", error);
      clearSubmitIntent();
      setIsClientSubmitting(false);
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "첨부파일 업로드 중 오류가 발생했습니다. 다시 시도해 주세요.",
      );
    }
  }

  function getRetainedAttachmentCount(removedIds: readonly string[]) {
    return existingAttachments.filter(
      (attachment) =>
        !removedIds.includes(attachment.id) &&
        !(
          attachment.signedSourceAttachmentId &&
          removedIds.includes(attachment.signedSourceAttachmentId)
        ),
    ).length;
  }

  const isSubmitPending = activeSubmitIntent === "submit";
  const isDraftPending = activeSubmitIntent === "draft";
  const isBusy = pending || isClientSubmitting;

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={isBusy}
      onInvalidCapture={clearSubmitIntent}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.nativeEvent.isComposing &&
          event.target instanceof HTMLInputElement &&
          event.target.type !== "checkbox" &&
          event.target.type !== "file"
        ) {
          event.preventDefault();
        }
      }}
      onSubmit={handleSubmit}
      className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start"
    >
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 xl:col-start-1 xl:row-start-1">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="title"
                className="text-sm font-semibold text-[var(--foreground)]"
              >
                제목
              </label>
              <span className="text-xs tabular-nums text-[var(--text-muted)]">
                {title.length}/120
              </span>
            </div>
            <input
              id="title"
              name="title"
              value={title}
              disabled={isBusy}
              aria-invalid={titleHasError}
              aria-describedby={titleHasError ? "draft-title-error" : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                clearServerError("title");
              }}
              placeholder="제목을 입력하세요"
              className={`mt-2 h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
                titleHasError ? ` ${errorBorderClass}` : ""
              }`}
            />
            {titleHasError && errors?.title ? (
              <p
                id="draft-title-error"
                className="mt-2 text-sm text-[var(--danger)]"
              >
                {errors.title}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="templateId"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              문서 양식
            </label>
            <select
              id="templateId"
              name="templateId"
              value={templateId}
              disabled={isBusy}
              aria-invalid={templateHasError}
              aria-describedby={
                [
                  templateHasError ? "draft-template-error" : "",
                  selectedTemplate?.description
                    ? "draft-template-description"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onChange={(event) => {
                setTemplateId(event.target.value);
                clearServerError("templateId");
                clearServerError("content");
                setTemplateFieldValues(
                  getTemplateFieldValuesForSelectedTemplate(
                    event.target.value,
                    templates,
                    "",
                  ),
                );
              }}
              className={`mt-2 h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
                templateHasError ? ` ${errorBorderClass}` : ""
              }`}
            >
              {templates.length === 0 ? (
                <option value="">사용 가능한 양식 없음</option>
              ) : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {templateHasError && errors?.templateId ? (
              <p
                id="draft-template-error"
                className="mt-2 text-sm text-[var(--danger)]"
              >
                {errors.templateId}
              </p>
            ) : null}
            {templates.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--danger)]">
                관리자에게 활성 문서 양식을 요청하세요.
              </p>
            ) : selectedTemplate?.description ? (
              <p
                id="draft-template-description"
                className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]"
              >
                {selectedTemplate.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <label
              className="text-sm font-semibold text-[var(--foreground)]"
              htmlFor={usesStructuredTemplate ? undefined : "content"}
            >
              {usesStructuredTemplate && selectedTemplate
                ? `${selectedTemplate.name} 입력`
                : "기안 내용"}
            </label>
            {!usesStructuredTemplate ? (
              <span className="text-xs tabular-nums text-[var(--text-muted)]">
                {content.length}/5000
              </span>
            ) : null}
          </div>
          {usesStructuredTemplate && selectedTemplate ? (
            <>
              <input name="content" type="hidden" value={structuredContent} />
              <div
                role="group"
                aria-label={`${selectedTemplate.name} 입력 항목`}
                aria-describedby={contentHasError ? "draft-content-error" : undefined}
                data-form-error-target={contentHasError ? "true" : undefined}
                tabIndex={contentHasError ? -1 : undefined}
                className="mt-2 grid gap-4 lg:grid-cols-2"
              >
                {selectedTemplateFields.map((field) => (
                  <TemplateInput
                    key={field.name}
                    field={field}
                    pending={isBusy}
                    value={templateFieldValues[field.name] ?? ""}
                    onChange={(value) => {
                      clearServerError("content");
                      setTemplateFieldValues((current) => ({
                        ...current,
                        [field.name]: value,
                      }));
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <LineNumberedTextarea
              id="content"
              name="content"
              value={content}
              ariaDescribedBy={contentHasError ? "draft-content-error" : undefined}
              ariaInvalid={contentHasError}
              disabled={isBusy}
              onChange={(value) => {
                setContent(value);
                clearServerError("content");
              }}
              rows={9}
              placeholder="기안 내용을 입력하세요"
              hasError={contentHasError}
            />
          )}
          {contentHasError && errors?.content ? (
            <p
              id="draft-content-error"
              className="mt-2 text-sm text-[var(--danger)]"
            >
              {errors.content}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <label
            htmlFor="attachments"
            className="text-sm font-semibold text-[var(--foreground)]"
          >
            첨부파일
          </label>
          {existingAttachments.length > 0 ? (
            <ul className="mt-2 divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
              {existingAttachments.map((attachment) => {
                const isRemoved = removedAttachmentIds.includes(attachment.id);

                return (
                  <li
                    key={attachment.id}
                    className={`px-3 py-2 ${isRemoved ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      hidden
                      readOnly
                      name="removeAttachmentIds"
                      value={attachment.id}
                      checked={isRemoved}
                    />
                    <AttachmentFileRow
                      fileName={attachment.originalName}
                      note={
                        isRemoved
                          ? "삭제 예정"
                          : attachment.signedSourceAttachmentId
                            ? "서명본"
                            : "기존 첨부"
                      }
                      size={attachment.size}
                      thumbnailHref={
                        getAttachmentPreviewKind(
                          attachment.originalName,
                          attachment.mimeType,
                        ) === "image"
                          ? `/attachments/${attachment.id}/preview`
                          : undefined
                      }
                      action={
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => toggleRemovedAttachment(attachment.id)}
                          className={buttonClass(
                            buttonStyles.base,
                            isRemoved
                              ? buttonStyles.neutral
                              : buttonStyles.dangerOutline,
                            "h-11 px-3 text-xs",
                          )}
                        >
                          {isRemoved ? "삭제 취소" : "삭제"}
                        </button>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}
          <input
            id="attachments"
            name="attachments"
            type="file"
            ref={attachmentInputRef}
            hidden
            multiple
            accept={attachmentPolicy.allowedExtensions.join(",")}
            disabled={isBusy}
            onChange={(event) => handleAttachmentChange(event.currentTarget.files)}
          />
          <div
            className={`mt-2 flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-md border border-dashed bg-[var(--surface-muted)] px-3 py-2${
              attachmentHasError
                ? ` ${errorBorderClass}`
                : " border-[var(--border-strong)]"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {selectedFiles.length > 0
                  ? `새 파일 ${selectedFiles.length}개 선택됨`
                  : "첨부할 파일을 선택하세요"}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                여러 파일을 한 번에 선택할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              disabled={isBusy}
              aria-describedby="draft-attachment-policy"
              onClick={() => attachmentInputRef.current?.click()}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.create,
                "h-11 shrink-0 px-4 text-sm",
              )}
            >
              파일 선택
            </button>
          </div>
          {selectedFiles.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface)]">
              {selectedFiles.map((file) => (
                <li key={getAttachmentSelectionKey(file)} className="px-3 py-2">
                  <AttachmentFileRow
                    fileName={file.name}
                    note="새로 추가"
                    size={file.size}
                    thumbnailHref={
                      selectedFileThumbnailUrls[getAttachmentSelectionKey(file)]
                    }
                    action={
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          removeSelectedFile(getAttachmentSelectionKey(file))
                        }
                        className={buttonClass(
                          buttonStyles.base,
                          buttonStyles.dangerOutline,
                          "h-11 px-3 text-xs",
                        )}
                      >
                        제거
                      </button>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {attachmentError ? (
            <p
              id="draft-attachment-error"
              className="mt-2 text-sm text-[var(--danger)]"
            >
              {attachmentError}
            </p>
          ) : null}
          <p
            id="draft-attachment-policy"
            className="mt-2 text-xs text-[var(--text-muted)]"
          >
            최대 {attachmentPolicy.maxFileCount}개, 파일당{" "}
            {attachmentPolicy.maxFileSizeMb}MB 이하. 허용 확장자:{" "}
            {attachmentPolicy.allowedExtensions.join(", ")}
            {existingAttachments.length > 0
              ? ` / 기존 ${retainedAttachmentCount}개 포함`
              : ""}
          </p>
        </div>

        {errors?.form ? (
          <p
            tabIndex={-1}
            data-form-error-target="true"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-[var(--danger)] dark:border-red-400/40 dark:bg-red-400/10"
          >
            {errors.form}
          </p>
        ) : null}
      </section>

      <aside
        aria-labelledby="draft-approval-line-title"
        aria-describedby={approverHasError ? "draft-approver-error" : undefined}
        data-form-error-target={approverHasError ? "true" : undefined}
        tabIndex={approverHasError ? -1 : undefined}
        className={`scrollbar-stable self-start rounded-xl border bg-[var(--surface)] p-4 xl:sticky xl:top-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:max-h-[calc(100vh-10.25rem)] xl:overflow-y-auto${
          approverHasError
            ? ` border-[#cc1f1f] ring-2 ring-[#f4c7c7]`
            : " border-[var(--border)]"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="draft-approval-line-title"
              className="text-base font-semibold text-[var(--foreground)]"
            >
              결재선
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {allowedApproverPositionName
                ? `${allowedApproverPositionName} 단일 결재`
                : "결재 처리 순서"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
            {selectedApprovers.length}명
          </span>
        </div>

        <section className="mt-3" aria-labelledby="selected-approvers-title">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h3
              id="selected-approvers-title"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              지정된 결재자
            </h3>
            {!isFixedSingleApprover && eligibleApproverCandidates.length > 0 ? (
              <button
                type="button"
                aria-controls="draft-approver-directory"
                aria-expanded={isCandidateDirectoryOpen}
                disabled={isBusy}
                onClick={() =>
                  setIsCandidateDirectoryOpen((current) => !current)
                }
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.neutral,
                  "h-11 px-3 text-xs",
                )}
              >
                {isCandidateDirectoryOpen ? "후보 닫기" : "결재자 선택"}
              </button>
            ) : null}
          </div>

          {selectedApprovers.length > 0 ? (
            <ol className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)]">
              {selectedApprovers.map((approver, index) => (
                <li
                  key={approver.id}
                  className="flex min-h-16 items-center gap-2 px-2 py-1.5"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white"
                  >
                    {index + 1}
                  </span>
                  <input
                    type="hidden"
                    name="approverIds"
                    value={approver.id}
                  />
                  <UserIdentity
                    user={approver}
                    className="min-w-0 flex-1"
                    nameClassName="text-[var(--foreground)]"
                    metaClassName="text-[var(--text-muted)]"
                    meta={`${approver.departmentName} · ${approver.positionName}`}
                  />
                  {isFixedSingleApprover ? (
                    <span className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2 py-1 text-xs font-semibold text-[var(--brand)]">
                      자동 지정
                    </span>
                  ) : (
                    <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          title="위로 이동"
                          aria-label={`${approver.name} 위로 이동`}
                          disabled={isBusy || index === 0}
                          onClick={() => moveApprover(approver.id, -1)}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.neutral,
                            "size-11 text-sm disabled:opacity-40",
                          )}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          title="아래로 이동"
                          aria-label={`${approver.name} 아래로 이동`}
                          disabled={
                            isBusy || index === selectedApprovers.length - 1
                          }
                          onClick={() => moveApprover(approver.id, 1)}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.neutral,
                            "size-11 text-sm disabled:opacity-40",
                          )}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          title="삭제"
                          aria-label={`${approver.name} 삭제`}
                          disabled={isBusy}
                          onClick={() => removeApprover(approver.id)}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.dangerOutline,
                            "size-11 text-sm disabled:opacity-40",
                          )}
                        >
                          ×
                        </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-2 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-4 text-sm leading-5 text-[var(--text-muted)]">
              {allowedApproverPositionName
                ? `${allowedApproverPositionName}을 지정해야 결재를 요청할 수 있습니다.`
                : "결재자를 1명 이상 지정하세요."}
            </div>
          )}
          {approverHasError && errors?.approvers ? (
            <p
              id="draft-approver-error"
              className="mt-2 text-sm text-[var(--danger)]"
            >
              {errors.approvers}
            </p>
          ) : null}
        </section>

        {!isFixedSingleApprover && isCandidateDirectoryOpen ? (
          <section
            id="draft-approver-directory"
            aria-labelledby="approver-directory-title"
            className="mt-3 border-t border-[var(--border)] pt-3"
          >
            <h3
              id="approver-directory-title"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              결재자 후보
            </h3>
            {eligibleApproverCandidates.length > 0 ? (
              <>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                  <div>
                    <label htmlFor="approverSearch" className="sr-only">
                      결재자 검색
                    </label>
                    <input
                      id="approverSearch"
                      type="search"
                      value={query}
                      disabled={isBusy}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                        }
                      }}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="이름 또는 부서"
                      className="h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="departmentFilter" className="sr-only">
                      부서
                    </label>
                    <select
                      id="departmentFilter"
                      value={departmentFilter}
                      disabled={isBusy}
                      onChange={(event) =>
                        setDepartmentFilter(event.target.value)
                      }
                      className="h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
                    >
                      <option value="all">전체 부서</option>
                      {departments.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {availableApprovers.length > 0 ? (
                  <div className="mt-2 max-h-56 divide-y divide-[var(--border)] overflow-y-auto rounded-md border border-[var(--border)]">
                    {availableApprovers.map((candidate) => (
                      <div
                        key={candidate.id}
                        className="flex min-h-14 items-center justify-between gap-2 px-2 py-1.5"
                      >
                        <UserIdentity
                          user={candidate}
                          className="min-w-0 flex-1"
                          nameClassName="text-[var(--foreground)]"
                          metaClassName="text-[var(--text-muted)]"
                          meta={`${candidate.departmentName} · ${candidate.positionName}`}
                        />
                        <button
                          type="button"
                          aria-label={`${candidate.name} 결재자로 추가`}
                          disabled={isBusy}
                          onClick={() => addApprover(candidate.id)}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.create,
                            "h-11 shrink-0 px-3 text-xs",
                          )}
                        >
                          추가
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-4 text-sm text-[var(--text-muted)]">
                    검색 조건에 맞는 결재자가 없습니다.
                  </div>
                )}
              </>
            ) : (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                {allowedApproverPositionName ?? "결재 가능 직급"} 계정이 없습니다.
                관리자에게 직급 설정을 요청하세요.
              </div>
            )}
          </section>
        ) : null}

        <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-5 text-[var(--text-muted)]">
          {allowedApproverPositionName
            ? `결재 요청은 지정된 ${allowedApproverPositionName}에게 전달됩니다.`
            : "작성자 본인은 제외되며 결재선은 낮은 직급에서 높은 직급 순서로 지정합니다."}
          </p>
      </aside>

      <section
        aria-labelledby="draft-submit-actions-title"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 xl:col-start-1 xl:row-start-2"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2
              id="draft-submit-actions-title"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              저장 및 결재 요청
            </h2>
            <p
              id="draft-submit-readiness"
              aria-live="polite"
              className={[
                "mt-1 text-sm leading-5",
                canSubmitForApproval
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-[var(--text-muted)]",
              ].join(" ")}
            >
              {canSubmitForApproval
                ? `필수 입력과 결재선 ${selectedApprovers.length}명이 준비되었습니다.`
                : `결재 요청 전 확인: ${submitBlockReason}`}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">
              임시저장은 작성 중인 내용 그대로 보관합니다.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 sm:shrink-0">
            {cancelHref ? (
              <Link
                href={cancelHref}
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.cancel,
                  "h-11 px-4 text-sm",
                )}
              >
                취소
              </Link>
            ) : null}
            <button
              type="submit"
              name="intent"
              value="draft"
              formNoValidate
              disabled={isBusy || templates.length === 0}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-11 px-4 text-sm",
              )}
            >
              {isDraftPending
                ? "저장 중"
                : isEditMode
                  ? "수정 저장"
                  : "임시저장"}
            </button>
            <button
              type="submit"
              name="intent"
              value="submit"
              aria-describedby="draft-submit-readiness"
              disabled={isBusy || !canSubmitForApproval}
              title={submitBlockReason ?? undefined}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.primary,
                "h-11 px-4 text-sm",
              )}
            >
              {isSubmitPending ? "결재 요청 중" : "결재 요청"}
            </button>
          </div>
        </div>
      </section>

      <PendingOverlay
        description="서버에서 문서 저장과 결재 요청을 처리하는 중입니다. 완료되면 문서 화면으로 이동합니다."
        label="결재 요청 중"
        show={isSubmitPending}
      />
    </form>
  );
}

async function uploadAttachmentFiles(
  files: readonly File[],
): Promise<UploadedAttachmentMetadata[]> {
  const uploadedAttachments: UploadedAttachmentMetadata[] = [];

  for (const file of files) {
    const mimeType = file.type || "application/octet-stream";
    const signResult = await createSignedUploadUrlAction(
      file.name,
      mimeType,
      file.size,
    );

    if (!signResult.ok) {
      throw new Error(
        signResult.error ??
          "첨부파일 직접 업로드 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.",
      );
    }

    const response = await fetch(signResult.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
      },
      body: file,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");

      throw new Error(
        message
          ? `첨부파일 업로드에 실패했습니다: ${message}`
          : "첨부파일 업로드에 실패했습니다. 다시 시도해 주세요.",
      );
    }

    uploadedAttachments.push({
      originalName: file.name,
      storageProvider: signResult.provider,
      storageKey: signResult.storageKey,
      mimeType,
      size: file.size,
    });
  }

  return uploadedAttachments;
}

function getInitialValues(
  state: DraftFormState,
  templates: DraftFormProps["templates"],
  providedInitialValues?: DraftFormValues,
  defaultApproverIds: string[] = [],
): DraftFormValues {
  const templateId =
    state.values?.templateId ??
    providedInitialValues?.templateId ??
    templates[0]?.id ??
    "";
  const content = state.values?.content ?? providedInitialValues?.content ?? "";

  return {
    title: state.values?.title ?? providedInitialValues?.title ?? "",
    category: state.values?.category ?? providedInitialValues?.category ?? "일반",
    templateId,
    content,
    approverIds:
      state.values?.approverIds ??
      providedInitialValues?.approverIds ??
      defaultApproverIds,
    templateFieldValues:
      state.values?.templateFieldValues ??
      providedInitialValues?.templateFieldValues ??
      getTemplateFieldValuesForSelectedTemplate(templateId, templates, content),
  };
}

function getInitialTemplateFieldValues(
  initialValues: DraftFormValues,
  templates: DraftFormProps["templates"],
) {
  return (
    initialValues.templateFieldValues ??
    getTemplateFieldValuesForSelectedTemplate(
      initialValues.templateId,
      templates,
      initialValues.content,
    )
  );
}

function getDraftSubmitBlockReason({
  allowedApproverPositionName,
  attachmentError,
  content,
  selectedApproverIds,
  selectedApprovers,
  selectedTemplate,
  templateFieldValues,
  title,
}: {
  allowedApproverPositionName?: string;
  attachmentError: string | null;
  content: string;
  selectedApproverIds: string[];
  selectedApprovers: ApprovalCandidate[];
  selectedTemplate: DraftFormProps["templates"][number] | undefined;
  templateFieldValues: Record<string, string>;
  title: string;
}) {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  if (trimmedTitle.length < 2) {
    return "제목은 2자 이상 입력하세요.";
  }

  if (trimmedTitle.length > 120) {
    return "제목은 120자 이내로 입력하세요.";
  }

  if (!selectedTemplate) {
    return "문서 양식을 선택하세요.";
  }

  const templateErrors = validateDocumentTemplateContentValues(
    selectedTemplate.schema,
    templateFieldValues,
  );

  if (templateErrors.length > 0) {
    return templateErrors[0];
  }

  if (trimmedContent.length < 10) {
    return "기안 내용은 10자 이상 입력하세요.";
  }

  if (trimmedContent.length > 5000) {
    return "기안 내용은 5000자 이내로 입력하세요.";
  }

  if (
    allowedApproverPositionName &&
    (selectedApprovers.length !== 1 ||
      selectedApprovers[0]?.positionName !== allowedApproverPositionName)
  ) {
    return `${allowedApproverPositionName} 1명을 결재자로 지정하세요.`;
  }

  if (selectedApproverIds.length === 0) {
    return "결재자를 1명 이상 지정하세요.";
  }

  if (new Set(selectedApproverIds).size !== selectedApproverIds.length) {
    return "같은 결재자는 한 번만 지정할 수 있습니다.";
  }

  if (selectedApprovers.length !== selectedApproverIds.length) {
    return "사용 가능한 결재자만 지정할 수 있습니다.";
  }

  const approvalLineError = getApprovalLinePolicyError(
    selectedApprovers.map((approver) => ({
      name: approver.name,
      positionName: approver.positionName,
      positionLevel: approver.positionLevel,
    })),
  );

  if (approvalLineError) {
    return approvalLineError;
  }

  return attachmentError;
}

function getSubmitIntent(
  submitter: HTMLElement | null | undefined,
): DraftSubmitIntent {
  if (
    submitter instanceof HTMLButtonElement &&
    submitter.name === "intent" &&
    (submitter.value === "draft" || submitter.value === "submit")
  ) {
    return submitter.value;
  }

  return null;
}

function setTemplateFieldFormDataValues(
  formData: FormData,
  values: Record<string, string>,
) {
  for (const [fieldName, value] of Object.entries(values)) {
    formData.set(getTemplateFieldInputName(fieldName), value);
  }
}

function getTemplateFieldValuesForSelectedTemplate(
  templateId: string,
  templates: DraftFormProps["templates"],
  content: string,
) {
  const template = templates.find((candidate) => candidate.id === templateId);

  return template
    ? getDocumentTemplateInitialFieldValues(template.schema, content)
    : {};
}

function isDraftFormTemplateFieldVisible(
  templateId: string,
  field: DocumentTemplateField,
  values: Record<string, string>,
) {
  if (templateId === vacationRequestTemplateId) {
    const vacationType = values.vacationType?.trim() || "annual";

    if (
      field.name === "startDate" ||
      field.name === "endDate" ||
      field.name === "emergencyContact"
    ) {
      return vacationType !== "half_day";
    }

    if (field.name === "halfDayDate" || field.name === "halfDayPeriod") {
      return vacationType === "half_day";
    }

    if (field.name === "familyEventType" || field.name === "eventDate") {
      return vacationType === "family_event";
    }
  }

  if (!field.visibleWhen) {
    return true;
  }

  const value = values[field.visibleWhen.field]?.trim() ?? "";

  return field.visibleWhen.values.includes(value);
}

function TemplateInput({
  field,
  onChange,
  pending,
  value,
}: {
  field: DocumentTemplateField;
  onChange: (value: string) => void;
  pending: boolean;
  value: string;
}) {
  const inputId = `template-field-${field.name}`;
  const inputName = getTemplateFieldInputName(field.name);
  const isRequired = field.required;
  const baseClass =
    "mt-2 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]";

  return (
    <div className={field.type === "textarea" ? "lg:col-span-2" : ""}>
      <label
        htmlFor={inputId}
        className="text-xs font-semibold text-[var(--text-muted)]"
      >
        {field.label}
      </label>
      {field.type === "textarea" ? (
        <LineNumberedTextarea
          id={inputId}
          name={inputName}
          required={isRequired}
          disabled={pending}
          rows={5}
          value={value}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      ) : field.type === "select" ? (
        <select
          id={inputId}
          name={inputName}
          required={isRequired}
          disabled={pending}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={`${baseClass} h-11`}
        >
          <option value="">선택하세요</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <label className="mt-2 flex h-11 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]">
          <input name={inputName} type="hidden" value="false" />
          <input
            id={inputId}
            name={inputName}
            type="checkbox"
            value="true"
            checked={value === "true"}
            required={isRequired}
            disabled={pending}
            onChange={(event) =>
              onChange(event.currentTarget.checked ? "true" : "false")
            }
            className="size-4 rounded border-[#cfd6e3] accent-[#196b69]"
          />
          <span>{field.helpText || "예"}</span>
        </label>
      ) : field.type === "date" ? (
        <DatePickerInput
          id={inputId}
          name={inputName}
          required={isRequired}
          disabled={pending}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={`${baseClass} h-11`}
        />
      ) : (
        <input
          id={inputId}
          name={inputName}
          required={isRequired}
          disabled={pending}
          type={field.type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={`${baseClass} h-11`}
        />
      )}
    </div>
  );
}

function LineNumberedTextarea({
  ariaDescribedBy,
  ariaInvalid = false,
  disabled = false,
  hasError = false,
  id,
  name,
  onChange,
  placeholder,
  required = false,
  rows,
  value,
}: {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  id: string;
  name?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  rows: number;
  value: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineNumbers, setLineNumbers] = useState(() =>
    getTextareaLineNumbers(value),
  );
  const borderClass = hasError
    ? "border-[#cc1f1f] ring-2 ring-[#f4c7c7]"
    : "border-[#cfd6e3]";
  const syncLineNumbers = useCallback(() => {
    const nextLineNumbers = textareaRef.current
      ? getTextareaVisualLineNumbers(textareaRef.current)
      : getTextareaLineNumbers(value);

    setLineNumbers((currentLineNumbers) =>
      areLineNumbersEqual(currentLineNumbers, nextLineNumbers)
        ? currentLineNumbers
        : nextLineNumbers,
    );
  }, [value]);

  useEffect(() => {
    syncLineNumbers();
  }, [syncLineNumbers]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(syncLineNumbers);
    resizeObserver.observe(textarea);

    return () => resizeObserver.disconnect();
  }, [syncLineNumbers]);

  return (
    <div
      className={[
        "mt-2 flex w-full max-w-[53.75rem] overflow-hidden rounded-md border bg-[var(--surface)] text-sm transition focus-within:border-[var(--brand)]",
        borderClass,
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <div
        aria-hidden="true"
        className={documentContentLineNumberColumnClass}
      >
        <div style={{ transform: `translateY(-${scrollTop}px)` }}>
          {lineNumbers.map((lineNumber) => (
            <div key={lineNumber} className="h-6 px-2">
              {lineNumber}
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        required={required}
        disabled={disabled}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        placeholder={placeholder}
        className={`${documentContentTextColumnBaseClass} resize-y border-0 bg-[var(--surface)] outline-none placeholder:text-[#9aa4b2] disabled:cursor-not-allowed`}
      />
    </div>
  );
}

function getTextareaVisualLineNumbers(textarea: HTMLTextAreaElement) {
  const lineCount = getTextareaVisualLineCount(textarea);

  return Array.from({ length: lineCount }, (_, index) => index + 1);
}

function getTextareaVisualLineCount(textarea: HTMLTextAreaElement) {
  if (typeof window === "undefined" || textarea.clientWidth === 0) {
    return getTextareaLineNumbers(textarea.value).length;
  }

  const computedStyle = window.getComputedStyle(textarea);
  const lineHeight = getComputedLineHeight(computedStyle);
  const paddingTop = getPixelValue(computedStyle.paddingTop);
  const paddingBottom = getPixelValue(computedStyle.paddingBottom);
  const measuringTextarea = document.createElement("textarea");

  measuringTextarea.value = textarea.value || " ";
  measuringTextarea.rows = 1;
  measuringTextarea.tabIndex = -1;
  measuringTextarea.setAttribute("aria-hidden", "true");

  Object.assign(measuringTextarea.style, {
    position: "absolute",
    top: "0",
    left: "-9999px",
    width: `${textarea.clientWidth}px`,
    height: "0",
    minHeight: "0",
    maxHeight: "none",
    padding: computedStyle.padding,
    border: "0",
    boxSizing: "border-box",
    font: computedStyle.font,
    letterSpacing: computedStyle.letterSpacing,
    lineHeight: computedStyle.lineHeight,
    overflow: "hidden",
    pointerEvents: "none",
    resize: "none",
    textTransform: computedStyle.textTransform,
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    wordBreak: computedStyle.wordBreak,
  });
  measuringTextarea.style.setProperty(
    "overflow-wrap",
    computedStyle.getPropertyValue("overflow-wrap"),
  );
  measuringTextarea.style.setProperty(
    "tab-size",
    computedStyle.getPropertyValue("tab-size"),
  );

  document.body.appendChild(measuringTextarea);

  try {
    const contentHeight = Math.max(
      measuringTextarea.scrollHeight - paddingTop - paddingBottom,
      lineHeight,
    );

    return Math.max(1, Math.round(contentHeight / lineHeight));
  } finally {
    measuringTextarea.remove();
  }
}

function getComputedLineHeight(computedStyle: CSSStyleDeclaration) {
  const lineHeight = getPixelValue(computedStyle.lineHeight);

  if (lineHeight > 0) {
    return lineHeight;
  }

  return getPixelValue(computedStyle.fontSize) * 1.2;
}

function getPixelValue(value: string) {
  const numericValue = Number.parseFloat(value);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function getTextareaLineNumbers(value: string) {
  const lineCount = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(
    "\n",
  ).length;

  return Array.from({ length: Math.max(lineCount, 1) }, (_, index) => index + 1);
}

function areLineNumbersEqual(
  currentLineNumbers: readonly number[],
  nextLineNumbers: readonly number[],
) {
  return currentLineNumbers.length === nextLineNumbers.length;
}

function isApprovalCandidate(
  candidate: ApprovalCandidate | undefined,
): candidate is ApprovalCandidate {
  return Boolean(candidate);
}

function validateAttachmentFiles(
  fileList: FileList | readonly AttachmentSelectionFile[] | null,
  policy: DraftFormProps["attachmentPolicy"],
  existingFileCount = 0,
) {
  const files = Array.from(fileList ?? []);

  if (files.length === 0) {
    return null;
  }

  if (files.length + existingFileCount > policy.maxFileCount) {
    return `첨부파일은 최대 ${policy.maxFileCount}개까지 등록할 수 있습니다.`;
  }

  const allowedExtensions = new Set(
    policy.allowedExtensions.map((extension) => extension.toLowerCase()),
  );
  const maxFileSize = policy.maxFileSizeMb * 1024 * 1024;

  for (const file of files) {
    const extension = getFileExtension(file.name);

    if (!extension || !allowedExtensions.has(extension)) {
      return `허용되지 않는 파일 형식입니다: ${file.name}`;
    }

    if (file.size > maxFileSize) {
      return `파일은 ${policy.maxFileSizeMb}MB 이하만 등록할 수 있습니다: ${file.name}`;
    }
  }

  return null;
}

function syncAttachmentInputFiles(
  input: HTMLInputElement | null,
  files: readonly File[],
) {
  if (!input) {
    return;
  }

  if (files.length === 0) {
    input.value = "";
    return;
  }

  if (typeof DataTransfer === "undefined") {
    return;
  }

  const dataTransfer = new DataTransfer();

  for (const file of files) {
    dataTransfer.items.add(file);
  }

  input.files = dataTransfer.files;
}
