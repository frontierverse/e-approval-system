export const auditActionLabels = {
  CREATE_DRAFT: "임시저장",
  UPDATE_DRAFT: "임시저장 수정",
  DELETE_DRAFT: "임시저장 삭제",
  SUBMIT: "제출",
  APPROVE: "승인",
  PROXY_APPROVE: "대리결재",
  PROXY_REJECT: "대리결재 반려",
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
  CREATE_RESOURCE: "자료 업로드",
  UPDATE_RESOURCE: "자료 수정",
  DELETE_RESOURCE: "자료 삭제",
  CREATE_YOUTH: "청소년 등록",
  UPDATE_YOUTH: "청소년 정보 수정",
  UPDATE_YOUTH_NOTE: "청소년 특이사항 수정",
  DELETE_YOUTH_NOTE: "청소년 특이사항 삭제",
} as const;

export type AuditActionValue = keyof typeof auditActionLabels;

export const auditActionValues = Object.keys(
  auditActionLabels,
) as AuditActionValue[];

export const auditActionOptions = [
  { value: "all", label: "전체" },
  ...auditActionValues.map((value) => ({
    value,
    label: auditActionLabels[value],
  })),
] as const;

export const auditActionBadgeClasses: Record<AuditActionValue, string> = {
  CREATE_DRAFT: "border-[#bdd7f0] bg-[#edf6ff] text-[#245d8f]",
  UPDATE_DRAFT: "border-[#c9d6ea] bg-[#f3f7fc] text-[#3f5f8c]",
  DELETE_DRAFT: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
  SUBMIT: "border-[#b8d9d7] bg-[#eef7f6] text-[#196b69]",
  APPROVE: "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]",
  PROXY_APPROVE: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
  PROXY_REJECT: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
  REJECT: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
  RECALL: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
  COMPLETE: "border-[#add8c5] bg-[#e4f6ed] text-[#17643b]",
  CREATE_USER: "border-[#d8c7ef] bg-[#f6f0ff] text-[#624093]",
  UPDATE_USER: "border-[#d8c7ef] bg-[#f6f0ff] text-[#624093]",
  CREATE_DEPARTMENT: "border-[#bdd7f0] bg-[#edf6ff] text-[#245d8f]",
  UPDATE_DEPARTMENT: "border-[#bdd7f0] bg-[#edf6ff] text-[#245d8f]",
  CREATE_POSITION: "border-[#c6d5b5] bg-[#f2f8e9] text-[#4e6c26]",
  UPDATE_POSITION: "border-[#c6d5b5] bg-[#f2f8e9] text-[#4e6c26]",
  CREATE_TEMPLATE: "border-[#c9c8f0] bg-[#f2f2ff] text-[#4f4b9a]",
  UPDATE_TEMPLATE: "border-[#c9c8f0] bg-[#f2f2ff] text-[#4f4b9a]",
  UPDATE_ATTACHMENT_POLICY: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
  CHANGE_PASSWORD: "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]",
  CREATE_RESOURCE: "border-[#b8d9d7] bg-[#eef7f6] text-[#196b69]",
  UPDATE_RESOURCE: "border-[#c9d6ea] bg-[#f3f7fc] text-[#3f5f8c]",
  DELETE_RESOURCE: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
  CREATE_YOUTH: "border-[#b8d9d7] bg-[#eef7f6] text-[#196b69]",
  UPDATE_YOUTH: "border-[#c9d6ea] bg-[#f3f7fc] text-[#3f5f8c]",
  UPDATE_YOUTH_NOTE: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
  DELETE_YOUTH_NOTE: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
};

export const auditActionTextClasses: Record<AuditActionValue, string> = {
  CREATE_DRAFT: "text-[#245d8f]",
  UPDATE_DRAFT: "text-[#3f5f8c]",
  DELETE_DRAFT: "text-[#8a1f1f]",
  SUBMIT: "text-[#196b69]",
  APPROVE: "text-[#22633a]",
  PROXY_APPROVE: "text-[#82620d]",
  PROXY_REJECT: "text-[#8a1f1f]",
  REJECT: "text-[#8a1f1f]",
  RECALL: "text-[#82620d]",
  COMPLETE: "text-[#17643b]",
  CREATE_USER: "text-[#624093]",
  UPDATE_USER: "text-[#624093]",
  CREATE_DEPARTMENT: "text-[#245d8f]",
  UPDATE_DEPARTMENT: "text-[#245d8f]",
  CREATE_POSITION: "text-[#4e6c26]",
  UPDATE_POSITION: "text-[#4e6c26]",
  CREATE_TEMPLATE: "text-[#4f4b9a]",
  UPDATE_TEMPLATE: "text-[#4f4b9a]",
  UPDATE_ATTACHMENT_POLICY: "text-[#82620d]",
  CHANGE_PASSWORD: "text-[#394150]",
  CREATE_RESOURCE: "text-[#196b69]",
  UPDATE_RESOURCE: "text-[#3f5f8c]",
  DELETE_RESOURCE: "text-[#8a1f1f]",
  CREATE_YOUTH: "text-[#196b69]",
  UPDATE_YOUTH: "text-[#3f5f8c]",
  UPDATE_YOUTH_NOTE: "text-[#82620d]",
  DELETE_YOUTH_NOTE: "text-[#8a1f1f]",
};

export function getAuditActionLabel(action: string) {
  return isAuditActionValue(action) ? auditActionLabels[action] : action;
}

export function getAuditActionBadgeClass(action: string) {
  return isAuditActionValue(action)
    ? auditActionBadgeClasses[action]
    : "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]";
}

export function getAuditActionTextClass(action: string) {
  return isAuditActionValue(action)
    ? auditActionTextClasses[action]
    : "text-[#394150]";
}

export function isAuditActionValue(action: string): action is AuditActionValue {
  return action in auditActionLabels;
}
