export type ApprovalAuditUser = {
  id?: string;
  name: string;
  position?: {
    name: string;
  } | null;
};

export type ApprovalAuditStep = {
  approverId: string;
  proxyApprovedById?: string | null;
  approver: ApprovalAuditUser;
  proxyApprovedBy?: ApprovalAuditUser | null;
};

type DecisionMessageInput = {
  approver: ApprovalAuditUser;
  drafter: ApprovalAuditUser;
};

type ProxyApprovalMessageInput = {
  actor: ApprovalAuditUser;
  approver: ApprovalAuditUser;
};

type ProxyRejectMessageInput = {
  actor: ApprovalAuditUser;
  actorId: string;
  step: ApprovalAuditStep;
  comment?: string;
};

type RejectMessageInput = DecisionMessageInput & {
  comment?: string;
};

export function createApprovalApprovedAuditMessage({
  approver,
  drafter,
}: DecisionMessageInput) {
  return `${withSubjectParticle(formatApprovalAuditUser(approver))} ${formatApprovalAuditUser(drafter)}의 결재 요청을 승인했습니다.`;
}

export function createApprovalRejectedAuditMessage({
  approver,
  drafter,
  comment,
}: RejectMessageInput) {
  return withOptionalReason(
    `${withSubjectParticle(formatApprovalAuditUser(approver))} ${formatApprovalAuditUser(drafter)}의 결재 요청을 반려했습니다.`,
    comment,
  );
}

export function createProxyApprovedAuditMessage({
  actor,
  approver,
}: ProxyApprovalMessageInput) {
  return `${withSubjectParticle(formatApprovalAuditUser(actor))} ${formatApprovalAuditUser(approver)}의 결재를 대리 승인했습니다.`;
}

export function createProxyRejectedAuditMessage({
  actor,
  actorId,
  step,
  comment,
}: ProxyRejectMessageInput) {
  const actorLabel = formatApprovalAuditUser(actor);
  const approverLabel = formatApprovalAuditUser(step.approver);
  const proxyActorLabel = step.proxyApprovedBy
    ? formatApprovalAuditUser(step.proxyApprovedBy)
    : "대리 결재자";
  const message =
    step.proxyApprovedById === actorId
      ? `${withSubjectParticle(actorLabel)} ${approverLabel}의 대리 결재를 대리 반려했습니다.`
      : step.approverId === actorId
        ? `${withSubjectParticle(actorLabel)} ${proxyActorLabel}의 대리 결재를 반려했습니다.`
        : `${withSubjectParticle(actorLabel)} ${approverLabel}의 대리 결재를 반려했습니다.`;

  return withOptionalReason(message, comment);
}

export function formatApprovalAuditUser(user: ApprovalAuditUser) {
  return [user.name, user.position?.name].filter(Boolean).join(" ");
}

function withOptionalReason(message: string, comment: string | undefined) {
  const reason = comment?.trim();

  return reason ? `${message} 사유: ${reason}` : message;
}

function withSubjectParticle(label: string) {
  return `${label}${hasFinalConsonant(label) ? "이" : "가"}`;
}

function hasFinalConsonant(value: string) {
  const lastCode = value.trim().charCodeAt(value.trim().length - 1);

  if (lastCode < 0xac00 || lastCode > 0xd7a3) {
    return true;
  }

  return (lastCode - 0xac00) % 28 !== 0;
}
