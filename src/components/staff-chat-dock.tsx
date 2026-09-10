"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStaffChatSync } from "@/hooks/use-staff-chat-sync";
import { useStaffChatPosition } from "@/hooks/use-staff-chat-position";
import { useStaffChatFileDrop } from "@/hooks/use-staff-chat-file-drop";
import { chatRequest, readChatResponse, useStaffChatData } from "@/hooks/use-staff-chat-data";
import { formatChatFileSize, useStaffChatFilePolicy } from "@/hooks/use-staff-chat-file-policy";
import { StaffChatFile } from "@/components/staff-chat-file";
import { getStaffChatFileSizeLimit, isStaffChatZip, staffChatChunkSize } from "@/lib/staff-chat-file-limits";
import { uploadStaffChatZip, type ChatUploadProgress } from "@/lib/staff-chat-upload-client";
import type { ChatEmployee, ChatMessage } from "@/lib/staff-chat-types";

const iconButton = "grid size-11 shrink-0 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]";
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" });
type SelectedAttachment = { file: File; fileOnly: boolean };

export function StaffChatDock({ userId }: { userId: string }) {
  const data = useStaffChatData();
  const { refresh, loading: threadLoading } = data;
  const filePolicy = useStaffChatFilePolicy(data.handleFailure);
  const { status, statusLabel } = useStaffChatSync({ userId, refresh: data.refresh });
  const [open, setOpen] = useState(false);
  const { panelRef, cancelDrag, resetPosition, handleProps } = useStaffChatPosition(open, userId);
  const [peer, setPeer] = useState<ChatEmployee | null>(null);
  const [list, setList] = useState<"conversations" | "employees">("conversations");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, SelectedAttachment | undefined>>({});
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<(ChatUploadProgress & { peerId: string }) | null>(null);
  const [sendError, setSendError] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [pageActive, setPageActive] = useState(true);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const busyRef = useRef(false);
  const readRef = useRef<Record<string, string>>({});
  const attemptsRef = useRef<Record<string, { body: string; requestId: string; file?: File }>>({});
  const scrollAnchor = useRef<{ height: number; top: number } | null>(null);
  const messages = data.thread?.peerId === peer?.id ? data.thread?.messages ?? [] : [];
  const draft = peer ? drafts[peer.id] ?? "" : "";
  const selectedAttachment = peer ? selectedFiles[peer.id] : undefined;
  const selectedFile = selectedAttachment?.file;
  const activeUploadProgress = uploadProgress?.peerId === peer?.id ? uploadProgress : null;
  const fileSizeHelp = filePolicy.policy ? `ZIP ${formatChatFileSize(filePolicy.policy.zipMaxFileSize)} · 기타 ${formatChatFileSize(filePolicy.policy.maxFileSize)}` : "";
  const currentPeer = data.overview?.employees.find((employee) => employee.id === peer?.id)
    ?? data.overview?.conversations.find((conversation) => conversation.peer.id === peer?.id)?.peer ?? peer;
  const unreadCount = data.overview?.unreadCount ?? 0;
  const dropBlockedReason = data.authExpired ? "다시 로그인한 후 파일을 보내 주세요."
    : !peer ? "대화할 직원을 먼저 선택해 주세요."
      : !currentPeer?.active ? "현재 파일을 받을 수 없는 직원입니다."
        : sending ? "전송 중입니다. 완료된 후 파일을 놓아 주세요."
          : !filePolicy.policy ? "파일 첨부 설정을 불러온 후 다시 시도해 주세요."
            : selectedFile ? "첨부한 파일을 먼저 전송하거나 제거해 주세요." : "";
  const { draggingFile, clearFileDrag, dropProps } = useStaffChatFileDrop({
    open, canDrop: !dropBlockedReason, onFiles: dropFiles,
  });

  useEffect(() => {
    if (open) (peer ? inputRef.current : searchRef.current)?.focus();
  }, [open, peer]);

  useEffect(() => {
    const update = () => setPageActive(document.visibilityState === "visible" && document.hasFocus());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (sendError) errorRef.current?.focus();
  }, [sendError]);

  useEffect(() => {
    const log = logRef.current;
    if (!log || !open) return;
    if (scrollAnchor.current) {
      log.scrollTop = scrollAnchor.current.top + log.scrollHeight - scrollAnchor.current.height;
      scrollAnchor.current = null;
    } else if (atBottom) {
      log.scrollTop = log.scrollHeight;
    }
  }, [data.thread, open, atBottom]);

  const latestUnread = [...messages].reverse().find((message) => message.recipientId === userId && !message.readAt);
  useEffect(() => {
    if (!open || !peer || !atBottom || !pageActive || !latestUnread || threadLoading) return;
    if (readRef.current[peer.id] === latestUnread.id) return;
    readRef.current[peer.id] = latestUnread.id;
    void chatRequest("/api/chat/read", { peerId: peer.id, messageId: latestUnread.id })
      .then(() => refresh())
      .catch(() => { delete readRef.current[peer.id]; });
  }, [open, peer, atBottom, pageActive, latestUnread, threadLoading, refresh]);

  function close() {
    clearFileDrag();
    setOpen(false);
    data.setActive(false, peer?.id ?? null);
    launcherRef.current?.focus();
  }

  function toggleOpen() {
    if (open) { close(); return; }
    setOpen(true);
    data.setActive(true, peer?.id ?? null);
    void data.refresh().catch(() => {});
  }

  function choosePeer(employee: ChatEmployee) {
    clearFileDrag();
    setPeer(employee);
    setSendError("");
    setAtBottom(true);
    scrollAnchor.current = null;
    void data.openThread(employee.id);
  }

  function backToList() {
    clearFileDrag();
    setPeer(null);
    setSendError("");
    data.setActive(true, null);
    void data.refresh().catch(() => {});
  }

  function fileError(file: File) {
    const policy = filePolicy.policy;
    if (!policy) return "파일 첨부 설정을 불러온 후 다시 시도해 주세요.";
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!policy.allowedExtensions.includes(extension)) {
      return "허용되지 않는 파일 형식입니다. 문서, 이미지 또는 ZIP 파일을 선택해 주세요.";
    }
    const sizeLimit = getStaffChatFileSizeLimit(file.name, policy);
    if (!file.size || file.size > sizeLimit) {
      return `파일은 0바이트보다 크고 ${formatChatFileSize(sizeLimit)} 이하여야 합니다.`;
    }
    return "";
  }

  function selectFile(file: File | undefined) {
    if (!file || !peer || !currentPeer?.active || data.authExpired || busyRef.current) return;
    const error = fileError(file);
    if (error) { setSendError(error); return; }
    setSelectedFiles((previous) => ({ ...previous, [peer.id]: { file, fileOnly: false } }));
    setSendError("");
  }

  function dropFiles(files: File[], hasDirectory: boolean) {
    if (busyRef.current) return;
    if (dropBlockedReason) { setSendError(dropBlockedReason); return; }
    if (hasDirectory) { setSendError("폴더는 전송할 수 없습니다. 파일 1개를 놓아 주세요."); return; }
    if (files.length !== 1) { setSendError("파일은 한 번에 1개만 놓아 주세요."); return; }
    const error = fileError(files[0]);
    if (error) { setSendError(error); return; }
    void deliverMessage({ file: files[0], fileOnly: true });
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    void deliverMessage();
  }

  async function deliverMessage(droppedAttachment?: SelectedAttachment) {
    const attachment = droppedAttachment ?? selectedAttachment;
    const file = attachment?.file;
    const body = attachment?.fileOnly ? "" : draft.trim();
    if (!open || !peer || data.authExpired || !currentPeer?.active || (!body && !file) || busyRef.current) return;
    const peerId = peer.id;
    if (droppedAttachment) setSelectedFiles((previous) => ({ ...previous, [peerId]: droppedAttachment }));
    let attempt = attemptsRef.current[peerId];
    if (!attempt || attempt.body !== body || attempt.file !== file) {
      attempt = { body, requestId: crypto.randomUUID(), file };
      attemptsRef.current[peerId] = attempt;
    }
    busyRef.current = true;
    setSending(true);
    setSendError("");
    try {
      let result: { message: ChatMessage };
      if (attempt.file && isStaffChatZip(attempt.file.name) && attempt.file.size > staffChatChunkSize) {
        result = await uploadStaffChatZip({ file: attempt.file, peerId, body, requestId: attempt.requestId, onProgress: (progress) => setUploadProgress({ ...progress, peerId }) });
      } else if (attempt.file) {
        const form = new FormData();
        form.set("peerId", peerId);
        form.set("body", body);
        form.set("requestId", attempt.requestId);
        form.set("file", attempt.file);
        const response = await fetch("/api/chat/files", {
          method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(90_000),
        });
        result = await readChatResponse<{ message: ChatMessage }>(response);
      } else {
        result = await chatRequest<{ message: ChatMessage }>("/api/chat/messages", { peerId, body, requestId: attempt.requestId });
      }
      data.appendMessage(result.message, peerId);
      if (!attachment?.fileOnly) setDrafts((previous) => previous[peerId]?.trim() === body ? { ...previous, [peerId]: "" } : previous);
      setSelectedFiles((previous) => previous[peerId]?.file === attempt.file ? { ...previous, [peerId]: undefined } : previous);
      delete attemptsRef.current[peerId];
      if (data.isPeerActive(peerId)) setAtBottom(true);
      void data.refresh().catch(() => {});
    } catch (cause) {
      data.handleFailure(cause);
      setSendError(cause instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(cause.name) ? cause.message : "전송하지 못했습니다. 연결을 확인하고 다시 전송해 주세요.");
    } finally {
      busyRef.current = false;
      setSending(false);
      setUploadProgress(null);
      inputRef.current?.focus();
    }
  }

  const query = search.trim().toLocaleLowerCase("ko-KR");
  const matches = (employee: ChatEmployee) => `${employee.name} ${employee.departmentName} ${employee.positionName}`.toLocaleLowerCase("ko-KR").includes(query);
  const employees = data.overview?.employees.filter(matches) ?? [];
  const conversations = (data.overview?.conversations.filter((conversation) => matches(conversation.peer)) ?? []).map((conversation) => {
    const file = conversation.lastMessage.attachment;
    if (!file) return conversation;
    const prefix = file.status === "deleted" ? "파일 삭제됨" : file.status === "deleting" ? "원본 삭제 중" : "파일";
    return { ...conversation, lastMessage: { ...conversation.lastMessage, body: `${prefix} · ${file.originalName}` } };
  });

  return (
    <aside className="staff-chat-dock print:hidden" aria-label="직원 메신저">
      {open ? (
        <section
          ref={panelRef}
          id="staff-chat-window"
          role="dialog"
          aria-label="직원 채팅"
          {...dropProps}
          className="staff-chat-window flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] shadow-lg"
          onKeyDown={(event) => {
            // Portal events still bubble through this React tree. Let a preview
            // modal handle Escape and Tab without also closing its conversation.
            if (event.target instanceof Element && event.target.closest("[data-app-modal='true']")) return;
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.stopPropagation();
              event.preventDefault();
              if (!cancelDrag()) close();
            }
          }}
        >
          <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-[var(--border)] px-2">
            {peer && !data.authExpired ? <button type="button" aria-label="대화 목록으로" disabled={sending} onClick={backToList} className={`${iconButton} disabled:opacity-50`}><ChatIcon kind="back" /></button> : null}
            <h2 aria-label={peer && !data.authExpired ? peer.name : "직원 채팅"} className="min-w-0 flex-1">
              <button type="button" aria-label="채팅창 이동" aria-describedby="staff-chat-move-help" title="드래그 또는 방향키로 채팅창 이동" {...handleProps} className="staff-chat-drag-handle flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-[var(--surface-muted)]">
                <ChatIcon kind="move" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{peer && !data.authExpired ? peer.name : "직원 채팅"}</span><span className="block truncate text-xs font-normal text-[var(--text-muted)]">{peer && !data.authExpired ? `${peer.departmentName} · ${peer.positionName}` : "직원 간 1:1 대화"}</span></span>
              </button>
            </h2>
            <span id="staff-chat-move-help" className="sr-only">드래그하거나 방향키로 이동합니다. Shift와 방향키를 누르면 더 크게 이동합니다. 드래그 중 Escape를 누르면 이동을 취소합니다.</span>
            <button type="button" aria-label="채팅창 위치 초기화" title="기본 위치로 되돌리기" onClick={resetPosition} className={iconButton}><ChatIcon kind="reset" /></button>
            <button type="button" aria-label="채팅창 최소화" onClick={close} className={iconButton}><ChatIcon kind="minimize" /></button>
          </header>
          <div role="status" className="flex min-h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-1 text-xs text-[var(--text-muted)]">
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${status === "connected" ? "bg-[var(--brand)]" : "bg-[var(--text-muted)]"}`} />
            {statusLabel}
          </div>
          {sendError && !peer && !data.authExpired ? <p ref={errorRef} role="alert" tabIndex={-1} className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--danger)]">{sendError}</p> : null}
          {data.error && !data.authExpired ? <div className="shrink-0 border-b border-[var(--border)] px-3 py-2"><p role="alert" className="text-xs text-[var(--danger)]">{data.error}</p><button type="button" onClick={() => { void data.refresh().catch(() => {}); }} className="min-h-11 rounded-md px-2 text-xs font-semibold">다시 시도</button></div> : null}
          {data.authExpired ? <div className="p-4"><p role="alert" className="text-sm">로그인이 만료되었습니다.</p><a href="/login" className="mt-2 inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline">다시 로그인</a></div> : peer ? (
            <div className="staff-chat-thread flex min-h-0 flex-1 flex-col">
              <div
                ref={logRef}
                role="log"
                aria-label={`${peer.name}님과의 메시지`}
                aria-live="polite"
                aria-relevant="additions"
                aria-busy={data.loading}
                tabIndex={0}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
                onScroll={(event) => {
                  const element = event.currentTarget;
                  setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 32);
                }}
              >
                {data.thread?.hasMore ? <button type="button" disabled={data.loadingOlder} className="mb-2 min-h-11 w-full rounded-md border border-[var(--border)] text-xs disabled:opacity-60" onClick={() => {
                  const log = logRef.current;
                  if (log) scrollAnchor.current = { height: log.scrollHeight, top: log.scrollTop };
                  void data.loadOlder();
                }}>{data.loadingOlder ? "이전 대화 불러오는 중…" : "이전 대화 보기"}</button> : null}
                {data.loading ? <ChatLoading /> : !messages.length && !data.error ? <div className="py-6 text-center"><p className="text-sm font-medium">첫 메시지를 보내 보세요.</p><p className="mt-1 text-xs text-[var(--text-muted)]">{peer.name}님과 주고받은 대화가 여기에 표시됩니다.</p></div> : null}
                {messages.map((message, index) => {
                  const mine = message.senderId === userId;
                  const date = new Date(message.createdAt);
                  const previous = messages[index - 1];
                  const showDay = !previous || new Date(previous.createdAt).toDateString() !== date.toDateString();
                  return <div key={message.id}>
                    {showDay ? <p className="mb-3 mt-2 text-center text-xs text-[var(--text-muted)]">{dayFormatter.format(date)}</p> : null}
                    <div className={`mb-3 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      {message.attachment ? <div className="w-[94%] max-w-80"><StaffChatFile attachment={message.attachment} mine={mine} onFailure={data.handleFailure} onUpdated={(updated) => { data.appendMessage(updated, peer.id); void refresh().catch(() => {}); }} /></div> : null}
                      {(!message.attachment || message.body !== `파일: ${message.attachment.originalName}`) && message.body ? <p className={`${message.attachment ? "mt-1 " : ""}max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-5 [overflow-wrap:anywhere] ${mine ? "bg-[var(--brand)] text-white" : "border border-[var(--border)] bg-[var(--surface-muted)]"}`}><span className="sr-only">{mine ? "나" : peer.name}: </span>{message.body}</p> : null}
                      <div className="mt-1 flex gap-1.5 text-[11px] tabular-nums text-[var(--text-muted)]">{mine ? <span>{message.readAt ? "읽음" : "안 읽음"}</span> : null}<time dateTime={message.createdAt}>{timeFormatter.format(date)}</time></div>
                    </div>
                  </div>;
                })}
              </div>
              {!atBottom && messages.length > 0 ? <button type="button" onClick={() => setAtBottom(true)} className="mx-3 mb-2 min-h-11 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-semibold">최근 메시지로 이동</button> : null}
              <form onSubmit={sendMessage} className="staff-chat-composer shrink-0 border-t border-[var(--border)] p-3" aria-busy={sending}>
                {sendError ? <p role="alert" ref={errorRef} tabIndex={-1} className="mb-2 text-xs text-[var(--danger)]">{sendError}</p> : null}
                {filePolicy.error ? <div className="mb-2 flex items-center gap-2"><p className="text-xs text-[var(--danger)]">{filePolicy.error}</p><button type="button" onClick={filePolicy.reload} className="min-h-11 shrink-0 rounded-md px-2 text-xs font-semibold">설정 다시 불러오기</button></div> : null}
                {!currentPeer?.active ? <p className="mb-2 text-xs text-[var(--text-muted)]">현재 메시지를 받을 수 없는 직원입니다. 이전 대화는 확인할 수 있습니다.</p> : null}
                <input ref={fileInputRef} type="file" aria-label="채팅 파일 선택" accept={filePolicy.policy?.allowedExtensions.join(",")} disabled={sending || !currentPeer?.active || !filePolicy.policy} className="hidden" onChange={(event) => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
                {selectedFile ? <div className="mb-2 flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] pl-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium" title={selectedFile.name}>{selectedFile.name}</p><p role={activeUploadProgress ? "status" : undefined} className="text-[11px] tabular-nums text-[var(--text-muted)]">{activeUploadProgress ? activeUploadProgress.stage === "finishing" ? "전송 마무리 중…" : `${activeUploadProgress.stage === "hashing" ? "파일 확인" : "업로드"} ${Math.floor(activeUploadProgress.completedBytes / activeUploadProgress.totalBytes * 100)}% · ${formatChatFileSize(selectedFile.size)}` : `${formatChatFileSize(selectedFile.size)}${selectedAttachment?.fileOnly ? " · 파일만 전송" : ""}`}</p></div><button type="button" aria-label="첨부파일 제거" disabled={sending} onClick={() => { setSelectedFiles((previous) => ({ ...previous, [peer.id]: undefined })); setSendError(""); }} className={iconButton}><ChatIcon kind="close" /></button></div> : null}
                <label htmlFor="staff-chat-message" className="sr-only">메시지</label>
                <textarea
                  id="staff-chat-message"
                  ref={inputRef}
                  value={draft}
                  maxLength={2000}
                  rows={2}
                  disabled={!currentPeer?.active}
                  readOnly={sending}
                  placeholder="메시지 입력"
                  aria-describedby="staff-chat-input-help"
                  onChange={(event) => { setDrafts((previous) => ({ ...previous, [peer.id]: event.target.value })); setSendError(""); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
                  }}
                  className="block min-h-16 w-full resize-none rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-base leading-5 text-[var(--foreground)] placeholder:text-[var(--text-muted)] disabled:opacity-60 sm:text-sm"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1"><button type="button" aria-label="파일 첨부" title={filePolicy.policy ? `파일 1개 · ${fileSizeHelp}` : "파일 첨부 설정 불러오는 중"} disabled={sending || !currentPeer?.active || !filePolicy.policy} onClick={() => fileInputRef.current?.click()} className={`${iconButton} disabled:opacity-50`}><ChatIcon kind="attach" /></button><p id="staff-chat-input-help" className="text-[11px] leading-4 text-[var(--text-muted)]">Enter 전송 · Shift+Enter 줄바꿈<br /><span className="tabular-nums">{draft.length.toLocaleString()} / 2,000</span>{fileSizeHelp ? <><br />{fileSizeHelp}</> : null}</p></div>
                  <button type="submit" disabled={sending || (!draft.trim() && !selectedFile) || !currentPeer?.active} className="inline-flex min-h-11 min-w-16 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--brand)] px-3 text-sm font-semibold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">{sending ? "전송 중…" : selectedAttachment?.fileOnly ? "파일 다시 전송" : "전송"}<ChatIcon kind="send" /></button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-[var(--border)] px-3 pt-2">
                <div className="flex gap-1" aria-label="채팅 목록 선택">
                  <button type="button" aria-pressed={list === "conversations"} onClick={() => setList("conversations")} className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold ${list === "conversations" ? "bg-[var(--brand-soft)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"}`}>대화 <span className="ml-1 tabular-nums">{data.overview?.conversations.length ?? 0}</span></button>
                  <button type="button" aria-pressed={list === "employees"} onClick={() => setList("employees")} className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold ${list === "employees" ? "bg-[var(--brand-soft)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"}`}>직원 <span className="ml-1 tabular-nums">{data.overview?.employees.length ?? 0}</span></button>
                </div>
                <label className="my-2 flex min-h-11 items-center gap-2 rounded-md border border-[var(--border-strong)] px-3"><ChatIcon kind="search" /><span className="sr-only">직원 검색</span><input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름·부서 검색" className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--text-muted)] sm:text-sm" /></label>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" aria-busy={!data.overview && !data.error}>
                {!data.overview && !data.error ? <ChatLoading /> : null}
                {list === "conversations" ? (
                  <ul aria-label="대화 목록">{conversations.map((conversation) => <li key={conversation.peer.id}><button type="button" aria-label={`${conversation.peer.name} 대화 열기`} onClick={() => choosePeer(conversation.peer)} className="flex min-h-16 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--surface-muted)]"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{conversation.peer.name}</span><span className="truncate text-xs text-[var(--text-muted)]">{conversation.peer.departmentName}</span></div><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{conversation.lastMessage.senderId === userId ? "나: " : ""}{conversation.lastMessage.body}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><time className="text-[11px] tabular-nums text-[var(--text-muted)]" dateTime={conversation.lastMessage.createdAt}>{timeFormatter.format(new Date(conversation.lastMessage.createdAt))}</time>{conversation.unreadCount > 0 ? <UnreadBadge count={conversation.unreadCount} /> : null}</div></button></li>)}</ul>
                ) : <ul aria-label="직원 목록">{employees.map((employee) => <li key={employee.id}><button type="button" aria-label={`${employee.name} 대화 열기`} onClick={() => choosePeer(employee)} className="flex min-h-16 w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--surface-muted)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{employee.name}</p><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{employee.departmentName} · {employee.positionName}</p></div><ChatIcon kind="chat" /></button></li>)}</ul>}
                {data.overview && !(list === "conversations" ? conversations : employees).length ? <div className="px-2 py-5 text-center"><p className="text-sm font-medium">{query ? "검색 결과가 없습니다." : list === "conversations" ? "아직 대화가 없습니다." : "대화할 직원이 없습니다."}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{query ? "이름이나 부서를 다시 확인해 주세요." : "직원을 선택하면 대화를 시작할 수 있습니다."}</p>{list === "conversations" && !query ? <button type="button" onClick={() => setList("employees")} className="mt-2 min-h-11 rounded-md px-4 text-sm font-semibold hover:bg-[var(--surface-muted)]">직원 찾아 대화하기</button> : null}</div> : null}
              </div>
            </>
          )}
          {draggingFile ? <div role="status" aria-label="파일 놓기 안내" className="staff-chat-drop-overlay">
            <div className="max-w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-center shadow-sm">
              <p className="text-sm font-semibold [overflow-wrap:anywhere]">{dropBlockedReason || `${peer?.name}님에게 파일 전송`}</p>
              {!dropBlockedReason ? <><p className="mt-1 text-sm">여기에 놓으면 바로 전송됩니다.</p><p className="mt-1 text-xs text-[var(--text-muted)]">파일 1개 · {fileSizeHelp}</p></> : null}
            </div>
          </div> : null}
        </section>
      ) : null}
      <button
        ref={launcherRef}
        type="button"
        aria-label={`직원 채팅${unreadCount ? `, 안 읽은 메시지 ${unreadCount}개` : ""}`}
        aria-expanded={open}
        aria-controls="staff-chat-window"
        onClick={toggleOpen}
        className="ml-auto flex min-h-11 min-w-36 items-center justify-between gap-3 rounded-t-lg border border-b-0 border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] shadow-sm hover:bg-[var(--surface-muted)]"
      ><ChatIcon kind="chat" /><span>직원 채팅</span>{unreadCount ? <UnreadBadge count={unreadCount} /> : <ChatIcon kind={open ? "minimize" : "up"} />}</button>
    </aside>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return <span aria-label={`안 읽은 메시지 ${count}개`} className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[11px] font-semibold tabular-nums text-white">{count > 99 ? "99+" : count}</span>;
}

function ChatLoading() {
  return <div role="status" className="space-y-3 px-2 py-3"><span className="sr-only">채팅 불러오는 중</span>{[0, 1, 2].map((item) => <div key={item} className="h-12 rounded-md bg-[var(--surface-muted)] motion-safe:animate-pulse" />)}</div>;
}

function ChatIcon({ kind }: { kind: "chat" | "search" | "back" | "send" | "minimize" | "up" | "attach" | "close" | "move" | "reset" }) {
  return <svg className="size-4 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {kind === "move" ? <><path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3" /></>
      : kind === "reset" ? <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>
      : kind === "attach" ? <path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7L14 1M6 15l9-9" />
      : kind === "close" ? <path d="m6 6 12 12M6 18 18 6" />
      : kind === "chat" ? <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z" /><path d="M7 9h8M7 13h5" /></>
      : kind === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>
      : kind === "back" ? <path d="m14 6-6 6 6 6" />
      : kind === "send" ? <><path d="m22 2-7 20-4-9L2 9Z" /><path d="M22 2 11 13" /></>
      : kind === "minimize" ? <path d="M5 12h14" /> : <path d="m6 14 6-6 6 6" />}
  </svg>;
}
