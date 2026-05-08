"use client";

import { useEffect } from "react";

export function NotificationDocumentReadMarker({
  documentId,
}: {
  documentId: string;
}) {
  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/notifications/read-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentId }),
      signal: controller.signal,
    })
      .then(() => {
        window.dispatchEvent(new Event("gyeoljaeon:notifications-changed"));
      })
      .catch(() => {});

    return () => controller.abort();
  }, [documentId]);

  return null;
}
