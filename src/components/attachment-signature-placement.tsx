"use client";

import Image from "next/image";
import * as pdfjsLib from "pdfjs-dist";
import {
  type PointerEvent as ReactPointerEvent,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CreateSignedAttachmentState } from "@/app/attachments/[id]/sign/actions";
import type { AttachmentPreviewKind } from "@/lib/attachment-preview";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { SignaturePlacement } from "@/lib/attachment-signature-core";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

type AttachmentSignaturePlacementProps = {
  action: (
    state: CreateSignedAttachmentState,
    formData: FormData,
  ) => Promise<CreateSignedAttachmentState>;
  fileName: string;
  previewHref: string;
  previewKind: AttachmentPreviewKind;
  signatureHref: string;
};

type StampPlacement = SignaturePlacement & {
  id: string;
};

type SurfaceDisplay = {
  height: number;
  left: number;
  naturalHeight: number;
  naturalWidth: number;
  top: number;
  width: number;
};

type PdfDocument = {
  destroy(): Promise<void> | void;
  getPage(pageNumber: number): Promise<PdfPage>;
  numPages: number;
};

type PdfPage = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
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

type DragHandle = {
  cleanup(): void;
};

const defaultStampSize = 120;
const minStampSize = 48;
const maxStampSize = 240;

