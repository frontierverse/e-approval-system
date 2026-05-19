"use client";

import Link from "next/link";
import {
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { AttachmentFileRow } from "@/components/attachment-file-row";
import { useAttachmentThumbnailUrls } from "@/components/use-attachment-thumbnail-urls";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { AttachmentPolicyConfig } from "@/lib/attachment-storage";
import {
  getAttachmentSelectionKey,
  getFileExtension,
  mergeAttachmentSelections,
  type AttachmentSelectionFile,
} from "@/lib/file-display";
import type {
  ResourceFormState,
  ResourceFormValues,
} from "@/lib/resource-form-state";
import {
  resourceCategoryOptions,
  type ResourceCategory,
} from "@/lib/resource-library-core";

type ExistingResourceAttachment = {
  id: string;
  mimeType?: string | null;
  originalName: string;
  size: number;
};

type ResourceFormProps = {
  action: ResourceFormAction;
  attachmentPolicy: AttachmentPolicyConfig;
  existingAttachments?: ExistingResourceAttachment[];
  initialValues?: ResourceFormValues;
  cancelHref?: string;
  mode: "create" | "edit";
};

type ResourceFormAction = (
  state: ResourceFormState,
  formData: FormData,
) => Promise<ResourceFormState>;

const initialState: ResourceFormState = {};
const categoryOptions = resourceCategoryOptions.filter(
  (option): option is { value: ResourceCategory; label: string } =>
    option.value !== "all",
);

export function ResourceForm({
  action,
  attachmentPolicy,
  cancelHref,
  existingAttachments = [],
  initialValues,
  mode,
}: ResourceFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = {
    title: state.values?.title ?? initialValues?.title ?? "",
    summary: state.values?.summary ?? initialValues?.summary ?? "",
    category: state.values?.category ?? initialValues?.category ?? "bajaul",
  };

  return (
    <ResourceFormFields
      action={formAction}
      attachmentPolicy={attachmentPolicy}
      cancelHref={cancelHref}
      errors={state.errors}
      existingAttachments={existingAttachments}
      initialValues={values}
      mode={mode}
      pending={pending}
    />
  );
}

function ResourceFormFields({
  action,
  attachmentPolicy,
  cancelHref,
  errors,
  existingAttachments,
  initialValues,
  mode,
  pending,
}: {
  action: (formData: FormData) => void;
  attachmentPolicy: AttachmentPolicyConfig;
  cancelHref?: string;
  errors?: ResourceFormState["errors"];
  existingAttachments: ExistingResourceAttachment[];
  initialValues: ResourceFormValues;
  mode: "create" | "edit";
  pending: boolean;
}) {
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialValues.title);
  const [summary, setSummary] = useState(initialValues.summary);
  const [category, setCategory] = useState<ResourceCategory>(
    initialValues.category,
  );
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const selectedFileThumbnailUrls = useAttachmentThumbnailUrls(selectedFiles);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const retainedAttachmentCount =
    existingAttachments.length - removedAttachmentIds.length;
  const titleHasError = Boolean(errors?.title);
  const summaryHasError = Boolean(errors?.summary);
  const categoryHasError = Boolean(errors?.category);
  const attachmentHasError = Boolean(errors?.attachments || attachmentError);
  const errorBorderClass = "border-[#cc1f1f] ring-2 ring-[#f4c7c7]";

  useEffect(() => {
    syncAttachmentInputFiles(attachmentInputRef.current, selectedFiles);
  }, [errors, selectedFiles]);

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
    setRemovedAttachmentIds((current) =>
      current.includes(attachmentId)
        ? current.filter((id) => id !== attachmentId)
        : [...current, attachmentId],
    );
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

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <section className="rounded-md border border-[#d9dee7] bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
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
              placeholder="자료 제목을 입력하세요"
              className={`mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
                titleHasError ? ` ${errorBorderClass}` : ""
              }`}
            />
            {errors?.title ? (
              <p className="mt-2 text-sm text-[#8a1f1f]">{errors.title}</p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="category"
              className="text-sm font-semibold text-[#394150]"
            >
              자료실
            </label>
            <select
              id="category"
              name="category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ResourceCategory)
              }
              className={`mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
                categoryHasError ? ` ${errorBorderClass}` : ""
              }`}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors?.category ? (
              <p className="mt-2 text-sm text-[#8a1f1f]">{errors.category}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="summary"
            className="text-sm font-semibold text-[#394150]"
          >
            내용
          </label>
          <textarea
            id="summary"
            name="summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={8}
            placeholder="공유할 업무 내용이나 자료 설명을 입력하세요"
            className={`mt-2 w-full resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
              summaryHasError ? ` ${errorBorderClass}` : ""
            }`}
          />
          {errors?.summary ? (
            <p className="mt-2 text-sm text-[#8a1f1f]">{errors.summary}</p>
          ) : null}
        </div>

        {errors?.form ? (
          <p className="mt-5 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {errors.form}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
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
            disabled={pending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.primary,
              "h-10 px-4 text-sm",
            )}
          >
            {pending ? "저장 중" : mode === "edit" ? "수정 저장" : "업로드"}
          </button>
        </div>
      </section>

      <aside
        className={`self-start rounded-md border bg-white p-5${
          attachmentHasError
            ? ` border-[#cc1f1f] ring-2 ring-[#f4c7c7]`
            : " border-[#d9dee7]"
        }`}
      >
        <h2 className="text-base font-semibold text-[#16181d]">첨부파일</h2>
        <p className="mt-1 text-xs leading-5 text-[#697386]">
          최대 {attachmentPolicy.maxFileCount}개, 파일당{" "}
          {attachmentPolicy.maxFileSizeMb}MB 이하
        </p>

        {existingAttachments.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-[#697386]">기존 첨부</p>
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
                      note={isRemoved ? "삭제 예정" : "기존 첨부"}
                      size={attachment.size}
                      thumbnailHref={
                        getAttachmentPreviewKind(
                          attachment.originalName,
                          attachment.mimeType,
                        ) === "image"
                          ? `/resources/attachments/${attachment.id}/preview`
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
                          {isRemoved ? "유지" : "삭제"}
                        </button>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-4">
          <label
            htmlFor="attachments"
            className="text-xs font-semibold text-[#697386]"
          >
            새 첨부
          </label>
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
        </div>

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

        {attachmentError || errors?.attachments ? (
          <p className="mt-3 text-sm text-[#8a1f1f]">
            {attachmentError ?? errors?.attachments}
          </p>
        ) : null}

        <p className="mt-3 text-xs leading-5 text-[#697386]">
          허용 확장자: {attachmentPolicy.allowedExtensions.join(", ")}
        </p>
      </aside>
    </form>
  );
}

function validateAttachmentFiles(
  fileList: FileList | readonly AttachmentSelectionFile[] | null,
  policy: AttachmentPolicyConfig,
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
