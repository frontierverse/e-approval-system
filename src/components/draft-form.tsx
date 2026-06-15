"use client";

import Link from "next/link";
import {
  type FormEvent,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createDraftAction } from "@/app/drafts/new/actions";
import { AttachmentFileRow } from "@/components/attachment-file-row";
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
  extractDocumentTemplateFieldValuesFromContent,
  getSafeRenderableDocumentTemplateFields,
  getTemplateFieldInputName,
} from "@/lib/draft-template-content";
import type { DocumentTemplateField } from "@/lib/document-template-schema";
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
  action?: DraftFormAction;
  cancelHref?: string;
  initialValues?: DraftFormValues;
  existingAttachments?: ExistingAttachment[];
  mode?: "create" | "edit";
};

type DraftFormAction = (
  state: DraftFormState,
  formData: FormData,
) => Promise<DraftFormState>;

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
  action = createDraftAction,
  cancelHref,
  initialValues: providedInitialValues,
  existingAttachments = [],
  mode = "create",
}: DraftFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState,
  );
  const initialValues = getInitialValues(state, templates, providedInitialValues);

  return (
    <DraftFormFields
      templates={templates}
      attachmentPolicy={attachmentPolicy}
      approverCandidates={approverCandidates}
      action={action}
      errors={state.errors}
      cancelHref={cancelHref}
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
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const selectedFileThumbnailUrls = useAttachmentThumbnailUrls(selectedFiles);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const titleHasError = Boolean(errors?.title);
  const templateHasError = Boolean(errors?.templateId);
  const contentHasError = Boolean(errors?.content);
  const approverHasError = Boolean(errors?.approvers);
  const attachmentHasError = Boolean(attachmentError);
  const isEditMode = mode === "edit";
  const retainedAttachmentCount =
    getRetainedAttachmentCount(removedAttachmentIds);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );
  const selectedTemplateFields = useMemo(
    () =>
      selectedTemplate
        ? getSafeRenderableDocumentTemplateFields(selectedTemplate.schema)
        : [],
    [selectedTemplate],
  );
  const usesStructuredTemplate = selectedTemplateFields.length > 0;
  const structuredContent =
    usesStructuredTemplate && selectedTemplate
      ? compileDocumentTemplateContentFromSchema(
          selectedTemplate.schema,
          templateFieldValues,
          content,
        )
      : content;

  const errorBorderClass = "border-[#cc1f1f] ring-2 ring-[#f4c7c7]";

  const departments = useMemo(
    () =>
      Array.from(
        new Set(approverCandidates.map((candidate) => candidate.departmentName)),
      ).sort((a, b) => a.localeCompare(b, "ko-KR")),
    [approverCandidates],
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

  const availableApprovers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

    return approverCandidates.filter((candidate) => {
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
  }, [approverCandidates, departmentFilter, query, selectedApproverIds]);

  useEffect(() => {
    syncAttachmentInputFiles(attachmentInputRef.current, selectedFiles);
  }, [errors, selectedFiles]);

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

    const next = [...selectedApproverIds, approverId];
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
  }

  function removeApprover(approverId: string) {
    setSelectedApproverIds((current) =>
      current.filter((id) => id !== approverId),
    );
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("attachments");
    const fileError =
      input instanceof HTMLInputElement
        ? validateAttachmentFiles(
            input.files,
            attachmentPolicy,
            retainedAttachmentCount,
          )
        : null;

    if (fileError) {
      event.preventDefault();
      setAttachmentError(fileError);
      return;
    }

    setAttachmentError(null);
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

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <section className="rounded-md border border-[#d9dee7] bg-white p-5">
        <div>
          <label
            htmlFor="title"
            className="text-sm font-semibold text-[#394150]"
          >
            제목
          </label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="제목을 입력하세요"
            className={`mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
              titleHasError ? ` ${errorBorderClass}` : ""
            }`}
          />
          {errors?.title ? (
            <p className="mt-2 text-sm text-[#8a1f1f]">{errors.title}</p>
          ) : null}
        </div>

        <div className="mt-5">
          <div>
            <label
              htmlFor="templateId"
              className="text-sm font-semibold text-[#394150]"
            >
              문서 양식
            </label>
            <select
              id="templateId"
              name="templateId"
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value);
                setTemplateFieldValues(
                  getTemplateFieldValuesForSelectedTemplate(
                    event.target.value,
                    templates,
                    "",
                  ),
                );
              }}
              className={`mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
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
            {errors?.templateId ? (
              <p className="mt-2 text-sm text-[#8a1f1f]">{errors.templateId}</p>
            ) : null}
            {templates.length === 0 ? (
              <p className="mt-2 text-sm text-[#8a1f1f]">
                관리자에게 활성 문서 양식을 요청하세요.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <label
            className="text-sm font-semibold text-[#394150]"
            htmlFor={usesStructuredTemplate ? undefined : "content"}
          >
            {usesStructuredTemplate && selectedTemplate
              ? `${selectedTemplate.name} 입력`
              : "기안 내용"}
          </label>
          {usesStructuredTemplate && selectedTemplate ? (
            <>
              <input name="content" type="hidden" value={structuredContent} />
              <div className="mt-2 grid gap-4 lg:grid-cols-2">
                {selectedTemplateFields.map((field) => (
                  <TemplateInput
                    key={field.name}
                    field={field}
                    pending={pending}
                    value={templateFieldValues[field.name] ?? ""}
                    onChange={(value) =>
                      setTemplateFieldValues((current) => ({
                        ...current,
                        [field.name]: value,
                      }))
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <LineNumberedTextarea
              id="content"
              name="content"
              value={content}
              onChange={setContent}
              rows={12}
              placeholder="기안 내용을 입력하세요"
              hasError={contentHasError}
            />
          )}
          {errors?.content ? (
            <p className="mt-2 text-sm text-[#8a1f1f]">{errors.content}</p>
          ) : null}
        </div>

        <div className="mt-5">
          <label
            htmlFor="attachments"
            className="text-sm font-semibold text-[#394150]"
          >
            첨부파일
          </label>
          {existingAttachments.length > 0 ? (
            <ul className="mt-2 divide-y divide-[#eef1f5] rounded-md border border-[#eef1f5]">
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
                          disabled={pending}
                          onClick={() => toggleRemovedAttachment(attachment.id)}
                          className={buttonClass(
                            buttonStyles.base,
                            isRemoved
                              ? buttonStyles.neutral
                              : buttonStyles.dangerOutline,
                            "h-8 px-3 text-xs",
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
            multiple
            accept={attachmentPolicy.allowedExtensions.join(",")}
            disabled={pending}
            onChange={(event) => handleAttachmentChange(event.currentTarget.files)}
            className={`mt-2 block w-full rounded-md border border-dashed bg-[#fbfcfd] px-4 py-4 text-sm text-[#394150] file:mr-4 file:h-9 file:rounded-md file:border-0 file:bg-[#0f6f8f] file:px-3 file:text-sm file:font-semibold file:text-white hover:file:bg-[#0b5973] disabled:cursor-not-allowed disabled:opacity-60${
              attachmentHasError
                ? ` ${errorBorderClass}`
                : " border-[#cfd6e3]"
            }`}
          />
          {selectedFiles.length > 0 ? (
            <ul className="mt-3 divide-y divide-[#eef1f5] rounded-md border border-[#eef1f5] bg-white">
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
                        disabled={pending}
                        onClick={() =>
                          removeSelectedFile(getAttachmentSelectionKey(file))
                        }
                        className={buttonClass(
                          buttonStyles.base,
                          buttonStyles.dangerOutline,
                          "h-8 px-3 text-xs",
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
            <p className="mt-2 text-sm text-[#8a1f1f]">{attachmentError}</p>
          ) : null}
          <p className="mt-2 text-xs text-[#697386]">
            최대 {attachmentPolicy.maxFileCount}개, 파일당{" "}
            {attachmentPolicy.maxFileSizeMb}MB 이하. 허용 확장자:{" "}
            {attachmentPolicy.allowedExtensions.join(", ")}
            {existingAttachments.length > 0
              ? ` / 기존 ${retainedAttachmentCount}개 포함`
              : ""}
          </p>
        </div>

        {errors?.form ? (
          <p className="mt-5 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {errors.form}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {cancelHref ? (
            <Link
              href={cancelHref}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.cancel,
                "h-10 px-4 text-sm",
              )}
            >
              취소
            </Link>
          ) : null}
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={pending || templates.length === 0}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 px-4 text-sm",
            )}
          >
            {pending ? "저장 중" : isEditMode ? "수정 저장" : "임시저장"}
          </button>
          <button
            type="submit"
            name="intent"
            value="submit"
            disabled={pending || templates.length === 0}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.primary,
              "h-10 px-4 text-sm",
            )}
          >
            {pending ? "처리 중" : "결재 요청"}
          </button>
        </div>
      </section>

          <aside
            className={`self-start rounded-md border bg-white p-5${
              approverHasError
                ? ` border-[#cc1f1f] ring-2 ring-[#f4c7c7]`
                : " border-[#d9dee7]"
            }`}
          >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">결재선</h2>
            <p className="mt-1 text-xs text-[#697386]">
              {selectedApprovers.length}명 지정
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <label
              htmlFor="approverSearch"
              className="text-xs font-semibold text-[#697386]"
            >
              검색
            </label>
            <input
              id="approverSearch"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름, 이메일, 부서"
              className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            />
          </div>

          <div>
            <label
              htmlFor="departmentFilter"
              className="text-xs font-semibold text-[#697386]"
            >
              부서
            </label>
            <select
              id="departmentFilter"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            >
              <option value="all">전체</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 max-h-[18rem] space-y-2 overflow-y-auto pr-1">
          {availableApprovers.length > 0 ? (
            availableApprovers.map((candidate) => (
              <div
                key={candidate.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[#eef1f5] p-3"
              >
                <UserIdentity
                  user={candidate}
                  meta={`${candidate.departmentName} · ${candidate.positionName}`}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => addApprover(candidate.id)}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.create,
                    "h-8 shrink-0 px-3 text-xs",
                  )}
                >
                  추가
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm leading-6 text-[#697386]">
              선택 가능한 결재자가 없습니다.
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-[#eef1f5] pt-5">
          <h3 className="text-sm font-semibold text-[#394150]">결재 순서</h3>
          {selectedApprovers.length > 0 ? (
            <ol className="mt-4 space-y-4">
              {selectedApprovers.map((approver, index) => (
                <li
                  key={approver.id}
                  className="relative min-h-20 pl-11"
                >
                  {index < selectedApprovers.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-[1.125rem] top-10 h-[calc(100%-1rem)] w-px bg-[#e7ecf2]"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={[
                      "absolute left-0 top-0 grid size-9 place-items-center rounded-full border text-sm font-semibold",
                      index === 0
                        ? "border-[#b8d9d7] bg-[#196b69] text-white"
                        : "border-[#cfd6e3] bg-[#f7f9fc] text-[#697386]",
                    ].join(" ")}
                  >
                    {index + 1}
                  </span>
                  <input
                    type="hidden"
                    name="approverIds"
                    value={approver.id}
                  />
                  <div
                    className={[
                      "rounded-md border px-3 py-3",
                      index === 0
                        ? "border-[#b8d9d7] bg-[#e5f2f1]"
                        : "border-[#eef1f5] bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-semibold text-[#697386]">
                          {index + 1}차 결재자
                        </p>
                        <UserIdentity
                          user={approver}
                          meta={`${approver.departmentName} · ${approver.positionName}`}
                        />
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          title="위로 이동"
                          aria-label={`${approver.name} 위로 이동`}
                          disabled={pending || index === 0}
                          onClick={() => moveApprover(approver.id, -1)}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.neutral,
                            "h-8 w-8 text-sm disabled:opacity-40",
                          )}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          title="아래로 이동"
                          aria-label={`${approver.name} 아래로 이동`}
                          disabled={
                            pending || index === selectedApprovers.length - 1
                          }
                          onClick={() => moveApprover(approver.id, 1)}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.neutral,
                            "h-8 w-8 text-sm disabled:opacity-40",
                          )}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          title="삭제"
                          aria-label={`${approver.name} 삭제`}
                          disabled={pending}
                          onClick={() => removeApprover(approver.id)}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.dangerOutline,
                            "h-8 w-8 text-sm disabled:opacity-40",
                          )}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-medium text-[#697386]">
                      {index === 0
                        ? "결재 요청 후 가장 먼저 처리할 단계입니다."
                        : "앞 단계가 끝나면 결재 차례가 됩니다."}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm leading-6 text-[#697386]">
              결재자를 1명 이상 지정하세요.
            </div>
          )}
          {errors?.approvers ? (
            <p className="mt-3 text-sm text-[#8a1f1f]">{errors.approvers}</p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-[#697386]">
            작성자 본인은 제외되며 같은 결재자는 한 번만 지정됩니다. 결재선은
            낮은 직급에서 높은 직급 순서로 지정하세요.
          </p>
        </div>
      </aside>
    </form>
  );
}

function getInitialValues(
  state: DraftFormState,
  templates: DraftFormProps["templates"],
  providedInitialValues?: DraftFormValues,
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
      state.values?.approverIds ?? providedInitialValues?.approverIds ?? [],
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

function getTemplateFieldValuesForSelectedTemplate(
  templateId: string,
  templates: DraftFormProps["templates"],
  content: string,
) {
  const template = templates.find((candidate) => candidate.id === templateId);

  return template
    ? extractDocumentTemplateFieldValuesFromContent(template.schema, content)
    : {};
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
    "mt-2 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]";

  return (
    <div className={field.type === "textarea" ? "lg:col-span-2" : ""}>
      <label htmlFor={inputId} className="text-xs font-semibold text-[#697386]">
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
        <label className="mt-2 flex h-11 items-center gap-2 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm text-[#394150]">
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
        "mt-2 flex w-full max-w-[53.75rem] overflow-hidden rounded-md border bg-white text-sm transition focus-within:border-[#196b69]",
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
        required={required}
        disabled={disabled}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        placeholder={placeholder}
        className={`${documentContentTextColumnBaseClass} resize-y border-0 bg-white outline-none placeholder:text-[#9aa4b2] disabled:cursor-not-allowed`}
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