export function AttachmentSignaturePlacement({
  action,
  fileName,
  previewHref,
  previewKind,
  signatureHref,
}: AttachmentSignaturePlacementProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [stamps, setStamps] = useState<StampPlacement[]>(() => [
    createStamp({ page: 1, size: defaultStampSize, x: 72, y: 72 }),
  ]);
  const [selectedStampId, setSelectedStampId] = useState(stamps[0]?.id ?? "");
  const [currentPage, setCurrentPage] = useState(1);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const pdfSurfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragHandleRef = useRef<DragHandle | null>(null);
  const [imageDisplay, setImageDisplay] = useState<SurfaceDisplay | null>(null);
  const [pdfDisplay, setPdfDisplay] = useState<SurfaceDisplay | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [pdfRenderVersion, setPdfRenderVersion] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const previewTitle = `${fileName} 도장 위치`;
  const currentDisplay =
    previewKind === "pdf" ? pdfDisplay : imageDisplay;
  const currentSurfaceRef =
    previewKind === "pdf" ? pdfSurfaceRef : imageContainerRef;
  const selectedStamp =
    stamps.find((stamp) => stamp.id === selectedStampId) ?? stamps[0];
  const visibleStamps = stamps.filter(
    (stamp) => previewKind !== "pdf" || stamp.page === currentPage,
  );
  const placementsValue = useMemo(
    () =>
      JSON.stringify(
        stamps.map(({ page, size, x, y }) => ({ page, size, x, y })),
      ),
    [stamps],
  );

  useEffect(() => {
    if (previewKind !== "image") {
      return;
    }

    function syncImageDisplay() {
      setImageDisplay(
        readImageDisplay(imageContainerRef.current, imageRef.current),
      );
    }

    syncImageDisplay();
    window.addEventListener("resize", syncImageDisplay);

    return () => {
      window.removeEventListener("resize", syncImageDisplay);
    };
  }, [previewKind]);

  useEffect(() => {
    if (previewKind !== "pdf") {
      return;
    }

    let cancelled = false;
    let loadedDocument: PdfDocument | null = null;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    const abortController = new AbortController();

    fetch(previewHref, {
      credentials: "same-origin",
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("PDF preview request failed");
        }

        return response.arrayBuffer();
      })
      .then((data) => {
        loadingTask = pdfjsLib.getDocument({ data });

        return loadingTask.promise;
      })
      .then((document) => {
        loadedDocument = document as PdfDocument;

        if (cancelled) {
          void loadedDocument.destroy();
          return;
        }

        setPdfDocument(loadedDocument);
        setPdfPageCount(loadedDocument.numPages);
        setPdfError(null);
        setCurrentPage((page) => clamp(page, 1, loadedDocument!.numPages));
      })
      .catch(() => {
        if (!cancelled) {
          setPdfError("PDF 미리보기를 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      void loadingTask?.destroy();
      void loadedDocument?.destroy();
    };
  }, [previewHref, previewKind]);

  useEffect(() => {
    if (previewKind !== "pdf") {
      return;
    }

    function rerenderPdfPage() {
      setPdfRenderVersion((version) => version + 1);
    }

    window.addEventListener("resize", rerenderPdfPage);

    return () => {
      window.removeEventListener("resize", rerenderPdfPage);
    };
  }, [previewKind]);

  useEffect(() => {
    if (previewKind !== "pdf" || !pdfDocument) {
      return;
    }

    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      const container = pdfContainerRef.current;

      if (!canvas || !container || !pdfDocument) {
        return;
      }

      const page = await pdfDocument.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, container.clientWidth - 32);
      const availableHeight = Math.max(240, container.clientHeight - 32);
      const fitScale = Math.min(
        availableWidth / baseViewport.width,
        availableHeight / baseViewport.height,
      );
      const scale = Math.min(1.7, Math.max(0.25, fitScale));
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.clearRect(0, 0, canvas.width, canvas.height);

      renderTask = page.render({
        canvasContext: context,
        viewport,
      });

      await renderTask.promise;

      if (!cancelled) {
        setPdfDisplay({
          height: viewport.height,
          left: 0,
          naturalHeight: baseViewport.height,
          naturalWidth: baseViewport.width,
          top: 0,
          width: viewport.width,
        });
      }
    }

    renderPage().catch((error: unknown) => {
      if (!cancelled && !isPdfRenderCancel(error)) {
        setPdfError("PDF 페이지를 렌더링하지 못했습니다.");
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [currentPage, pdfDocument, pdfRenderVersion, previewKind]);

  useEffect(() => {
    return () => {
      dragHandleRef.current?.cleanup();
    };
  }, []);

  function addStamp() {
    const display = currentDisplay;
    const page = previewKind === "pdf" ? currentPage : 1;
    const x = display
      ? Math.round(display.naturalWidth / 2 - defaultStampSize / 2)
      : 72;
    const y = display
      ? Math.round(display.naturalHeight / 2 - defaultStampSize / 2)
      : 72;
    const stamp = createStamp({
      page,
      size: defaultStampSize,
      x: Math.max(0, x),
      y: Math.max(0, y),
    });

    setStamps((current) => [...current, stamp]);
    setSelectedStampId(stamp.id);
  }

  function deleteSelectedStamp() {
    if (!selectedStamp) {
      return;
    }

    setStamps((current) => {
      const nextStamps = current.filter((stamp) => stamp.id !== selectedStamp.id);
      setSelectedStampId(nextStamps.at(-1)?.id ?? "");

      return nextStamps;
    });
  }

  function updateSelectedStampSize(size: number) {
    if (!selectedStamp) {
      return;
    }

    updateStamp(selectedStamp.id, {
      size: clamp(size, minStampSize, maxStampSize),
    });
  }

  function updateStamp(stampId: string, updates: Partial<StampPlacement>) {
    setStamps((current) =>
      current.map((stamp) =>
        stamp.id === stampId ? { ...stamp, ...updates } : stamp,
      ),
    );
  }

  function placeSelectedStamp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!currentDisplay) {
      return;
    }

    const stamp = selectedStamp ?? createStamp({
      page: previewKind === "pdf" ? currentPage : 1,
      size: defaultStampSize,
      x: 0,
      y: 0,
    });

    if (!selectedStamp) {
      setStamps((current) => [...current, stamp]);
      setSelectedStampId(stamp.id);
    }

    const point = getSurfacePoint(
      event.clientX,
      event.clientY,
      currentDisplay,
      currentSurfaceRef.current,
    );
    const nextPosition = clampStampPosition(
      {
        x: Math.round(point.x - stamp.size / 2),
        y: Math.round(point.y - stamp.size / 2),
      },
      stamp.size,
      currentDisplay,
    );

    updateStamp(stamp.id, {
      page: previewKind === "pdf" ? currentPage : 1,
      ...nextPosition,
    });
  }

  function startDragStamp(
    stamp: StampPlacement,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
    setSelectedStampId(stamp.id);
    dragHandleRef.current?.cleanup();

    const stampRect = event.currentTarget.getBoundingClientRect();
    const offset = {
      x: event.clientX - stampRect.left,
      y: event.clientY - stampRect.top,
    };

    function handleMove(moveEvent: PointerEvent) {
      const display = currentDisplay;

      if (!display) {
        return;
      }

      const point = getSurfacePoint(
        moveEvent.clientX - offset.x,
        moveEvent.clientY - offset.y,
        display,
        currentSurfaceRef.current,
      );
      const position = clampStampPosition(
        {
          x: Math.round(point.x),
          y: Math.round(point.y),
        },
        stamp.size,
        display,
      );

      updateStamp(stamp.id, position);
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      dragHandleRef.current = null;
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    dragHandleRef.current = {
      cleanup: handleUp,
    };
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <article className="min-w-0 overflow-hidden rounded-md border border-[#d9dee7] bg-white">
        <header className="border-b border-[#eef1f5] px-5 py-4">
          <h2 className="text-base font-semibold">첨부파일 미리보기</h2>
          <p className="mt-1 truncate text-sm text-[#697386]">{fileName}</p>
        </header>
        <div
          ref={previewKind === "pdf" ? pdfContainerRef : undefined}
          className="h-[min(70vh,44rem)] overflow-auto bg-[#f4f6fa]"
        >
          {previewKind === "pdf" ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                ref={pdfSurfaceRef}
                className="relative bg-white shadow-sm"
                onPointerDown={placeSelectedStamp}
                style={{
                  height: pdfDisplay?.height ?? undefined,
                  width: pdfDisplay?.width ?? undefined,
                }}
              >
                <canvas
                  ref={canvasRef}
                  aria-label={previewTitle}
                  className="block"
                />
                {pdfError ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white px-4 text-center text-sm font-medium text-[#8a1f1f]">
                    {pdfError}
                  </div>
                ) : null}
                {pdfDisplay
                  ? visibleStamps.map((stamp) => (
                      <StampOverlay
                        key={stamp.id}
                        display={pdfDisplay}
                        isSelected={stamp.id === selectedStampId}
                        signatureHref={signatureHref}
                        stamp={stamp}
                        onPointerDown={startDragStamp}
                      />
                    ))
                  : null}
              </div>
            </div>
          ) : (
            <div
              ref={imageContainerRef}
              className="relative flex h-full items-center justify-center p-4"
              onPointerDown={placeSelectedStamp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                alt={previewTitle}
                className="max-h-full max-w-full object-contain"
                src={previewHref}
                onLoad={() =>
                  setImageDisplay(
                    readImageDisplay(
                      imageContainerRef.current,
                      imageRef.current,
                    ),
                  )
                }
              />
              {imageDisplay
                ? visibleStamps.map((stamp) => (
                    <StampOverlay
                      key={stamp.id}
                      display={imageDisplay}
                      isSelected={stamp.id === selectedStampId}
                      signatureHref={signatureHref}
                      stamp={stamp}
                      onPointerDown={startDragStamp}
                    />
                  ))
                : null}
            </div>
          )}
        </div>
      </article>

      <aside className="rounded-md border border-[#d9dee7] bg-white p-5">
        <h2 className="text-base font-semibold">도장</h2>
        <form action={formAction} className="mt-5 space-y-4">
          <input name="placements" type="hidden" value={placementsValue} />

          {previewKind === "pdf" ? (
            <div>
              <p className="text-sm font-semibold text-[#394150]">페이지</p>
              <div className="mt-2 grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-10 px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  이전
                </button>
                <div className="h-10 rounded-md border border-[#cfd6e3] px-3 text-center text-sm font-semibold leading-10 text-[#394150]">
                  {currentPage} / {pdfPageCount}
                </div>
                <button
                  type="button"
                  disabled={currentPage >= pdfPageCount}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(pdfPageCount, page + 1))
                  }
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-10 px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  다음
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={addStamp}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.save,
                "h-10 px-3 text-sm",
              )}
            >
              도장 추가
            </button>
            <button
              type="button"
              disabled={!selectedStamp}
              onClick={deleteSelectedStamp}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.danger,
                "h-10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              선택 삭제
            </button>
          </div>

          <label className="block text-sm font-semibold text-[#394150]">
            크기
            <input
              min={minStampSize}
              max={maxStampSize}
              type="range"
              value={selectedStamp?.size ?? defaultStampSize}
              disabled={!selectedStamp}
              onChange={(event) =>
                updateSelectedStampSize(Number(event.target.value))
              }
              className="mt-3 w-full accent-[#196b69] disabled:opacity-50"
            />
            <span className="mt-1 block text-xs text-[#697386]">
              {selectedStamp?.size ?? defaultStampSize}px
            </span>
          </label>

          <div className="rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-2 text-sm font-medium text-[#394150]">
            전체 {stamps.length}개
          </div>

          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm font-medium text-[#8a1f1f]"
            >
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || stamps.length === 0}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.approve,
              "h-10 w-full px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {pending ? "생성 중" : "서명본 생성"}
          </button>
        </form>
      </aside>
    </section>
  );
}

function StampOverlay({
  display,
  isSelected,
  onPointerDown,
  signatureHref,
  stamp,
}: {
  display: SurfaceDisplay;
  isSelected: boolean;
  onPointerDown: (
    stamp: StampPlacement,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  signatureHref: string;
  stamp: StampPlacement;
}) {
  const style = {
    left: `${display.left + (stamp.x / display.naturalWidth) * display.width}px`,
    top: `${display.top + (stamp.y / display.naturalHeight) * display.height}px`,
    width: `${Math.max(
      24,
      (stamp.size / display.naturalWidth) * display.width,
    )}px`,
  };

  return (
    <button
      type="button"
      aria-label="도장"
      onPointerDown={(event) => onPointerDown(stamp, event)}
      className={`absolute touch-none cursor-grab border-2 bg-transparent p-0 active:cursor-grabbing ${
        isSelected ? "border-[#196b69]" : "border-transparent"
      }`}
      style={style}
    >
      <Image
        alt=""
        aria-hidden="true"
        className="pointer-events-none h-auto w-full object-contain opacity-90"
        draggable={false}
        height={stamp.size}
        src={signatureHref}
        unoptimized
        width={stamp.size}
      />
    </button>
  );
}

function readImageDisplay(
  container: HTMLDivElement | null,
  image: HTMLImageElement | null,
): SurfaceDisplay | null {
  if (!container || !image || !image.naturalWidth || !image.naturalHeight) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();

  return {
    height: imageRect.height,
    left: imageRect.left - containerRect.left,
    naturalHeight: image.naturalHeight,
    naturalWidth: image.naturalWidth,
    top: imageRect.top - containerRect.top,
    width: imageRect.width,
  };
}

function getSurfacePoint(
  clientX: number,
  clientY: number,
  display: SurfaceDisplay,
  surface: HTMLDivElement | null,
) {
  const rect = surface?.getBoundingClientRect();

  if (!rect) {
    return {
      x: 0,
      y: 0,
    };
  }

  return {
    x: ((clientX - rect.left - display.left) / display.width) *
      display.naturalWidth,
    y: ((clientY - rect.top - display.top) / display.height) *
      display.naturalHeight,
  };
}

function clampStampPosition(
  position: Pick<SignaturePlacement, "x" | "y">,
  size: number,
  display: SurfaceDisplay,
) {
  return {
    x: clamp(position.x, 0, Math.max(0, display.naturalWidth - size)),
    y: clamp(position.y, 0, Math.max(0, display.naturalHeight - size)),
  };
}

function createStamp({
  page,
  size,
  x,
  y,
}: SignaturePlacement): StampPlacement {
  return {
    id: crypto.randomUUID(),
    page,
    size,
    x,
    y,
  };
}

function isPdfRenderCancel(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
