"use client";

import { useCallback, useEffect, useState } from "react";
import { chatRequest } from "@/hooks/use-staff-chat-data";

export type ChatFilePolicy = { maxFileSize: number; allowedExtensions: string[]; maxFileCount: number };

export function useStaffChatFilePolicy(onFailure: (cause: unknown) => void) {
  const [policy, setPolicy] = useState<ChatFilePolicy | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    void chatRequest<ChatFilePolicy>("/api/chat/files").then((result) => {
      if (!disposed) { setPolicy(result); setError(""); }
    }).catch((cause) => {
      if (!disposed) {
        onFailure(cause);
        setError("파일 첨부 설정을 불러오지 못했습니다.");
      }
    });
    return () => { disposed = true; };
  }, [onFailure, retry]);
  const reload = useCallback(() => { setError(""); setRetry((value) => value + 1); }, []);
  return { policy, error, reload };
}

export function formatChatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
}
