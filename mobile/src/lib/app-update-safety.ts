// Shared with navigation guards and request boundaries so a reload cannot discard
// unsaved work or interrupt a mutation, even when its screen is behind another one.
const blockers = new Set<symbol>();
const listeners = new Set<() => void>();
let requests = 0;
let restarting = false;
const emit = () => { for (const listener of listeners) listener(); };
export function subscribeAppUpdateSafety(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getAppUpdateBlockReason(): string | null {
  if (requests) return '저장·결재 요청을 처리 중입니다. 완료 후 업데이트를 적용하세요.';
  if (blockers.size) return '작성 중인 내용이나 확인할 작업이 있습니다. 저장하거나 해당 화면을 정리한 뒤 업데이트를 적용하세요.';
  return null;
}
export function setAppUpdateBlocker(key: symbol, blocked: boolean) {
  const previous = blockers.has(key);
  if (blocked) blockers.add(key); else blockers.delete(key);
  if (previous !== blocked) emit();
}
export function beginAppUpdateRequest(method = 'GET') {
  if (method === 'GET') return () => {};
  if (restarting) throw new Error('앱 업데이트를 적용하고 있습니다. 다시 실행된 뒤 시도하세요.');
  requests++; emit();
  let finished = false;
  return () => { if (!finished) { finished = true; requests--; emit(); } };
}
export function beginAppUpdateRestart() {
  if (restarting || getAppUpdateBlockReason()) return false;
  restarting = true;
  return true;
}
export function cancelAppUpdateRestart() { restarting = false; }
