"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  type AdminTemplateSchemaFormState,
  type AdminTemplateFormState,
  createAdminTemplateAction,
  updateAdminTemplateAction,
  updateAdminTemplateSchemaAction,
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
import {
  documentTemplateFieldTypes,
  getSafeDocumentTemplateSchema,
  validateDocumentTemplateSchema,
  type DocumentTemplateField,
  type DocumentTemplateFieldOption,
  type DocumentTemplateFieldType,
  type DocumentTemplateSchemaV1,
} from "@/lib/document-template-schema";

type AdminTemplateManagementProps = {
  templates: AdminTemplate[];
};

type AdminTemplate = {
  id: string;
  name: string;
  description: string | null;
  schema: unknown;
  isActive: boolean;
  _count: {
    documents: number;
  };
};

const initialState: AdminTemplateFormState = {};
const initialSchemaState: AdminTemplateSchemaFormState = {};

const fieldTypeLabels = {
  text: "한 줄 입력",
  textarea: "긴본문",
  number: "숫자",
  date: "날짜",
  select: "선택",
  checkbox: "체크박스",
  attachments: "첨부파일",
} satisfies Record<DocumentTemplateFieldType, string>;

const fieldTypeOptions = documentTemplateFieldTypes.map((type) => ({
  value: type,
  label: fieldTypeLabels[type],
}));

type EditableTemplateField = {
  clientId: string;
  name: string;
  label: string;
  type: DocumentTemplateFieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  options: DocumentTemplateFieldOption[];
};

type TemplateDesignerPreviewMode = "form" | "pdf";

type PdfDocument = {
  destroy(): Promise<void> | void;
  getPage(pageNumber: number): Promise<PdfPage>;
  numPages: number;
};

type PdfPage = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    transform?: number[];
    viewport: PdfViewport;
  }): PdfRenderTask;
};

type PdfRenderTask = {
  cancel(): void;
  promise: Promise<void>;
};

type PdfViewport = {
  height: number;
  width: number;
};

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
        <TemplateSchemaEditorModal
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

