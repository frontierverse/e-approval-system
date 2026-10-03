import "server-only";

import { UserStatus, UserRole, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getStaffTaskToday,
  normalizeStaffTaskStatus,
  type StaffTaskCounts,
  type StaffTaskItem,
  type StaffTaskPage,
  type StaffTaskStatus,
} from "@/lib/staff-tasks-core";

// Authenticated adapters supply the actor; this module has no cookie or redirect dependency.
export type StaffTaskReadClient = Pick<Prisma.TransactionClient, "staffTask" | "auditLog" | "user">;

export const staffTaskPageSize = 20;
export const staffTaskSelect = {
  id: true,
  title: true,
  description: true,
  meetingTitle: true,
  dueDate: true,
  assigneeId: true,
  completedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  assignee: { select: { name: true, department: { select: { name: true } } } },
} as const satisfies Prisma.StaffTaskSelect;

export const pendingOrder = [
  { dueDate: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.StaffTaskOrderByWithRelationInput[];

export type StaffTaskPageOptions = { page?: number; status?: StaffTaskStatus };
export async function getStaffTaskHistoryForActor(user: { id: string; role: UserRole }, id: string, requestedPage = 1, db: StaffTaskReadClient = prisma) {
  const task = await db.staffTask.findFirst({
    where: { id, ...(user.role === UserRole.ADMIN ? {} : { assigneeId: user.id }) },
    select: staffTaskSelect,
  });
  if (!task) return null;
  const where = { targetType: "StaffTask", targetId: task.id };
  const total = await db.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / staffTaskPageSize));
  const page = Math.min(totalPages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const logs = await db.auditLog.findMany({ where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: staffTaskPageSize, skip: (page - 1) * staffTaskPageSize,
    select: { id: true, createdAt: true, message: true, metadata: true, actor: { select: { name: true } } },
  });
  // Resolve only assignees actually present in this authorized task's history.
  const ids = new Set<string>();
  for (const log of logs) {
    const metadata = log.metadata as Record<string, unknown> | null;
    for (const key of ["before", "after"]) {
      const snapshot = metadata?.[key] as Record<string, unknown> | undefined;
      if (typeof snapshot?.assigneeId === "string") ids.add(snapshot.assigneeId);
    }
  }
  const assignees = ids.size ? await db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } }) : [];
  return { task: mapStaffTask(task), logs, assignees, page, totalPages, total, isAdmin: user.role === UserRole.ADMIN };
}

export function eligibleStaffTaskAssigneeWhere(today: string): Prisma.UserWhereInput {
  return {
    status: UserStatus.ACTIVE,
    OR: [{ resignationDate: null }, { resignationDate: { gt: today } }],
  };
}

export async function getStaffTaskPage(baseWhere: Prisma.StaffTaskWhereInput, options: StaffTaskPageOptions, db: StaffTaskReadClient = prisma, today = getStaffTaskToday()): Promise<StaffTaskPage> {
  const status = normalizeStaffTaskStatus(options.status);
  const counts = await getStaffTaskCounts(baseWhere, today, db);
  const total = status === "all" ? counts.pending + counts.completed : counts[status];
  const totalPages = Math.max(1, Math.ceil(total / staffTaskPageSize));
  const requestedPage = Number.isSafeInteger(options.page) && (options.page ?? 0) > 0 ? options.page! : 1;
  const page = Math.min(requestedPage, totalPages);
  const statusWhere: Prisma.StaffTaskWhereInput =
    status === "completed" ? { completedAt: { not: null } } :
    status === "overdue" ? { completedAt: null, dueDate: { lt: today } } :
    status === "pending" ? { completedAt: null } : {};
  const tasks = await db.staffTask.findMany({
    where: { AND: [baseWhere, statusWhere, { deletedAt: status === "deleted" ? { not: null } : null }] },
    orderBy: status === "deleted" ? [{ deletedAt: "desc" }, { id: "desc" }] : status === "completed"
      ? [{ completedAt: "desc" }, { id: "desc" }]
      : status === "all"
        ? [{ completedAt: { sort: "asc", nulls: "first" } }, ...pendingOrder]
        : pendingOrder,
    skip: (page - 1) * staffTaskPageSize,
    take: staffTaskPageSize,
    select: staffTaskSelect,
  });
  return { tasks: tasks.map(mapStaffTask), counts, page, totalPages, total };
}

export async function getStaffTaskCounts(where: Prisma.StaffTaskWhereInput, today: string, db: Pick<Prisma.TransactionClient, "staffTask"> = prisma): Promise<StaffTaskCounts> {
  const [pending, completed, overdue, deleted] = await Promise.all([
    db.staffTask.count({ where: { AND: [where, { deletedAt: null, completedAt: null }] } }),
    db.staffTask.count({ where: { AND: [where, { deletedAt: null, completedAt: { not: null } }] } }),
    db.staffTask.count({ where: { AND: [where, { deletedAt: null, completedAt: null, dueDate: { lt: today } }] } }),
    db.staffTask.count({ where: { AND: [where, { deletedAt: { not: null } }] } }),
  ]);
  return { pending, completed, overdue, deleted };
}

export function mapStaffTask(task: Prisma.StaffTaskGetPayload<{ select: typeof staffTaskSelect }>): StaffTaskItem {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    meetingTitle: task.meetingTitle,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee.name,
    departmentName: task.assignee.department.name,
    completedAt: task.completedAt?.toISOString() ?? null,
    deletedAt: task.deletedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    version: task.version,
  };
}
