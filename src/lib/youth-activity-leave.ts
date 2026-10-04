"use client";
import { useEffect } from "react";
// Browser navigation can discard only local input/attempts. It never cancels or
// repeats an uncertain server mutation. Server receipts remain authoritative.
export function useYouthActivityLeaveGuard({ dirty, pending, discard }: { dirty: boolean; pending: boolean; discard: () => void }) {
  useEffect(() => {
    if (!dirty && !pending) return;
    function unload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    function navigate(event: MouseEvent) {
      if (!(event.target instanceof Element) || event.defaultPrevented || !event.target.closest("a[href]")) return;
      if (pending) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (!window.confirm("저장하지 않은 입력 또는 결과를 확인하지 못한 요청이 남아 있습니다. 서버 처리를 취소하지 않고 화면의 입력을 버리고 이동하시겠습니까?")) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      discard();
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, pending, discard]);
}
