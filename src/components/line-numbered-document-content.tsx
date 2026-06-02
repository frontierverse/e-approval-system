"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const documentContentLineNumberColumnClass =
  "relative w-12 shrink-0 overflow-hidden border-r border-[#e4e9f0] bg-[#f7f9fc] py-3 text-right font-mono text-xs leading-6 text-[#8b949e]";

export const documentContentTextColumnBaseClass =
  "min-w-0 flex-1 px-3 py-3 leading-6";

export const documentContentFrameClass =
  "mt-4 flex w-full max-w-[53.75rem] overflow-hidden rounded-md border border-[#d9dee7] bg-white text-sm";

export function LineNumberedDocumentContent({ content }: { content: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [lineNumbers, setLineNumbers] = useState(() =>
    getTextLineNumbers(content),
  );
  const syncLineNumbers = useCallback(() => {
    const nextLineNumbers = contentRef.current
      ? getRenderedLineNumbers(contentRef.current, content)
      : getTextLineNumbers(content);

    setLineNumbers((currentLineNumbers) =>
      currentLineNumbers.length === nextLineNumbers.length
        ? currentLineNumbers
        : nextLineNumbers,
    );
  }, [content]);

  useEffect(() => {
    syncLineNumbers();
  }, [syncLineNumbers]);

  useEffect(() => {
    const contentElement = contentRef.current;

    if (!contentElement || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(syncLineNumbers);
    resizeObserver.observe(contentElement);

    return () => resizeObserver.disconnect();
  }, [syncLineNumbers]);

  return (
    <div
      className={documentContentFrameClass}
      data-document-content-frame="true"
    >
      <div
        aria-hidden="true"
        className={documentContentLineNumberColumnClass}
      >
        {lineNumbers.map((lineNumber) => (
          <div key={lineNumber} className="h-6 px-2">
            {lineNumber}
          </div>
        ))}
      </div>
      <div
        ref={contentRef}
        aria-label="문서 본문 내용"
        className={`${documentContentTextColumnBaseClass} whitespace-pre-wrap break-words text-[#394150]`}
      >
        {content || " "}
      </div>
    </div>
  );
}

function getRenderedLineNumbers(element: HTMLElement, content: string) {
  const lineCount = getRenderedLineCount(element, content);

  return Array.from({ length: lineCount }, (_, index) => index + 1);
}

function getRenderedLineCount(element: HTMLElement, content: string) {
  if (typeof window === "undefined" || element.clientWidth === 0) {
    return getTextLineNumbers(content).length;
  }

  const computedStyle = window.getComputedStyle(element);
  const lineHeight = getComputedLineHeight(computedStyle);
  const paddingTop = getPixelValue(computedStyle.paddingTop);
  const paddingBottom = getPixelValue(computedStyle.paddingBottom);
  const measuringTextarea = document.createElement("textarea");

  measuringTextarea.value = content || " ";
  measuringTextarea.rows = 1;
  measuringTextarea.tabIndex = -1;
  measuringTextarea.setAttribute("aria-hidden", "true");

  Object.assign(measuringTextarea.style, {
    position: "absolute",
    top: "0",
    left: "-9999px",
    width: `${element.clientWidth}px`,
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

function getTextLineNumbers(content: string) {
  const lineCount = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(
    "\n",
  ).length;

  return Array.from({ length: Math.max(lineCount, 1) }, (_, index) => index + 1);
}
