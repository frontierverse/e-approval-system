import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { activePushUserWhere, queueStaffPushEvent } from "@/lib/mobile-push-events";
import { koreanPushClock, isScheduleReminderDue, scheduleStart } from "@/lib/mobile-push-events-core";
import { getWorkLogReminderDecision } from "@/lib/work-log-reminder-core";

// One summary per employee/category/day. The unique event key also handles
// overlapping scheduler runs and response-loss retries without extra alerts.
export async function createDueStaffPushEvents(now = new Date(), db: Pick<typeof prisma, "$transaction"> = prisma) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const clock = koreanPushClock(now), dailyWindow = clock.minute >= 9 * 60 && clock.minute < 18 * 60;
    let scheduled = 0;
    const workLogReminder = getWorkLogReminderDecision(now);
    if (workLogReminder.shouldSend) {
      // All active employees are reminded once per Korean working date,
      // regardless of whether they have already saved today's work log.
      await queueStaffPushEvent(tx, {
        eventKey: `work-log-reminder:${workLogReminder.date}`, kind: "WORK_LOG_REMINDER",
        targetId: workLogReminder.date, now,
        expiresAt: new Date(`${workLogReminder.date}T10:00:00+09:00`), deferDispatch: true,
      });
      scheduled++;
    }
    if (dailyWindow) {
      const tasks = await tx.staffTask.findMany({ where: { deletedAt: null, completedAt: null, dueDate: { lte: clock.date }, assignee: { ...activePushUserWhere(now), mobileSessions: { some: { expiresAt: { gt: now }, pushSubscription: { isNot: null } } } } }, select: { assigneeId: true, dueDate: true } });
      for (const kind of ["TASK_DUE", "TASK_OVERDUE"] as const) {
        const recipients = [...new Set(tasks.filter(task => kind === "TASK_DUE" ? task.dueDate === clock.date : !!task.dueDate && task.dueDate < clock.date).map(task => task.assigneeId))];
        if (recipients.length) { await queueStaffPushEvent(tx, { eventKey: `${kind}:${clock.date}`, kind, targetId: "tasks", userIds: recipients, now, expiresAt: clock.endOfWork, deferDispatch: true }); scheduled++; }
      }
      const steps = await tx.approvalStep.findMany({ where: { status: "PENDING", updatedAt: { lte: new Date(now.getTime() - 24 * 60 * 60_000) }, document: { status: { in: ["SUBMITTED", "IN_PROGRESS"] } }, approver: activePushUserWhere(now) }, select: { approverId: true } });
      if (steps.length) { await queueStaffPushEvent(tx, { eventKey: `approval-waiting:${clock.date}`, kind: "APPROVAL_REMINDER", targetId: "approvals", userIds: [...new Set(steps.map(step => step.approverId))], now, expiresAt: clock.endOfWork, deferDispatch: true }); scheduled++; }
    }
    const schedules = await tx.workSchedule.findMany({ where: { scheduleDate: clock.date, startMinute: { gt: clock.minute, lte: clock.minute + 30 } }, select: { id: true, scheduleDate: true, startMinute: true, updatedAt: true } });
    for (const schedule of schedules) {
      if (!isScheduleReminderDue(now, schedule.scheduleDate, schedule.startMinute)) continue;
      await queueStaffPushEvent(tx, { eventKey: `schedule-reminder:${schedule.id}:${schedule.scheduleDate}:${schedule.startMinute}:${schedule.updatedAt.toISOString()}`, kind: "WORK_SCHEDULE_REMINDER", targetId: schedule.id, targetVersion: schedule.updatedAt.toISOString(), now, expiresAt: scheduleStart(schedule.scheduleDate, schedule.startMinute), deferDispatch: true }); scheduled++;
    }
    return { scheduled };
  }, { timeout: 20_000 });
}
