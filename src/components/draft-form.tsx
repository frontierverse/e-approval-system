"use client";

import Link from "next/link";
import {
  type FormEvent,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createDraftAction } from "@/app/drafts/new/actions";
import { AttachmentFileRow } from "@/components/attachment-file-row";
import { UserIdentity } from "@/components/user-identity";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { DraftFormState, DraftFormValues } from "@/lib/draft-form-state";
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
  email: string;
  departmentName: string;
  positionName: string;
  profileImageStorageKey?: string | null;
  profileImageUpdatedAt?: string | null;
};

type ExistingAttachment = {
  id: string;
  originalName: string;
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
  const [category, setCategory] = useState(initialValues.category);
  const [templateId, setTemplateId] = useState(initialValues.templateId);
  const [content, setContent] = useState(initialValues.content);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>(
    initialValues.approverIds,
  );
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const titleHasError = Boolean(errors?.title);
  const categoryHasError = Boolean(errors?.category);
  const templateHasError = Boolean(errors?.templateId);
  const contentHasError = Boolean(errors?.content);
  const approverHasError = Boolean(errors?.approvers);
  const attachmentHasError = Boolean(attachmentError);
  const isEditMode = mode === "edit";

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
        candidate.email,
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
    setSelectedApproverIds((current) =>
      current.includes(approverId) ? current : [...current, approverId],
    );
  }

  function removeApprover(approverId: string) {
    setSelectedApproverIds((current) =>
      current.filter((id) => id !== approverId),
    );
  }

  function moveApprover(approverId: string, direction: -1 | 1) {
    setSelectedApproverIds((current) => {
      const index = current.indexOf(approverId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];

      return next;
    });
  }

  function handleAttachmentChange(fileList: FileList | null) {
    const nextFiles = mergeAttachmentSelections(
      selectedFiles,
      Array.from(fileList ?? []),
    );
    const fileError = validateAttachmentFiles(
      nextFiles,
      attachmentPolicy,
      existingAttachments.length,
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
      validateAttachmentFiles(nextFiles, attachmentPolicy, existingAttachments.length),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("attachments");
    const fileError =
      input instanceof HTMLInputElement
        ? validateAttachmentFiles(
            input.files,
            attachmentPolicy,
            existingAttachments.length,
          )
        : null;

    if (fileError) {
      event.preventDefault();
      setAttachmentError(fileError);
      return;
    }

    setAttachmentError(null);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
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

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <label
              htmlFor="category"
              className="text-sm font-semibold text-[#394150]"
            >
              문서 분류
            </label>
            <input
              id="category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="예: 구매 품의, 비용 정산"
              className={`mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
                categoryHasError ? ` ${errorBorderClass}` : ""
              }`}
            />
            {errors?.category ? (
              <p className="mt-2 text-sm text-[#8a1f1f]">{errors.category}</p>
            ) : null}
          </div>

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
              onChange={(event) => setTemplateId(event.target.value)}
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
            htmlFor="content"
            className="text-sm font-semibold text-[#394150]"
          >
            기안 내용
          </label>
          <textarea
            id="content"
            name="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={12}
            placeholder="기안 내용을 입력하세요"
            className={`mt-2 w-full resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
              contentHasError ? ` ${errorBorderClass}` : ""
            }`}
          />
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
              {existingAttachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="px-3 py-2"
                >
                  <AttachmentFileRow
                    fileName={attachment.originalName}
                    note="기존 첨부"
                    size={attachment.size}
                  />
                </li>
              ))}
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
              ? ` / 기존 ${existingAttachments.length}개 포함`
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
            <ol className="mt-3 space-y-2">
              {selectedApprovers.map((approver, index) => (
                <li
                  key={approver.id}
                  className="rounded-md border border-[#eef1f5] p-3"
                >
                  <input
                    type="hidden"
                    name="approverIds"
                    value={approver.id}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-semibold text-[#697386]">
                        {index + 1}차
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
            작성자 본인은 제외되며 같은 결재자는 한 번만 지정됩니다.
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
  return {
    title: state.values?.title ?? providedInitialValues?.title ?? "",
    category: state.values?.category ?? providedInitialValues?.category ?? "일반",
    templateId:
      state.values?.templateId ??
      providedInitialValues?.templateId ??
      templates[0]?.id ??
      "",
    content: state.values?.content ?? providedInitialValues?.content ?? "",
    approverIds:
      state.values?.approverIds ?? providedInitialValues?.approverIds ?? [],
  };
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