function TemplateSchemaEditorModal({
  template,
  triggerClassName,
}: {
  template: AdminTemplate;
  triggerClassName: string;
}) {
  const updateTemplateSchema = updateAdminTemplateSchemaAction.bind(
    null,
    template.id,
  );
  const [state, formAction, pending] = useActionState(
    updateTemplateSchema,
    initialSchemaState,
  );
  const [fields, setFields] = useState(() =>
    getEditableTemplateFields(template.schema),
  );
  const [selectedFieldId, setSelectedFieldId] = useState(
    () => fields[0]?.clientId ?? "",
  );
  const [previewMode, setPreviewMode] =
    useState<TemplateDesignerPreviewMode>("form");
  const schemaForSubmit = useMemo(
    () => getSchemaFromEditableFields(fields),
    [fields],
  );
  const selectedField =
    fields.find((field) => field.clientId === selectedFieldId) ??
    fields[0] ??
    null;
  const validation = useMemo(
    () => validateDocumentTemplateSchema(schemaForSubmit),
    [schemaForSubmit],
  );
  const schemaJson = useMemo(
    () => JSON.stringify(schemaForSubmit),
    [schemaForSubmit],
  );
  const invalidMessage = validation.ok ? null : validation.errors[0];

  function addField(type: DocumentTemplateFieldType = "text") {
    const nextField = createEditableField(fields, type);

    setFields([...fields, nextField]);
    setSelectedFieldId(nextField.clientId);
  }

  function removeField(clientId: string) {
    if (fields.length <= 1) {
      return;
    }

    const removedIndex = fields.findIndex(
      (field) => field.clientId === clientId,
    );
    const nextFields = fields.filter((field) => field.clientId !== clientId);

    setFields(nextFields);

    if (selectedFieldId === clientId) {
      setSelectedFieldId(
        nextFields[Math.min(removedIndex, nextFields.length - 1)]?.clientId ??
          "",
      );
    }
  }

  function moveField(clientId: string, direction: -1 | 1) {
    const index = fields.findIndex((field) => field.clientId === clientId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= fields.length) {
      return;
    }

    const nextFields = [...fields];
    [nextFields[index], nextFields[nextIndex]] = [
      nextFields[nextIndex],
      nextFields[index],
    ];

    setFields(nextFields);
    setSelectedFieldId(clientId);
  }

  function updateField(
    clientId: string,
    patch: Partial<Omit<EditableTemplateField, "clientId">>,
  ) {
    setFields((current) =>
      current.map((field) => {
        if (field.clientId !== clientId) {
          return field;
        }

        const nextField = { ...field, ...patch };

        if (patch.type === "select" && nextField.options.length === 0) {
          nextField.options = [createEditableOption(1)];
        }

        if (patch.type && patch.type !== "select") {
          nextField.options = [];
        }

        return nextField;
      }),
    );
  }

  function addOption(clientId: string) {
    setFields((current) =>
      current.map((field) =>
        field.clientId === clientId
          ? {
              ...field,
              options: [
                ...field.options,
                createEditableOption(field.options.length + 1),
              ],
            }
          : field,
      ),
    );
  }

  function updateOption(
    clientId: string,
    optionIndex: number,
    patch: Partial<DocumentTemplateFieldOption>,
  ) {
    setFields((current) =>
      current.map((field) =>
        field.clientId === clientId
          ? {
              ...field,
              options: field.options.map((option, index) =>
                index === optionIndex ? { ...option, ...patch } : option,
              ),
            }
          : field,
      ),
    );
  }

  function removeOption(clientId: string, optionIndex: number) {
    setFields((current) =>
      current.map((field) =>
        field.clientId === clientId
          ? {
              ...field,
              options:
                field.options.length <= 1
                  ? field.options
                  : field.options.filter((_, index) => index !== optionIndex),
            }
          : field,
      ),
    );
  }

  return (
    <AdminEditModal
      title={`${template.name} 양식 편집`}
      description="문서에 표시할 입력 필드 구성을 수정합니다."
      trigger="양식 편집"
      triggerClassName={triggerClassName}
      dialogClassName="max-w-7xl"
    >
      <form action={formAction} className="grid gap-5">
        <input name="schemaJson" type="hidden" value={schemaJson} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] pb-4">
          <div className="text-sm text-[#697386]">
            필드 {fields.length}개 · 저장 시 schema 검증 적용
          </div>
          <span className="rounded-full bg-[#eef8f7] px-3 py-1 text-xs font-semibold text-[#196b69]">
            GUI 편집
          </span>
        </div>

        <div className="grid min-h-[34rem] gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          <TemplateDesignerFieldList
            fields={fields}
            selectedFieldId={selectedField?.clientId ?? ""}
            pending={pending}
            onAddField={addField}
            onSelect={setSelectedFieldId}
            onMove={moveField}
            onRemove={removeField}
          />
          <TemplateDesignerPreview
            template={template}
            fields={fields}
            schema={schemaForSubmit}
            schemaValid={validation.ok}
            selectedFieldId={selectedField?.clientId ?? ""}
            mode={previewMode}
            onModeChange={setPreviewMode}
            onSelect={setSelectedFieldId}
          />
          <TemplateDesignerPropertyPanel
            field={selectedField}
            pending={pending}
            onUpdate={(clientId, patch) => updateField(clientId, patch)}
            onAddOption={addOption}
            onUpdateOption={updateOption}
            onRemoveOption={removeOption}
          />
        </div>

        {invalidMessage ? (
          <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {invalidMessage}
          </p>
        ) : null}
        <FormMessage state={state} />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || !validation.ok}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 px-4 text-sm",
            )}
          >
            {pending ? "저장 중" : "양식 구성 저장"}
          </button>
        </div>
      </form>
    </AdminEditModal>
  );
}

