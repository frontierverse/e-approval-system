"use client";

import { useState } from "react";
import { StaffTaskEditorModal } from "@/components/staff-task-editor-modal";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

export function MyStaffTaskCreateButton() {
  const [editor, setEditor] = useState<{ requestId: string; trigger: HTMLElement } | null>(null);
  const [message, setMessage] = useState("");
  return <div>
    <button type="button" aria-haspopup="dialog" onClick={(event) => {
      setMessage("");
      setEditor({ requestId: crypto.randomUUID(), trigger: event.currentTarget });
    }} className={buttonClass(buttonStyles.base, buttonStyles.create, "min-h-11 px-3 text-xs")}>할 일 추가</button>
    <span role="status" className="sr-only">{message}</span>
    {editor ? <StaffTaskEditorModal selfOnly task={null} assignees={[]} requestId={editor.requestId} returnFocusTo={editor.trigger} onClose={() => setEditor(null)} onSaved={(success) => { setMessage(success); setEditor(null); }} /> : null}
  </div>;
}
