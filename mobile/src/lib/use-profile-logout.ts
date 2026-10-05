import { useEffect, useRef, useState } from "react";

// The screen is keyed by account/session. A departing account cannot publish feedback.
export function useProfileLogout(signOut: () => Promise<void>) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true), locked = useRef(false), open = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; open.current = false; }; }, []);
  const request = () => {
    if (!alive.current || locked.current || open.current) return;
    open.current = true; setError(null); setConfirming(true);
  };
  const cancel = () => {
    if (!alive.current || locked.current) return;
    open.current = false; setConfirming(false);
  };
  const confirm = async () => {
    if (!alive.current || locked.current || !open.current) return;
    locked.current = true; setBusy(true);
    try { await signOut(); }
    catch { if (alive.current) setError("로그아웃을 완료하지 못했습니다. 다시 시도하세요."); }
    finally {
      if (alive.current) { locked.current = false; open.current = false; setBusy(false); setConfirming(false); }
    }
  };
  return { confirming, busy, error, request, cancel, confirm };
}
