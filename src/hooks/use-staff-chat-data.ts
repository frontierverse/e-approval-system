"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatEmployee, ChatMessage, ChatConversation } from "@/lib/staff-chat-types";

export type ChatOverview = {
  employees: ChatEmployee[];
  conversations: ChatConversation[];
  unreadCount: number;
};
type Thread = { peerId: string; messages: ChatMessage[]; hasMore: boolean };

class ChatRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function chatRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    ...(body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ChatRequestError(response.status === 401
      ? "로그인이 만료되었습니다. 다시 로그인해 주세요."
      : typeof result?.error === "string" ? result.error : "채팅을 불러오지 못했습니다. 다시 시도해 주세요.", response.status);
  }
  return result as T;
}

function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]) {
  const merged = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) merged.set(message.id, message);
  return [...merged.values()].sort((a, b) => {
    if (a.sequence && b.sequence) return BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : 0;
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

export function useStaffChatData() {
  const [overview, setOverview] = useState<ChatOverview | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [authExpired, setAuthExpired] = useState(false);
  const activeRef = useRef<{ open: boolean; peerId: string | null }>({ open: false, peerId: null });
  const threadVersion = useRef(0);
  const refreshTask = useRef<Promise<void> | null>(null);

  const handleFailure = useCallback((cause: unknown) => {
    if (cause instanceof ChatRequestError && cause.status === 401) {
      setAuthExpired(true);
      setOverview(null);
      setThread(null);
      ++threadVersion.current;
    }
  }, []);

  const refresh = useCallback(() => {
    if (refreshTask.current) return refreshTask.current;
    const version = threadVersion.current;
    const peerId = activeRef.current.open ? activeRef.current.peerId : null;
    const task = (async () => {
      try {
        const [summary, latest] = await Promise.all([
          chatRequest<ChatOverview>("/api/chat"),
          peerId ? chatRequest<Omit<Thread, "peerId">>(`/api/chat/messages?peerId=${encodeURIComponent(peerId)}`) : null,
        ]);
        setOverview(summary);
        if (latest && peerId && version === threadVersion.current) {
          setThread((previous) => {
            const existing = previous?.peerId === peerId ? previous.messages : [];
            // A long disconnection may miss more than one page. Keep the newest
            // contiguous page in that case so "older" can recover the whole gap.
            const overlaps = latest.messages.some((message) => existing.some((old) => old.id === message.id));
            if (existing.length && latest.hasMore && !overlaps) return { peerId, ...latest };
            const retainedEarlier = existing[0] && latest.messages[0]
              && BigInt(existing[0].sequence) < BigInt(latest.messages[0].sequence);
            return {
              peerId,
              messages: mergeMessages(existing, latest.messages),
              hasMore: retainedEarlier ? previous!.hasMore : latest.hasMore,
            };
          });
        }
        setError("");
      } catch (cause) {
        handleFailure(cause);
        setError(cause instanceof Error ? cause.message : "채팅을 불러오지 못했습니다. 다시 시도해 주세요.");
        throw cause;
      }
    })();
    refreshTask.current = task;
    void task.finally(() => { refreshTask.current = null; }).catch(() => {});
    return task;
  }, [handleFailure]);

  async function openThread(peerId: string) {
    activeRef.current = { open: true, peerId };
    const version = ++threadVersion.current;
    setThread({ peerId, messages: [], hasMore: false });
    setLoading(true);
    setError("");
    try {
      const result = await chatRequest<Omit<Thread, "peerId">>(`/api/chat/messages?peerId=${encodeURIComponent(peerId)}`);
      if (version === threadVersion.current) setThread({ peerId, ...result });
    } catch (cause) {
      handleFailure(cause);
      if (version === threadVersion.current) setError(cause instanceof Error ? cause.message : "대화를 불러오지 못했습니다.");
    } finally {
      if (version === threadVersion.current) setLoading(false);
    }
  }

  async function loadOlder() {
    if (!thread?.hasMore || loadingOlder || !thread.messages[0]) return;
    const version = threadVersion.current;
    setLoadingOlder(true);
    try {
      const result = await chatRequest<Omit<Thread, "peerId">>(`/api/chat/messages?peerId=${encodeURIComponent(thread.peerId)}&before=${encodeURIComponent(thread.messages[0].id)}`);
      if (version === threadVersion.current) {
        setThread((previous) => previous ? { ...previous, messages: mergeMessages(result.messages, previous.messages), hasMore: result.hasMore } : previous);
      }
    } catch (cause) {
      handleFailure(cause);
      setError(cause instanceof Error ? cause.message : "이전 대화를 불러오지 못했습니다.");
    } finally {
      setLoadingOlder(false);
    }
  }

  function appendMessage(message: ChatMessage, peerId: string) {
    setThread((previous) => previous?.peerId === peerId ? { ...previous, messages: mergeMessages(previous.messages, [message]) } : previous);
  }

  function setActive(open: boolean, peerId: string | null) {
    if (activeRef.current.peerId !== peerId) ++threadVersion.current;
    activeRef.current = { open, peerId };
    if (!peerId) setLoading(false);
  }

  function isPeerActive(peerId: string) {
    return activeRef.current.peerId === peerId;
  }

  return { overview, thread, loading, loadingOlder, error, authExpired, handleFailure, setActive, isPeerActive, refresh, openThread, loadOlder, appendMessage };
}