function TemplateDesignerFieldList({
  fields,
  selectedFieldId,
  pending,
  onAddField,
  onSelect,
  onMove,
  onRemove,
}: {
  fields: EditableTemplateField[];
  selectedFieldId: string;
  pending: boolean;
  onAddField: (type?: DocumentTemplateFieldType) => void;
  onSelect: (clientId: string) => void;
  onMove: (clientId: string, direction: -1 | 1) => void;
  onRemove: (clientId: string) => void;
}) {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] rounded-md border border-[#d9dee7] bg-white">
      <div className="border-b border-[#eef1f5] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#16181d]">필드 목록</h3>
      </div>

      <div className="min-h-0 space-y-2 overflow-y-auto p-3">
        {fields.map((field, index) => {
          const selected = field.clientId === selectedFieldId;

          return (
            <div
              key={field.clientId}
              className={[
                "rounded-md border bg-white p-2 transition",
                selected
                  ? "border-[#196b69] shadow-[0_0_0_2px_rgba(25,107,105,0.12)]"
                  : "border-[#e3e7ee] hover:border-[#cfd6e3]",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => onSelect(field.clientId)}
                className="block w-full min-w-0 text-left"
              >
                <span className="block truncate text-sm font-semibold text-[#16181d]">
                  {field.label || "라벨 없음"}
                </span>
                <span className="mt-1 block truncate text-xs text-[#697386]">
                  {index + 1}. {fieldTypeLabels[field.type]}
                  {field.required ? " · 필수" : ""}
                </span>
              </button>
              <div className="mt-2 grid grid-cols-3 gap-1">
                <button
                  type="button"
                  title="위로 이동"
                  aria-label={`${field.label || "필드"} 위로 이동`}
                  disabled={pending || index === 0}
                  onClick={() => onMove(field.clientId, -1)}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-7 px-0 text-xs",
                  )}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="아래로 이동"
                  aria-label={`${field.label || "필드"} 아래로 이동`}
                  disabled={pending || index === fields.length - 1}
                  onClick={() => onMove(field.clientId, 1)}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-7 px-0 text-xs",
                  )}
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={pending || fields.length <= 1}
                  onClick={() => onRemove(field.clientId)}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.dangerOutline,
                    "h-7 px-0 text-xs",
                  )}
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#eef1f5] p-3">
        <h4 className="text-xs font-semibold text-[#697386]">필드 추가</h4>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {fieldTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              onClick={() => onAddField(option.value)}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-8 px-2 text-xs",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function TemplateDesignerPreview({
  template,
  fields,
  schema,
  schemaValid,
  selectedFieldId,
  mode,
  onModeChange,
  onSelect,
}: {
  template: AdminTemplate;
  fields: EditableTemplateField[];
  schema: DocumentTemplateSchemaV1;
  schemaValid: boolean;
  selectedFieldId: string;
  mode: TemplateDesignerPreviewMode;
  onModeChange: (mode: TemplateDesignerPreviewMode) => void;
  onSelect: (clientId: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-md border border-[#d9dee7] bg-[#f7f9fc]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e7ee] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#16181d]">미리보기</h3>
        <div className="grid grid-cols-2 rounded-md border border-[#cfd6e3] bg-white p-0.5">
          {[
            { value: "form", label: "입력 화면" },
            { value: "pdf", label: "PDF 출력" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onModeChange(option.value as TemplateDesignerPreviewMode)
              }
              className={[
                "h-8 rounded px-3 text-xs font-semibold transition",
                mode === option.value
                  ? "bg-[#196b69] text-white"
                  : "text-[#697386] hover:bg-[#f3f5f8]",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 overflow-auto p-4">
        {mode === "pdf" ? (
          <TemplateDesignerPdfPreview
            template={template}
            schema={schema}
            schemaValid={schemaValid}
          />
        ) : (
          <TemplateDesignerFormPreview
            fields={fields}
            selectedFieldId={selectedFieldId}
            onSelect={onSelect}
          />
        )}
      </div>
    </section>
  );
}

function TemplateDesignerFormPreview({
  fields,
  selectedFieldId,
  onSelect,
}: {
  fields: EditableTemplateField[];
  selectedFieldId: string;
  onSelect: (clientId: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-md border border-[#d9dee7] bg-white p-5 shadow-sm">
      <div className="border-b border-[#eef1f5] pb-4">
        <p className="text-xs font-semibold text-[#697386]">문서 입력</p>
        <h4 className="mt-1 text-lg font-semibold text-[#16181d]">
          작성 화면
        </h4>
      </div>

      <div className="mt-5 grid gap-3">
        {fields.map((field) => (
          <TemplateDesignerPreviewField
            key={field.clientId}
            field={field}
            selected={field.clientId === selectedFieldId}
            onSelect={() => onSelect(field.clientId)}
          />
        ))}
      </div>
    </div>
  );
}

function TemplateDesignerPdfPreview({
  template,
  schema,
  schemaValid,
}: {
  template: AdminTemplate;
  schema: DocumentTemplateSchemaV1;
  schemaValid: boolean;
}) {
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{
    error: string | null;
    pageCount: number;
    status: "idle" | "loading" | "ready";
  }>({
    error: null,
    pageCount: 0,
    status: "idle",
  });
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);

  function setPageCanvasRef(
    pageNumber: number,
    canvas: HTMLCanvasElement | null,
  ) {
    if (canvas) {
      canvasRefs.current.set(pageNumber, canvas);
      return;
    }

    canvasRefs.current.delete(pageNumber);
  }

  useEffect(() => {
    if (!schemaValid) {
      canvasRefs.current.clear();
      setPdfDocument(null);
      setPreview({
        error: "schema를 먼저 올바르게 수정하세요.",
        pageCount: 0,
        status: "idle",
      });
      return;
    }

    let active = true;
    const controller = new AbortController();
    let loadingTask: {
      destroy(): Promise<void>;
      promise: Promise<PdfDocument>;
    } | null = null;
    let loadedDocument: PdfDocument | null = null;
    const timeoutId = window.setTimeout(async () => {
      canvasRefs.current.clear();
      setPdfDocument(null);
      setPreview({
        error: null,
        pageCount: 0,
        status: "loading",
      });

      try {
        const response = await fetch("/api/admin/template-pdf-preview", {
          body: JSON.stringify({
            schema,
            templateName: template.name,
          }),
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await readPdfPreviewErrorMessage(response);

          throw new Error(message || "PDF 미리보기를 생성하지 못했습니다.");
        }

        const data = new Uint8Array(await response.arrayBuffer());
        const pdfjs = await loadPdfJs();

        loadingTask = pdfjs.getDocument({ data }) as {
          destroy(): Promise<void>;
          promise: Promise<PdfDocument>;
        };
        loadedDocument = await loadingTask.promise;

        if (!active) {
          return;
        }

        setPdfDocument(loadedDocument);
        setPreview({
          error: null,
          pageCount: loadedDocument.numPages,
          status: "ready",
        });
      } catch (error) {
        if (!active || controller.signal.aborted) {
          return;
        }

        setPreview((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "PDF 미리보기를 생성하지 못했습니다.",
          status: "idle",
        }));
      }
    }, 450);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
      if (loadedDocument) {
        void loadedDocument.destroy();
      } else {
        void loadingTask?.destroy();
      }
    };
  }, [schema, schemaValid, template.name]);

  useEffect(() => {
    const container = pdfContainerRef.current;

    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      setRenderVersion((current) => current + 1);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const container = pdfContainerRef.current;

    if (!pdfDocument || !container) {
      return;
    }

    const currentPdfDocument = pdfDocument;
    const currentContainer = container;
    let active = true;
    const renderTasks: PdfRenderTask[] = [];

    async function renderPages() {
      try {
        for (
          let pageNumber = 1;
          pageNumber <= currentPdfDocument.numPages;
          pageNumber += 1
        ) {
          const currentCanvas = canvasRefs.current.get(pageNumber);

          if (!currentCanvas) {
            continue;
          }

          const page = await currentPdfDocument.getPage(pageNumber);

          if (!active) {
            return;
          }

          const context = currentCanvas.getContext("2d");

          if (!context) {
            throw new Error("PDF 캔버스를 초기화하지 못했습니다.");
          }

          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(
            320,
            currentContainer.clientWidth - 32,
          );
          const scale = Math.min(
            1.8,
            Math.max(0.35, availableWidth / baseViewport.width),
          );
          const viewport = page.getViewport({ scale });
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);

          currentCanvas.width = Math.round(viewport.width * outputScale);
          currentCanvas.height = Math.round(viewport.height * outputScale);
          currentCanvas.style.width = `${Math.round(viewport.width)}px`;
          currentCanvas.style.height = `${Math.round(viewport.height)}px`;
          context.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

          const renderTask = page.render({
            canvasContext: context,
            transform:
              outputScale === 1
                ? undefined
                : [outputScale, 0, 0, outputScale, 0, 0],
            viewport,
          });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }
      } catch (error) {
        if (
          !active ||
          (error instanceof Error && error.name === "RenderingCancelledException")
        ) {
          return;
        }

        setPreview((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "PDF 미리보기를 렌더링하지 못했습니다.",
          status: "idle",
        }));
      }
    }

    void renderPages();

    return () => {
      active = false;
      renderTasks.forEach((renderTask) => renderTask.cancel());
    };
  }, [pdfDocument, renderVersion]);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#697386]">실제 PDF</span>
        <span className="rounded-full bg-[#eef1f5] px-2.5 py-1 text-xs font-semibold text-[#697386]">
          {preview.status === "loading"
            ? "생성 중"
            : preview.status === "ready"
              ? `생성 완료 · ${preview.pageCount}p`
              : "대기"}
        </span>
      </div>

      {preview.error ? (
        <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {preview.error}
        </p>
      ) : null}

      <div
        ref={pdfContainerRef}
        className="grid h-[43rem] place-items-start overflow-auto rounded-md border border-[#cfd6e3] bg-[#2f343b] p-4"
      >
        {pdfDocument ? (
          <div className="mx-auto grid w-full justify-items-center gap-4">
            {Array.from({ length: preview.pageCount }, (_, index) => {
              const pageNumber = index + 1;

              return (
                <div
                  key={pageNumber}
                  className="grid justify-items-center gap-2"
                >
                  <canvas
                    ref={(canvas) => setPageCanvasRef(pageNumber, canvas)}
                    role="img"
                    aria-label={`${template.name} 실제 PDF ${pageNumber}페이지 미리보기`}
                    className="bg-white shadow-lg"
                  />
                  <span className="rounded-full bg-[#1f252d] px-2.5 py-1 text-xs font-semibold text-[#c9d1d9]">
                    {pageNumber} / {preview.pageCount}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-[#c9d1d9]">
            PDF 생성 중
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateDesignerPreviewField({
  field,
  selected,
  onSelect,
}: {
  field: EditableTemplateField;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "rounded-md border p-3 text-left outline-none transition",
        selected
          ? "border-[#196b69] bg-[#f4fbfa] shadow-[0_0_0_2px_rgba(25,107,105,0.12)]"
          : "border-transparent hover:border-[#d9dee7] hover:bg-[#fbfcfd]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-semibold text-[#697386]">
          {field.label || "라벨 없음"}
          {field.required ? <span className="text-[#c62828]"> *</span> : null}
        </span>
        <span className="shrink-0 rounded-full bg-[#eef1f5] px-2 py-0.5 text-[0.68rem] font-semibold text-[#697386]">
          {fieldTypeLabels[field.type]}
        </span>
      </div>
      <div className="mt-2">{renderTemplateDesignerPreviewControl(field)}</div>
      {field.helpText ? (
        <p className="mt-2 text-xs leading-5 text-[#697386]">
          {field.helpText}
        </p>
      ) : null}
    </div>
  );
}

function TemplateDesignerPropertyPanel({
  field,
  pending,
  onUpdate,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: {
  field: EditableTemplateField | null;
  pending: boolean;
  onUpdate: (
    clientId: string,
    patch: Partial<Omit<EditableTemplateField, "clientId">>,
  ) => void;
  onAddOption: (clientId: string) => void;
  onUpdateOption: (
    clientId: string,
    optionIndex: number,
    patch: Partial<DocumentTemplateFieldOption>,
  ) => void;
  onRemoveOption: (clientId: string, optionIndex: number) => void;
}) {
  if (!field) {
    return (
      <aside className="rounded-md border border-[#d9dee7] bg-white p-4">
        <h3 className="text-sm font-semibold text-[#16181d]">속성</h3>
      </aside>
    );
  }

  return (
    <aside className="min-w-0 rounded-md border border-[#d9dee7] bg-white">
      <div className="border-b border-[#eef1f5] px-4 py-3">
        <h3 className="truncate text-sm font-semibold text-[#16181d]">
          {field.label || "라벨 없음"}
        </h3>
        <p className="mt-1 text-xs text-[#697386]">속성</p>
      </div>

      <div className="grid gap-3 p-4">
        <TemplateSchemaTextInput
          label="필드 이름"
          value={field.name}
          disabled={pending}
          onChange={(name) => onUpdate(field.clientId, { name })}
        />
        <TemplateSchemaTextInput
          label="라벨"
          value={field.label}
          disabled={pending}
          onChange={(label) => onUpdate(field.clientId, { label })}
        />
        <label className="block min-w-0">
          <span className="text-xs font-semibold text-[#697386]">타입</span>
          <select
            value={field.type}
            disabled={pending}
            onChange={(event) =>
              onUpdate(field.clientId, {
                type: event.currentTarget.value as DocumentTemplateFieldType,
              })
            }
            className="mt-2 h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fieldTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-2 rounded-md border border-[#d9dee7] bg-[#fbfcfd] px-3 py-2">
          <input
            type="checkbox"
            checked={field.required}
            disabled={pending}
            onChange={(event) =>
              onUpdate(field.clientId, {
                required: event.currentTarget.checked,
              })
            }
            className="size-4 rounded border-[#cfd6e3] accent-[#196b69]"
          />
          <span className="text-sm font-semibold text-[#394150]">필수</span>
        </label>
        <TemplateSchemaTextInput
          label="placeholder"
          value={field.placeholder}
          disabled={pending}
          onChange={(placeholder) =>
            onUpdate(field.clientId, { placeholder })
          }
        />
        <TemplateSchemaTextInput
          label="도움말"
          value={field.helpText}
          disabled={pending}
          onChange={(helpText) => onUpdate(field.clientId, { helpText })}
        />

        {field.type === "select" ? (
          <div className="rounded-md border border-[#d9dee7] bg-[#fbfcfd] p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-[#394150]">
                선택 옵션
              </h4>
              <button
                type="button"
                disabled={pending}
                onClick={() => onAddOption(field.clientId)}
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.neutral,
                  "h-8 px-3 text-xs",
                )}
              >
                추가
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {field.options.map((option, optionIndex) => (
                <div
                  key={`${field.clientId}-option-${optionIndex}`}
                  className="rounded-md border border-[#e3e7ee] bg-white p-2"
                >
                  <TemplateSchemaTextInput
                    label="옵션 라벨"
                    value={option.label}
                    disabled={pending}
                    onChange={(label) =>
                      onUpdateOption(field.clientId, optionIndex, { label })
                    }
                  />
                  <TemplateSchemaTextInput
                    label="옵션 값"
                    value={option.value}
                    disabled={pending}
                    onChange={(value) =>
                      onUpdateOption(field.clientId, optionIndex, { value })
                    }
                    className="mt-2"
                  />
                  <button
                    type="button"
                    disabled={pending || field.options.length <= 1}
                    onClick={() => onRemoveOption(field.clientId, optionIndex)}
                    className={buttonClass(
                      buttonStyles.base,
                      buttonStyles.dangerOutline,
                      "mt-2 h-8 w-full px-3 text-xs",
                    )}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function renderTemplateDesignerPreviewControl(field: EditableTemplateField) {
  const inputClass =
    "h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm text-[#394150] outline-none placeholder:text-[#9aa4b2]";
  const placeholder = field.placeholder || getDesignerPreviewPlaceholder(field);

  if (field.type === "textarea") {
    return (
      <textarea
        readOnly
        tabIndex={-1}
        rows={4}
        placeholder={placeholder}
        className="w-full min-w-0 resize-none rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm leading-6 text-[#394150] outline-none placeholder:text-[#9aa4b2]"
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        disabled
        defaultValue=""
        className={`${inputClass} disabled:opacity-100`}
      >
        <option value="">{placeholder}</option>
        {field.options.map((option, index) => (
          <option key={`${option.value}-${index}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm text-[#394150]">
        <input
          type="checkbox"
          disabled
          tabIndex={-1}
          className="size-4 rounded border-[#cfd6e3] accent-[#196b69]"
        />
        <span className="min-w-0 truncate">{placeholder}</span>
      </label>
    );
  }

  if (field.type === "attachments") {
    return (
      <div className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-3 py-4 text-sm text-[#697386]">
        파일 선택
      </div>
    );
  }

  return (
    <input
      readOnly
      tabIndex={-1}
      type={field.type}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

function TemplateSchemaTextInput({
  label,
  value,
  disabled,
  onChange,
  className,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className ?? ""}`}>
      <span className="text-xs font-semibold text-[#697386]">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="mt-2 h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
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

function getDesignerPreviewPlaceholder(field: EditableTemplateField) {
  if (field.type === "date") {
    return "YYYY-MM-DD";
  }

  if (field.type === "number") {
    return "0";
  }

  if (field.type === "select") {
    return "선택";
  }

  if (field.type === "checkbox") {
    return "체크 항목";
  }

  return "내용 입력";
}

async function readPdfPreviewErrorMessage(response: Response) {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text) as {
      error?: unknown;
      message?: unknown;
    };
    const message = parsed.message ?? parsed.error;

    if (typeof message === "string") {
      return message;
    }
  } catch {
    return text;
  }

  return text;
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  return pdfjs;
}

function getEditableTemplateFields(schema: unknown): EditableTemplateField[] {
  const safeSchema = getSafeDocumentTemplateSchema(schema).schema;

  return safeSchema.fields.map((field, index) =>
    toEditableTemplateField(field, index),
  );
}

function toEditableTemplateField(
  field: DocumentTemplateField,
  index: number,
): EditableTemplateField {
  return {
    clientId: `${field.name}-${index}`,
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder ?? "",
    helpText: field.helpText ?? "",
    options: field.options ?? [],
  };
}

function getSchemaFromEditableFields(
  fields: EditableTemplateField[],
): DocumentTemplateSchemaV1 {
  return {
    version: 1,
    fields: fields.map((field) => ({
      name: field.name.trim(),
      label: field.label.trim(),
      type: field.type,
      required: field.required,
      ...(field.placeholder.trim()
        ? { placeholder: field.placeholder.trim() }
        : {}),
      ...(field.helpText.trim() ? { helpText: field.helpText.trim() } : {}),
      ...(field.type === "select"
        ? {
            options: field.options.map((option) => ({
              label: option.label.trim(),
              value: option.value.trim(),
            })),
          }
        : {}),
    })),
  };
}

function createEditableField(
  fields: readonly EditableTemplateField[],
  type: DocumentTemplateFieldType = "text",
): EditableTemplateField {
  const nextNumber = getNextFieldNumber(fields);

  return {
    clientId: `new-field-${Date.now()}-${nextNumber}`,
    name: `field${nextNumber}`,
    label: `${fieldTypeLabels[type]} ${nextNumber}`,
    type,
    required: false,
    placeholder: "",
    helpText: "",
    options: type === "select" ? [createEditableOption(1)] : [],
  };
}

function createEditableOption(index: number): DocumentTemplateFieldOption {
  return {
    label: `옵션 ${index}`,
    value: `option${index}`,
  };
}

function getNextFieldNumber(fields: readonly EditableTemplateField[]) {
  const existingNames = new Set(
    fields.map((field) => field.name.toLocaleLowerCase("en-US")),
  );
  let nextNumber = fields.length + 1;

  while (existingNames.has(`field${nextNumber}`)) {
    nextNumber += 1;
  }

  return nextNumber;
}
