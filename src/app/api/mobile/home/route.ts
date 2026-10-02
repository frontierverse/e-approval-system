import { getHomeDashboardData, type HomeDashboardDocument } from "@/lib/home-dashboard";
import { canViewHomeApprovalQueue } from "@/lib/home-dashboard-visibility";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const canApproveDocuments = canViewHomeApprovalQueue(session.user.position.name);
  const dashboard = await getHomeDashboardData(session.userId, {
    includeApprovalQueue: canApproveDocuments,
  });

  return mobileJson({
    canApproveDocuments,
    counts: {
      activeSent: dashboard.counts.activeSent,
      recalled: dashboard.counts.recalled,
      ...(canApproveDocuments ? { activeInbox: dashboard.counts.activeInbox } : {}),
    },
    sentDocuments: dashboard.sentDocuments.map(summarizeDocument),
    ...(canApproveDocuments ? { inboxDocuments: dashboard.inboxDocuments.map(summarizeDocument) } : {}),
  });
}

function summarizeDocument(document: HomeDashboardDocument) {
  return {
    id: document.id,
    title: document.title,
    documentNo: document.documentNo,
    status: document.status,
    submittedAt: document.submittedAt,
    drafterName: document.drafter.name,
    currentApproverName: document.currentApprover?.name ?? null,
  };
}
