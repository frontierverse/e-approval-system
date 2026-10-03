import { getHomeDashboardData, type HomeDashboardDocument } from "@/lib/home-dashboard";
import { canViewHomeApprovalQueue } from "@/lib/home-dashboard-visibility";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { getMobileHomeTaskCounts } from "@/lib/mobile-staff-tasks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getMobileSession(request);
    if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
    const canApproveDocuments = canViewHomeApprovalQueue(session.user.position.name);
    const [dashboard, taskCounts] = await Promise.all([
      getHomeDashboardData(session.userId, { includeApprovalQueue: canApproveDocuments }),
      getMobileHomeTaskCounts(session.userId),
    ]);

    return mobileJson({
      canApproveDocuments,
      taskCounts,
      counts: {
        activeSent: dashboard.counts.activeSent,
        recalled: dashboard.counts.recalled,
        ...(canApproveDocuments ? { activeInbox: dashboard.counts.activeInbox } : {}),
      },
      sentDocuments: dashboard.sentDocuments.map(summarizeDocument),
      ...(canApproveDocuments ? { inboxDocuments: dashboard.inboxDocuments.map(summarizeDocument) } : {}),
    });
  } catch {
    return mobileJson({ error: "오늘의 업무를 불러오지 못했습니다. 다시 시도하세요." }, 500);
  }
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
