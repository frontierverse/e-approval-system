"use client";

import { useEffect, useMemo } from "react";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { getAttachmentSelectionKey } from "@/lib/file-display";

export function useAttachmentThumbnailUrls(files: readonly File[]) {
  const thumbnailUrls = useMemo(
    () =>
      Object.fromEntries(
        files
          .filter(
            (file) => getAttachmentPreviewKind(file.name, file.type) === "image",
          )
          .map((file) => [
            getAttachmentSelectionKey(file),
            URL.createObjectURL(file),
          ] as const),
      ),
    [files],
  );

  useEffect(
    () => () => {
      for (const url of Object.values(thumbnailUrls)) {
        URL.revokeObjectURL(url);
      }
    },
    [thumbnailUrls],
  );

  return thumbnailUrls;
}
