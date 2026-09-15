import Link from "next/link";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { dailyReportPath, type DailyReportHomeSummary } from "@/lib/daily-report-core";

const employeeStates = {
  missing: { label: "미제출", action: "작성하기", note: "오늘의 업무보고를 작성해 주세요." },
  draft: { label: "임시저장 · 미제출", action: "이어서 작성", note: "임시저장한 보고서를 제출해 주세요." },
  submitted: { label: "제출 완료", action: "보고서 보기", note: "시설장 확인을 기다리고 있습니다." },
  reviewed: { label: "확인 완료", action: "보고서 보기", note: "시설장이 확인한 보고서입니다." },
};

export function HomeDailyReport({ summary }: { summary: DailyReportHomeSummary | null }) {
  if (!summary) return null;
  const employeeState = summary.mode === "employee" ? employeeStates[summary.status] : null;
  const needsAction = summary.mode === "employee"
    ? summary.status === "missing" || summary.status === "draft"
    : summary.mode === "director" && summary.unreviewed > 0;
  const status = employeeState?.label ?? (summary.mode === "director"
    ? `제출 ${summary.submitted.toLocaleString("ko-KR")}건 · 미확인 ${summary.unreviewed.toLocaleString("ko-KR")}건`
    : "상태 확인 필요");
  const action = employeeState?.action ?? (summary.mode === "director" ? "보고 확인" : "보고 화면 열기");

  return (
    <section aria-labelledby="home-daily-report-title" className="mb-3 flex min-h-[76px] items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 sm:px-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id="home-daily-report-title" className="text-sm font-semibold text-[var(--foreground)]">일일 업무보고</h2>
          <span className={`text-xs font-semibold tabular-nums ${needsAction ? "text-[var(--brand)] dark:text-[var(--foreground)]" : "text-[var(--text-muted)]"}`}>{status}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          {employeeState?.note ?? (summary.mode === "director" ? "오늘 제출된 직원 보고를 확인하세요." : "상태를 불러오지 못했습니다. 보고 화면에서 확인해 주세요.")}
        </p>
      </div>
      <Link
        href={`${dailyReportPath}?date=${summary.today}`}
        aria-label={`오늘 일일 업무보고 ${action}`}
        className={buttonClass(buttonStyles.base, needsAction ? buttonStyles.primary : buttonStyles.neutral, "min-h-11 shrink-0 whitespace-nowrap px-3 text-sm")}
      >{action}</Link>
    </section>
  );
}

export function HomeDailyReportSkeleton() {
  return (
    <section aria-label="일일 업무보고 상태 불러오는 중" aria-busy="true" className="mb-3 flex min-h-[76px] items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 sm:px-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">일일 업무보고</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">오늘의 제출 상태 확인 중</p>
      </div>
      <span aria-hidden="true" className="h-11 w-20 rounded-md bg-[var(--surface-muted)]" />
    </section>
  );
}
