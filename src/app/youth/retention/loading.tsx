import { PageTitle } from "@/components/page-title";

export default function YouthRetentionLoading() {
  return <div aria-busy="true" aria-label="퇴소기록 불러오는 중"><PageTitle compact title="퇴소기록 관리" action={<div className="h-11 w-24 rounded-md bg-[var(--surface-muted)]" aria-hidden="true"/>}/><div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[0,1,2,3].map(key => <div key={key} className="h-[66px] rounded-md border border-[var(--border)] bg-[var(--surface-muted)]"/>)}</div><div className="mb-3 grid grid-cols-2 gap-2" aria-hidden="true">{[0,1].map(key=><div key={key} className="h-11 rounded-md bg-[var(--surface-muted)]"/>)}</div><div className="min-h-36 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-muted)]">보존 상태를 불러오고 있습니다.</div></div>;
}
