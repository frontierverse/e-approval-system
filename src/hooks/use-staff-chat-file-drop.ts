"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

function hasFiles(transfer: DataTransfer | null) {
  return Boolean(transfer && (Array.from(transfer.types).includes("Files")
    || Array.from(transfer.items).some((item) => item.kind === "file")));
}

export function useStaffChatFileDrop({ open, canDrop, onFiles }: {
  open: boolean;
  canDrop: boolean;
  onFiles: (files: File[], hasDirectory: boolean) => void;
}) {
  const [draggingFile, setDraggingFile] = useState(false);
  const depthRef = useRef(0);
  const cancelledRef = useRef(false);
  const clearFileDrag = useCallback(() => {
    depthRef.current = 0;
    setDraggingFile(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const finish = () => { clearFileDrag(); cancelledRef.current = false; };
    const guardDragOver = (event: globalThis.DragEvent) => {
      if (!hasFiles(event.dataTransfer) || event.defaultPrevented) return;
      // Dropping beside the chat must not replace the work page with a file.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    const guardDrop = (event: globalThis.DragEvent) => {
      if (hasFiles(event.dataTransfer)) event.preventDefault();
      finish();
    };
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || depthRef.current === 0) return;
      event.preventDefault();
      event.stopPropagation();
      cancelledRef.current = true;
      clearFileDrag();
    };
    const leavePage = (event: globalThis.DragEvent) => {
      if (!event.relatedTarget) finish();
    };
    document.addEventListener("dragover", guardDragOver);
    document.addEventListener("drop", guardDrop);
    document.addEventListener("dragend", finish);
    document.addEventListener("dragleave", leavePage);
    window.addEventListener("blur", finish);
    window.addEventListener("keydown", cancel, true);
    return () => {
      document.removeEventListener("dragover", guardDragOver);
      document.removeEventListener("drop", guardDrop);
      document.removeEventListener("dragend", finish);
      document.removeEventListener("dragleave", leavePage);
      window.removeEventListener("blur", finish);
      window.removeEventListener("keydown", cancel, true);
    };
  }, [open, clearFileDrag]);

  function isFileEvent(event: DragEvent<HTMLElement>) {
    // File previews use portals; their drops belong to the preview, not chat.
    return open && hasFiles(event.dataTransfer) && event.currentTarget.contains(event.target as Node);
  }

  function onDragEnter(event: DragEvent<HTMLElement>) {
    if (!isFileEvent(event)) return;
    event.preventDefault();
    if (depthRef.current === 0) cancelledRef.current = false;
    depthRef.current += 1;
    setDraggingFile(true);
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!isFileEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canDrop && !cancelledRef.current ? "copy" : "none";
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!isFileEvent(event)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) clearFileDrag();
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!isFileEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const cancelled = cancelledRef.current;
    cancelledRef.current = false;
    clearFileDrag();
    if (cancelled) return;
    const items = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file");
    const files = Array.from(event.dataTransfer.files);
    const hasDirectory = items.some((item) => item.webkitGetAsEntry?.()?.isDirectory)
      || items.length > files.length;
    onFiles(files, hasDirectory);
  }

  return { draggingFile, clearFileDrag, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
