type AdminAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  message: string | null;
  createdAt: Date;
  actor: {
    name: string;
    email: string;
  };
  document: {
    title: string;
    documentNo: string | null;
  } | null;
};

const actionLabels: Record<string, string> = {
  CREATE_DRAFT: "기안 작성",
  UPDATE_DRAFT: "기안 수정",
  SUBMIT: "제출",
  APPROVE: "승인",
  REJECT: "반려",
  RECALL: "회수",
  COMPLETE: "완료",
  CREATE_USER: "사용자 생성",
  UPDATE_USER: "사용자 수정",
  CREATE_DEPARTMENT: "부서 생성",
  UPDATE_DEPARTMENT: "부서 수정",
  CREATE_POSITION: "직급 생성",
  UPDATE_POSITION: "직급 수정",
  CREATE_TEMPLATE: "양식 생성",
  UPDATE_TEMPLATE: "양식 수정",
  UPDATE_ATTACHMENT_POLICY: "첨부 정책 수정",
  CHANGE_PASSWORD: "비밀번호 변경",
};

export function AdminAuditLogList({ logs }: { logs: AdminAuditLog[] }) {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">감사 로그</h2>
          <p className="mt-1 text-sm text-[#697386]">
            최근 관리자/결재 작업 기록을 확인합니다.
          </p>
        </div>
        <span className="rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 py-1.5 text-sm font-semibold text-[#394150]">
          최근 {logs.length}건
        </span>
      </div>

      {logs.length > 0 ? (
        <ol className="divide-y divide-[#eef1f5]">
          {logs.map((log) => (
            <li key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[12rem_9rem_minmax(0,1fr)]">
              <time
                dateTime={log.createdAt.toISOString()}
                className="text-sm font-medium text-[#394150]"
              >
                {formatAuditLogDate(log.createdAt)}
              </time>

              <div>
                <span className="inline-flex h-7 items-center rounded-md bg-[#eef7f6] px-2.5 text-xs font-semibold text-[#196b69]">
                  {getAuditActionLabel(log.action)}
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#16181d]">
                  {log.message || getFallbackAuditMessage(log)}
                </p>
                <p className="mt-1 truncate text-xs text-[#697386]">
                  {log.actor.name} · {log.actor.email}
                  {log.document
                    ? ` · ${log.document.documentNo ?? "문서번호 없음"} · ${log.document.title}`
                    : ` · ${getTargetLabel(log.targetType)} ${log.targetId}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-[#394150]">
            아직 기록된 작업이 없습니다.
          </p>
          <p className="mt-1 text-sm text-[#697386]">
            사용자 수정, 결재 처리, 정책 변경 같은 주요 작업이 이곳에 표시됩니다.
          </p>
        </div>
      )}
    </section>
  );
}

function getAuditActionLabel(action: string) {
  return actionLabels[action] ?? action;
}

function getFallbackAuditMessage(log: AdminAuditLog) {
  return `${log.actor.name} 사용자가 ${getAuditActionLabel(log.action)} 작업을 수행했습니다.`;
}

function getTargetLabel(targetType: string) {
  const labels: Record<string, string> = {
    User: "사용자",
    Department: "부서",
    Position: "직급",
    DocumentTemplate: "문서 양식",
    ApprovalDocument: "문서",
    AttachmentPolicy: "첨부 정책",
  };

  return labels[targetType] ?? targetType;
}

function formatAuditLogDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
