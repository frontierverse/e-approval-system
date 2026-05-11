export type AttachmentFileKind =
  | "archive"
  | "document"
  | "file"
  | "image"
  | "pdf"
  | "sheet"
  | "slide"
  | "text";

export type AttachmentFileDisplay = {
  extension: string;
  extensionLabel: string;
  kind: AttachmentFileKind;
  kindLabel: string;
};

export type AttachmentSelectionFile = {
  lastModified?: number;
  name: string;
  size: number;
};

export function getAttachmentFileDisplay(fileName: string): AttachmentFileDisplay {
  const extension = getFileExtension(fileName);
  const kind = getAttachmentFileKind(extension);

  return {
    extension,
    extensionLabel: extension ? extension.slice(1).toUpperCase() : "FILE",
    kind,
    kindLabel: getAttachmentFileKindLabel(kind),
  };
}

export function mergeAttachmentSelections<T extends AttachmentSelectionFile>(
  currentFiles: readonly T[],
  addedFiles: readonly T[],
) {
  const nextFiles = new Map<string, T>();

  for (const file of currentFiles) {
    nextFiles.set(getAttachmentSelectionKey(file), file);
  }

  for (const file of addedFiles) {
    nextFiles.set(getAttachmentSelectionKey(file), file);
  }

  return Array.from(nextFiles.values());
}

export function getAttachmentSelectionKey(file: AttachmentSelectionFile) {
  return `${file.name}-${file.size}-${file.lastModified ?? 0}`;
}

export function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");

  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

export function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getAttachmentFileKind(extension: string): AttachmentFileKind {
  if (extension === ".pdf") {
    return "pdf";
  }

  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(extension)) {
    return "image";
  }

  if ([".doc", ".docx", ".hwp", ".hwpx"].includes(extension)) {
    return "document";
  }

  if ([".xls", ".xlsx", ".csv"].includes(extension)) {
    return "sheet";
  }

  if ([".ppt", ".pptx"].includes(extension)) {
    return "slide";
  }

  if ([".txt", ".md", ".rtf"].includes(extension)) {
    return "text";
  }

  if ([".zip", ".rar", ".7z"].includes(extension)) {
    return "archive";
  }

  return "file";
}

function getAttachmentFileKindLabel(kind: AttachmentFileKind) {
  const labels: Record<AttachmentFileKind, string> = {
    archive: "압축 파일",
    document: "문서 파일",
    file: "일반 파일",
    image: "이미지 파일",
    pdf: "PDF 문서",
    sheet: "스프레드시트",
    slide: "프레젠테이션",
    text: "텍스트 파일",
  };

  return labels[kind];
}
