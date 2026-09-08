"use client";

import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { ChatRequestError, readChatResponse } from "@/hooks/use-staff-chat-data";

type Props = { url: string; fileName: string; onFailure: (cause: unknown) => void };
type PdfJs = typeof import("pdfjs-dist");
type LoadedPdf = { document: PDFDocumentProxy; library: PdfJs };
type RenderedPage = { page: number; width: number; text: string; error: string };
const actionClass = "min-h-11 min-w-11 shrink-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50";

export function StaffChatPdfPreview(props: Props) {
  const [attempt, setAttempt] = useState(0);
  // A new URL or retry owns fresh document/render tasks, so a late response from
  // an earlier file cannot replace the active preview.
  return <PdfPreviewDocument key={`${props.url}:${attempt}`} {...props} onRetry={() => setAttempt((value) => value + 1)} />;
}

function PdfPreviewDocument({ url, fileName, onFailure, onRetry }: Props & { onRetry: () => void }) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "cancelled">("loading");
  const [loadError, setLoadError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<() => void>(() => {});
  const failureRef = useRef(onFailure);

  useEffect(() => { failureRef.current = onFailure; }, [onFailure]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | null = null;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false;
      const cause = new DOMException("PDF request timed out", "TimeoutError");
      controller.abort(cause);
      void loadingTask?.destroy().catch(() => {});
      setLoadError("PDF를 불러오는 데 시간이 오래 걸립니다. 다시 시도해 주세요.");
      setLoadState("error");
      failureRef.current(cause);
    }, 30_000);
    const stop = () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      void loadingTask?.destroy().catch(() => {});
    };
    cancelRef.current = () => { stop(); setPdf(null); setRendered(null); setLoadState("cancelled"); };

    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) await readChatResponse(response);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!active) return;
        const library = await loadPdfJs();
        if (!active) return;
        // PDF.js 6 removed the old isEvalSupported option. This viewer only
        // paints pages and extracts text: no scripting, XFA or annotation layer.
        const supportUrl = getPdfSupportUrl(library.version);
        loadingTask = library.getDocument({
          data: bytes, enableXfa: false,
          cMapUrl: `${supportUrl}cmaps/`, cMapPacked: true,
          standardFontDataUrl: `${supportUrl}standard_fonts/`,
          wasmUrl: `${supportUrl}wasm/`,
        });
        const document = await loadingTask.promise;
        if (!active) return;
        setPdf({ document, library });
        setLoadState("ready");
      } catch (cause) {
        if (!active) return;
        setLoadError(previewError(cause));
        setLoadState("error");
        failureRef.current(cause);
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return stop;
  }, [url]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, Math.floor(entry.contentRect.width)));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    const viewportElement = viewportRef.current;
    if (!pdf || !host || !viewportElement || !width) return;
    let active = true;
    let renderTask: RenderTask | null = null;
    const canvas = document.createElement("canvas");
    // Each render has a separate canvas. Cancelling a slow prior page cannot
    // clear or paint the current page's surface after navigation or resizing.
    host.replaceChildren(canvas);
    viewportElement.scrollTop = 0;
    void (async () => {
      try {
        const page = await pdf.document.getPage(pageNumber);
        if (!active) return;
        const base = page.getViewport({ scale: 1 });
        if (![base.width, base.height].every((value) => Number.isFinite(value) && value > 0)) {
          throw new Error("Invalid PDF page dimensions");
        }
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        // Fit to the available width while bounding canvas allocation for very
        // long pages or unexpectedly large dimensions in an uploaded document.
        const scale = Math.min(width / base.width, 8192 / (base.height * pixelRatio),
          Math.sqrt(16_000_000 / (base.width * base.height)) / pixelRatio);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = "auto";
        canvas.style.maxWidth = "100%";
        canvas.style.display = "block";
        canvas.style.marginInline = "auto";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${fileName} ${pageNumber} / ${pdf.document.numPages}쪽`);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PDF canvas unavailable");
        renderTask = page.render({
          canvas, canvasContext: context, viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          annotationMode: pdf.library.AnnotationMode.DISABLE,
          background: "rgb(255, 255, 255)",
        });
        await renderTask.promise;
        if (!active) return;
        const content = await page.getTextContent().catch(() => null);
        if (!active) return;
        const text = content?.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim() ?? "";
        setRendered({ page: pageNumber, width, text, error: "" });
      } catch (cause) {
        if (!active) return;
        setRendered({ page: pageNumber, width, text: "", error: previewError(cause) });
        failureRef.current(cause);
      }
    })();
    return () => {
      active = false;
      renderTask?.cancel();
      canvas.remove();
    };
  }, [pdf, pageNumber, width, fileName]);

  const current = rendered?.page === pageNumber && rendered.width === width ? rendered : null;
  const error = loadError || current?.error || "";
  const loading = loadState === "loading" || (loadState === "ready" && !current);
  const ready = loadState === "ready" && !!current && !error;

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
    else if (loadState === "cancelled") retryRef.current?.focus({ preventScroll: true });
  }, [error, loadState]);

  return (
    <section aria-label={`${fileName} PDF 미리보기`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {pdf ? <div className="flex shrink-0 items-center justify-center gap-3 border-b border-[var(--border)] px-2 py-1">
        <button type="button" aria-label="이전 페이지" disabled={pageNumber <= 1 || loading} className={actionClass} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>이전</button>
        <p aria-live="polite" className="text-sm tabular-nums text-[var(--text-muted)]">{pageNumber} / {pdf.document.numPages}쪽</p>
        <button type="button" aria-label="다음 페이지" disabled={pageNumber >= pdf.document.numPages || loading} className={actionClass} onClick={() => setPageNumber((value) => Math.min(pdf.document.numPages, value + 1))}>다음</button>
      </div> : null}
      {loading ? <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p role="status" className="text-sm text-[var(--text-muted)]">{loadState === "loading" ? "PDF 불러오는 중…" : "페이지 표시 중…"}</p>
        <button type="button" className={actionClass} onClick={() => cancelRef.current()}>불러오기 취소</button>
      </div> : null}
      {error || loadState === "cancelled" ? <div className="shrink-0 space-y-2 px-3 py-3">
        <p ref={errorRef} role={error ? "alert" : "status"} tabIndex={error ? -1 : undefined} className={`text-sm ${error ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>{error || "미리보기 불러오기를 취소했습니다."}</p>
        <button ref={retryRef} type="button" className={actionClass} onClick={onRetry}>다시 시도</button>
      </div> : null}
      <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-[var(--surface-muted)] p-2 [scrollbar-gutter:stable]" aria-busy={loading}>
        <div ref={canvasHostRef} className={ready ? "max-w-full" : "invisible h-0 overflow-hidden"} />
        {ready ? <details key={pageNumber} className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">페이지 텍스트</summary>
          <p className="pb-3 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{current.text || "이 페이지에서 추출할 텍스트가 없습니다."}</p>
        </details> : null}
      </div>
    </section>
  );
}

async function loadPdfJs() {
  const library = await import("pdfjs-dist");
  library.GlobalWorkerOptions.workerSrc = `${getPdfSupportUrl(library.version)}pdf.worker.min.mjs`;
  return library;
}

function getPdfSupportUrl(version: string) {
  return new URL(`/pdfjs/${version}/`, window.location.href).toString();
}

function previewError(cause: unknown): string {
  if (cause instanceof ChatRequestError) return cause.message;
  if (cause instanceof Error && cause.name === "PasswordException") return "암호로 보호된 PDF는 미리 볼 수 없습니다.";
  return "PDF를 표시하지 못했습니다. 다시 시도해 주세요.";
}
