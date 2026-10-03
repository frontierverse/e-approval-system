"use client";

import Link from "next/link";
import {
  type DragEvent,
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { startResourceUploadAction, getResourceUploadStatusAction, grantResourceUploadAction, completeResourceUploadAction, getResourceMutationStatusAction, getResourceEditorAction } from "@/app/resources/upload-actions";
import { prepareResourceWebUpload, ResourceWebUploadError, type ResourceWebUploadAttempt } from "@/lib/resource-web-upload";
import { getResourceFormValues, validateResourceFormValues } from "@/lib/resource-form-state";
import { AttachmentFileRow } from "@/components/attachment-file-row";
import { PendingOverlay } from "@/components/form-pending-overlay";
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
  resourceEducationLevelOptions,
  resourceCategoryOptions,
  type ResourceCategory,
  type ResourceEducationLevel,
} from "@/lib/resource-library-core";

type ExistingResourceAttachment = {
  id: string;
  mimeType?: string | null;
  originalName: string;
  size: number;
};

type ResourceFormProps = {
  actorId: string;
  initialRequestId: string;
  resourceId?: string;
  expectedUpdatedAt?: string;
  directUploadSupported: boolean;
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

export function ResourceForm(props: ResourceFormProps) {
  return <ResourceFormFields {...props} />;
}

export function ResourceUploadPendingOverlay({ show }: { show: boolean }) {
  return <PendingOverlay description="자료와 첨부파일을 저장하고 있습니다. 잠시만 기다려 주세요." label="저장 중" show={show} />;
}

type WebResourceAttempt = {
  requestId: string;
  payload: FormData;
  files: ResourceWebUploadAttempt[];
  parentSent: boolean;
  unknown: boolean;
  prepared: boolean;
};

function ResourceFormFields({ action, actorId, initialRequestId, resourceId, expectedUpdatedAt,
  directUploadSupported, attachmentPolicy, cancelHref, existingAttachments: initialAttachments = [],
  initialValues = { title: "", summary: "", category: "bajaul", educationLevel: "" }, mode,
}: ResourceFormProps) {
  const router = useRouter();
  // Keep the server action registered for progressive enhancement. JavaScript
  // uses the same action with a frozen request after owner-bound file verification.
  const [serverState, formAction, serverPending] = useActionState(action, initialState);
  const [clientState, setClientState] = useState<ResourceFormState | null>(null);
  const state = clientState ?? serverState;
  const errors = state.errors;
  const [isUploading, setIsUploading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [requestId, setRequestId] = useState(initialRequestId);
  const [baseline, setBaseline] = useState(expectedUpdatedAt);
  const [existingAttachments, setExistingAttachments] = useState(initialAttachments);
  const busyRef = useRef(false);
  const attemptRef = useRef<WebResourceAttempt | null>(null);
  const filesRef = useRef(new Map<File, ResourceWebUploadAttempt>());
  const recoveryRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pending = serverPending || isUploading;
  const controlsLocked = pending || locked;

  useEffect(() => () => { controllerRef.current?.abort(); controllerRef.current = null; }, []);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentDragDepthRef = useRef(0);
  const [title, setTitle] = useState(initialValues.title);
  const [summary, setSummary] = useState(initialValues.summary);
  const [category, setCategory] = useState<ResourceCategory>(
    initialValues.category,
  );
  const [educationLevel, setEducationLevel] = useState<
    ResourceEducationLevel | ""
  >(initialValues.educationLevel);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const selectedFileThumbnailUrls = useAttachmentThumbnailUrls(selectedFiles);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isAttachmentDragActive, setIsAttachmentDragActive] = useState(false);
  const retainedAttachmentCount =
    existingAttachments.length - removedAttachmentIds.length;
  const titleHasError = Boolean(errors?.title);
  const summaryHasError = Boolean(errors?.summary);
  const categoryHasError = Boolean(errors?.category);
  const educationLevelHasError = Boolean(errors?.educationLevel);
  const attachmentHasError = Boolean(errors?.attachments || attachmentError);
  const hideCategoryField =
    mode === "create" && initialValues.category === "education";
  const primaryFieldsGridClass = hideCategoryField
    ? "lg:grid-cols-[minmax(0,1fr)_12rem]"
    : category === "education"
      ? "lg:grid-cols-[minmax(0,1fr)_14rem_12rem]"
      : "lg:grid-cols-[minmax(0,1fr)_14rem]";
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

  function handleAttachmentDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasFileDragItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (controlsLocked) {
      return;
    }

    attachmentDragDepthRef.current += 1;
    setIsAttachmentDragActive(true);
  }

  function handleAttachmentDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFileDragItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = controlsLocked ? "none" : "copy";

    if (controlsLocked) {
      return;
    }

    setIsAttachmentDragActive(true);
  }

  function handleAttachmentDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFileDragItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (controlsLocked) {
      return;
    }

    attachmentDragDepthRef.current = Math.max(
      0,
      attachmentDragDepthRef.current - 1,
    );

    if (attachmentDragDepthRef.current === 0) {
      setIsAttachmentDragActive(false);
    }
  }

  function handleAttachmentDrop(event: DragEvent<HTMLElement>) {
    if (!hasFileDragItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current = 0;
    setIsAttachmentDragActive(false);

    if (controlsLocked) {
      return;
    }

    handleAttachmentChange(event.dataTransfer.files);
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

  function focusErrors(next: ResourceFormState["errors"]) {
    const field = Object.keys(next ?? {}).find(key => key !== "form" && key !== "attachments");
    const input = field ? formRef.current?.elements.namedItem(field) : next?.attachments ? attachmentInputRef.current : null;
    queueMicrotask(() => { if (input instanceof HTMLElement) input.focus(); else errorRef.current?.focus(); });
  }
  useEffect(() => { if (errors) focusErrors(errors); }, [errors]);
  function clearPrivate(message: string) {
    const old = attemptRef.current;
    recoveryRef.current = old?.parentSent ? old.requestId : null;
    controllerRef.current?.abort();
    attemptRef.current = null;
    filesRef.current.clear();
    setTitle(""); setSummary(""); setSelectedFiles([]); setExistingAttachments([]); setRemovedAttachmentIds([]);
    setForbidden(true); setLocked(true);
    setClientState({ errors: { form: message }, attemptDisposition: "forbidden" });
  }
  async function recoverCommitted(key: string, signal: AbortSignal) {
    const result = await getResourceMutationStatusAction(key, actorId);
    if (signal.aborted) return true;
    if (result.ok) {
      const receipt = result.data;
      if (!receipt || receipt.ok !== true || receipt.operation !== (mode === "edit" ? "update" : "create") || resourceId && receipt.resourceId !== resourceId) throw new ResourceWebUploadError("저장 결과를 다시 확인해 주세요.");
      router.replace(`/resources?category=${category}`); router.refresh();
      return true;
    }
    if (result.status === 401 || result.status === 403) { clearPrivate(result.error); return true; }
    if (result.status === 404 && result.code === "NOT_FOUND") return false;
    throw new ResourceWebUploadError(result.error, result.code, result.status);
  }
  async function resolveConflict(replace: boolean) {
    if (!resourceId || busyRef.current) return;
    busyRef.current = true; setIsUploading(true);
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const result = await getResourceEditorAction(resourceId, actorId);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if ([401,403,404].includes(result.status)) { clearPrivate(result.error); return; }
        throw new ResourceWebUploadError(result.error, result.code, result.status);
      }
      const fresh = result.data.resource;
      if (!fresh || fresh.id !== resourceId || !fresh.canManage) throw new ResourceWebUploadError("자료 수정 권한을 다시 확인해 주세요.");
      setExistingAttachments(fresh.attachments.map(file => ({ id: file.id, originalName: file.name, mimeType: file.mimeType, size: file.size })));
      setRemovedAttachmentIds(current => current.filter(id => fresh.attachments.some(file => file.id === id)));
      if (replace) { setTitle(fresh.title); setSummary(fresh.summary); setCategory(fresh.category); setEducationLevel(fresh.educationLevel ?? ""); setSelectedFiles([]); setRemovedAttachmentIds([]); }
      setBaseline(fresh.updatedAt); setRequestId(crypto.randomUUID());
      attemptRef.current = null; setLocked(false); setClientState({});
    } catch (cause) {
      if (!controller.signal.aborted) setClientState({ errors: { form: cause instanceof ResourceWebUploadError ? cause.message : "최신 자료를 확인하지 못했습니다. 다시 확인하세요." }, attemptDisposition: "conflict" });
    } finally { if (controllerRef.current === controller) { busyRef.current = false; setIsUploading(false); } }
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || forbidden || state.attemptDisposition === "conflict") return;
    const form = event.currentTarget;
    let attempt = attemptRef.current;
    if (!attempt) {
      const payload = new FormData(form);
      const fieldErrors = validateResourceFormValues(getResourceFormValues(payload));
      const fileError = validateAttachmentFiles(selectedFiles, attachmentPolicy, retainedAttachmentCount);
      if (fileError) fieldErrors.attachments = fileError;
      if (Object.keys(fieldErrors).length) { setClientState({ errors: fieldErrors }); focusErrors(fieldErrors); return; }
      payload.set("requestId", requestId); payload.set("expectedActorId", actorId);
      if (baseline) payload.set("expectedUpdatedAt", baseline);
      const files = selectedFiles.map(file => {
        let item = filesRef.current.get(file);
        if (!item) { item = { file, requestId: crypto.randomUUID(), targetResourceId: resourceId ?? null }; filesRef.current.set(file, item); }
        return item;
      });
      attempt = { requestId, payload, files, parentSent: false, unknown: false, prepared: !directUploadSupported };
      attemptRef.current = attempt;
    }
    const active = attempt;
    busyRef.current = true; setIsUploading(true); setLocked(true); setAttachmentError(null);
    const controller = new AbortController(); controllerRef.current = controller;
    const signal = controller.signal;
    startTransition(async () => {
      try {
        if (active.parentSent && await recoverCommitted(active.requestId, signal)) return;
        if (signal.aborted) return;
        if (!active.prepared) {
          const uploadIds: string[] = [];
          const ports = {
            start: (input: Parameters<typeof startResourceUploadAction>[0]) => startResourceUploadAction(input, actorId),
            status: (input: Parameters<typeof getResourceUploadStatusAction>[0]) => getResourceUploadStatusAction(input, actorId),
            grant: (id: string) => grantResourceUploadAction(id, actorId),
            complete: (id: string) => completeResourceUploadAction(id, actorId),
          };
          for (const file of active.files) uploadIds.push(await prepareResourceWebUpload(file, ports, signal));
          if (signal.aborted) return;
          active.payload.delete("attachments");
          active.payload.set("resourceUploadIds", JSON.stringify(uploadIds));
          active.prepared = true;
        }
        if (signal.aborted) return;
        if (active.unknown) active.payload.set("resourceAttemptWasUnknown", "true");
        active.parentSent = true;
        // Everything that identifies this save was fixed before any mutation.
        const result = await action(state, active.payload);
        if (signal.aborted) return;
        setClientState(result); focusErrors(result.errors);
        if (result.attemptDisposition === "forbidden") { clearPrivate(result.errors?.form ?? "자료 수정 권한을 다시 확인해 주세요."); return; }
        if (result.attemptDisposition === "rejected") { attemptRef.current = null; setRequestId(crypto.randomUUID()); setLocked(false); }
        else if (result.attemptDisposition === "conflict") setLocked(true);
        else { active.unknown = true; setLocked(true); }
      } catch (cause) {
        if (signal.aborted) return;
        if (cause && typeof cause === "object" && "digest" in cause && String(cause.digest).startsWith("NEXT_REDIRECT")) return;
        if (cause instanceof ResourceWebUploadError && [401,403,404].includes(cause.status)) { clearPrivate(cause.message); return; }
        active.unknown ||= active.parentSent;
        const message = cause instanceof ResourceWebUploadError ? cause.message : "저장 결과를 확인하지 못했습니다. 입력을 유지한 채 같은 요청으로 다시 확인하세요.";
        setClientState({ errors: { form: message }, attemptDisposition: "unknown" }); focusErrors({ form: message });
      } finally {
        if (controllerRef.current === controller) { busyRef.current = false; setIsUploading(false); }
      }
    });
  }

  useEffect(() => {
    const dirty = locked || selectedFiles.length > 0 || removedAttachmentIds.length > 0 || title !== initialValues.title || summary !== initialValues.summary || category !== initialValues.category || educationLevel !== initialValues.educationLevel;
    if (!dirty || forbidden) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [locked, selectedFiles.length, removedAttachmentIds.length, title, summary, category, educationLevel, initialValues, forbidden]);

  if (forbidden) return <section className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] p-4">
    <p role="alert" className="text-sm text-[#8a1f1f]">{errors?.form}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Link href="/resources" className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-4 text-sm")}>자료실로</Link>
      <button type="button" disabled={pending} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-4 text-sm")} onClick={() => {
        const key = recoveryRef.current; if (!key || busyRef.current) return;
        busyRef.current = true; setIsUploading(true);
        const controller = new AbortController(); controllerRef.current = controller;
        void recoverCommitted(key, controller.signal).catch(() => { if (!controller.signal.aborted) setClientState({ errors: { form: "저장 결과를 확인하지 못했습니다. 같은 계정으로 자료실을 다시 열어 확인하세요." } }); }).finally(() => { if (controllerRef.current === controller) { busyRef.current = false; setIsUploading(false); } });
      }}>저장 결과 확인</button>
    </div>
  </section>;

  return (
    <>
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedActorId" value={actorId} />
      {baseline ? <input type="hidden" name="expectedUpdatedAt" value={baseline} /> : null}
      {hideCategoryField ? (
        <input type="hidden" name="category" value={category} />
      ) : null}
      <section className="rounded-md border border-[#d9dee7] bg-white p-5">
        <div className={`grid gap-5 ${primaryFieldsGridClass}`}>
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
              readOnly={controlsLocked}
              aria-invalid={titleHasError}
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

          {hideCategoryField ? null : (
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
              disabled={controlsLocked}
              aria-invalid={categoryHasError}
              onChange={(event) => {
                const nextCategory = event.target.value as ResourceCategory;
                setCategory(nextCategory);

                if (nextCategory !== "education") {
                  setEducationLevel("");
                }
              }}
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
          )}

          {category === "education" ? (
            <div>
              <label
                htmlFor="educationLevel"
                className="text-sm font-semibold text-[#394150]"
              >
                교육 대상
              </label>
              <select
                id="educationLevel"
                name="educationLevel"
                value={educationLevel}
                disabled={controlsLocked}
                aria-invalid={educationLevelHasError}
                onChange={(event) =>
                  setEducationLevel(
                    event.target.value as ResourceEducationLevel | "",
                  )
                }
                className={`mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]${
                  educationLevelHasError ? ` ${errorBorderClass}` : ""
                }`}
              >
                <option value="">대상 선택</option>
                {resourceEducationLevelOptions
                  .filter(
                    (
                      option,
                    ): option is {
                      value: ResourceEducationLevel;
                      label: string;
                    } => option.value !== "all",
                  )
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </select>
              {errors?.educationLevel ? (
                <p className="mt-2 text-sm text-[#8a1f1f]">
                  {errors.educationLevel}
                </p>
              ) : null}
            </div>
          ) : null}
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
            readOnly={controlsLocked}
            aria-invalid={summaryHasError}
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
          <p role="alert" tabIndex={-1} ref={errorRef} className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {errors.form}
          </p>
        ) : null}

        {state.attemptDisposition === "conflict" ? <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => void resolveConflict(false)} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3 text-sm")}>입력 유지하고 최신 기준 사용</button>
          <button type="button" disabled={pending} onClick={() => { if (window.confirm("작성 중인 내용을 서버의 최신 내용으로 바꿀까요?")) void resolveConflict(true); }} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3 text-sm")}>서버 내용 불러오기</button>
        </div> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {cancelHref ? (
            <Link
              href={cancelHref}
              onClick={event => { if (pending || !window.confirm(locked ? "저장 결과를 확인하지 못한 요청이 있습니다. 자료실에서 결과를 확인할 수 있습니다. 이 화면을 나갈까요?" : "입력한 내용을 저장하지 않고 나갈까요?")) event.preventDefault(); }}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.cancel,
                "min-h-11 px-4 text-sm",
              )}
            >
              취소
            </Link>
          ) : null}
          <button
            type="submit"
            disabled={pending || state.attemptDisposition === "conflict"}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.primary,
              "min-h-11 px-4 text-sm",
            )}
          >
            {pending ? "저장 중" : locked ? "같은 요청으로 다시 확인" : mode === "edit" ? "수정 저장" : "업로드"}
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
                      showFullFileName
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
                          disabled={controlsLocked}
                          onClick={() => toggleRemovedAttachment(attachment.id)}
                          className={buttonClass(
                            buttonStyles.base,
                            isRemoved
                              ? buttonStyles.neutral
                              : buttonStyles.dangerOutline,
                            "min-h-11 px-3 text-xs",
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
          </div>
        ) : null}

        <div className="mt-4">
          <label
            htmlFor="attachments"
            className="text-xs font-semibold text-[#697386]"
          >
            새 첨부
          </label>
          <div
            onDragEnter={handleAttachmentDragEnter}
            onDragLeave={handleAttachmentDragLeave}
            onDragOver={handleAttachmentDragOver}
            onDrop={handleAttachmentDrop}
            className={[
              "mt-2 rounded-md border border-dashed px-4 py-4 transition",
              controlsLocked ? "cursor-not-allowed opacity-60" : "bg-[#fbfcfd]",
              isAttachmentDragActive
                ? "border-[#196b69] bg-[#eef8f7] ring-2 ring-[#bfe1df]"
                : "border-[#cfd6e3]",
              attachmentHasError ? errorBorderClass : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <input
              id="attachments"
              name="attachments"
              type="file"
              ref={attachmentInputRef}
              multiple
              accept={attachmentPolicy.allowedExtensions.join(",")}
              disabled={controlsLocked}
              aria-describedby="attachments-drop-help"
              onChange={(event) =>
                handleAttachmentChange(event.currentTarget.files)
              }
              className="block w-full text-sm text-[#394150] file:mr-4 file:h-11 file:rounded-md file:border-0 file:bg-[#0f6f8f] file:px-3 file:text-sm file:font-semibold file:text-white hover:file:bg-[#0b5973] disabled:cursor-not-allowed"
            />
            <p
              id="attachments-drop-help"
              className={[
                "mt-3 rounded-md px-3 py-2 text-xs leading-5",
                isAttachmentDragActive
                  ? "bg-[#d7eceb] font-semibold text-[#0f5553]"
                  : "bg-white text-[#697386]",
              ].join(" ")}
            >
              {isAttachmentDragActive
                ? "여기에 놓으면 첨부파일로 추가됩니다."
                : "파일을 이 영역에 끌어다 놓거나 파일 선택 버튼으로 추가하세요."}
            </p>
          </div>
        </div>

        {selectedFiles.length > 0 ? (
          <ul className="mt-3 divide-y divide-[#eef1f5] rounded-md border border-[#eef1f5] bg-white">
            {selectedFiles.map((file) => (
              <li key={getAttachmentSelectionKey(file)} className="px-3 py-2">
                <AttachmentFileRow
                  fileName={file.name}
                  note="새로 추가"
                  showFullFileName
                  size={file.size}
                  thumbnailHref={
                    selectedFileThumbnailUrls[getAttachmentSelectionKey(file)]
                  }
                  action={
                    <button
                      type="button"
                      disabled={controlsLocked}
                      onClick={() =>
                        removeSelectedFile(getAttachmentSelectionKey(file))
                      }
                      className={buttonClass(
                        buttonStyles.base,
                        buttonStyles.dangerOutline,
                        "min-h-11 px-3 text-xs",
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
    <ResourceUploadPendingOverlay show={pending} />
    </>
  );
}

function hasFileDragItems(dataTransfer: DataTransfer) {
  return (
    Array.from(dataTransfer.types).includes("Files") ||
    dataTransfer.files.length > 0
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

    if (file.size <= 0) return `비어 있는 파일은 등록할 수 없습니다: ${file.name}`;

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
