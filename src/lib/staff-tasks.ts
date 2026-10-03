import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  eligibleStaffTaskAssigneeWhere,
  getStaffTaskCounts,
  getStaffTaskHistoryForActor,
  getStaffTaskPage,
  mapStaffTask,
  pendingOrder,
  staffTaskSelect,
  type StaffTaskPageOptions,
} from "@/lib/staff-task-queries";
import {
  getStaffTaskToday,
  type StaffTaskAssignee,
  type StaffTaskCounts,
  type StaffTaskEmployeeSummary,
  type StaffTaskItem,
  type StaffTaskPage,
} from "@/lib/staff-tasks-core";

export { eligibleStaffTaskAssigneeWhere } from "@/lib/staff-task-queries";

type AdminStaffTaskOptions = StaffTaskPageOptions & { assigneeId?: string; query?: string };

export async function getStaffTaskHistory(id: string, requestedPage = 1) {
  const user = await requireUser();
  return getStaffTaskHistoryForActor(user, id, requestedPage);
}

export async function getMyStaffTasks(options: StaffTaskPageOptions = {}): Promise<StaffTaskPage> {
  const user = await requireUser();
  return getStaffTaskPage({ assigneeId: user.id }, options);
}

export async function getMyStaffTaskDashboard(): Promise<{ tasks: StaffTaskItem[]; counts: StaffTaskCounts }> {
  const user = await requireUser();
  const where = { assigneeId: user.id };
  const [pending, completed, counts] = await Promise.all([
    prisma.staffTask.findMany({
      where: { ...where, deletedAt: null, completedAt: null },
      orderBy: pendingOrder,
      take: 5,
      select: staffTaskSelect,
    }),
    prisma.staffTask.findMany({
      where: { ...where, deletedAt: null, completedAt: { not: null } },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      take: 3,
      select: staffTaskSelect,
    }),
    getStaffTaskCounts(where, getStaffTaskToday()),
  ]);
  return { tasks: [...pending, ...completed].map(mapStaffTask), counts };
}

export async function getAdminStaffTasks(options: AdminStaffTaskOptions = {}): Promise<StaffTaskPage> {
  await requireAdmin();
  return getStaffTaskPage(getAdminStaffTaskWhere(options), { ...options, status: options.status ?? "all" });
}

export async function getStaffTaskAssignees(): Promise<StaffTaskAssignee[]> {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: eligibleStaffTaskAssigneeWhere(getStaffTaskToday()),
    orderBy: [{ department: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, department: { select: { name: true } } },
  });
  return users.map((user) => ({ id: user.id, name: user.name, departmentName: user.department.name }));
}

export async function getStaffTaskEmployeeSummaries(
  options: Pick<AdminStaffTaskOptions, "assigneeId" | "query"> = {},
): Promise<StaffTaskEmployeeSummary[]> {
  await requireAdmin();
  const where = getAdminStaffTaskWhere(options);
  const today = getStaffTaskToday();
  const [users, pending, completed, overdue, deleted] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(options.assigneeId ? { id: options.assigneeId } : {}),
        OR: [
          // Include current employees without work and past employees with work.
          ...(options.query?.trim() ? [] : [eligibleStaffTaskAssigneeWhere(today)]),
          { assignedStaffTasks: { some: where } },
        ],
      },
      select: { id: true, name: true, department: { select: { name: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.staffTask.groupBy({ by: ["assigneeId"], where: { AND: [where, { deletedAt: null, completedAt: null }] }, _count: { _all: true } }),
    prisma.staffTask.groupBy({ by: ["assigneeId"], where: { AND: [where, { deletedAt: null, completedAt: { not: null } }] }, _count: { _all: true } }),
    prisma.staffTask.groupBy({ by: ["assigneeId"], where: { AND: [where, { deletedAt: null, completedAt: null, dueDate: { lt: today } }] }, _count: { _all: true } }),
    prisma.staffTask.groupBy({ by: ["assigneeId"], where: { AND: [where, { deletedAt: { not: null } }] }, _count: { _all: true } }),
  ]);
  const deletedById = new Map(deleted.map(row => [row.assigneeId, row._count._all]));
  const pendingById = new Map(pending.map((row) => [row.assigneeId, row._count._all]));
  const completedById = new Map(completed.map((row) => [row.assigneeId, row._count._all]));
  const overdueById = new Map(overdue.map((row) => [row.assigneeId, row._count._all]));
  return users.map((user) => ({
    assigneeId: user.id,
    assigneeName: user.name,
    departmentName: user.department.name,
    pending: pendingById.get(user.id) ?? 0,
    completed: completedById.get(user.id) ?? 0,
    overdue: overdueById.get(user.id) ?? 0,
    deleted: deletedById.get(user.id) ?? 0,
  })).sort((left, right) => right.overdue - left.overdue || right.pending - left.pending);
}

function getAdminStaffTaskWhere(options: Pick<AdminStaffTaskOptions, "assigneeId" | "query">): Prisma.StaffTaskWhereInput {
  const query = options.query?.trim().slice(0, 160);
  return {
    ...(options.assigneeId ? { assigneeId: options.assigneeId } : {}),
    ...(query ? {
      OR: [
        { title: { contains: query, mode: "insensitive" as const } },
        { description: { contains: query, mode: "insensitive" as const } },
        { meetingTitle: { contains: query, mode: "insensitive" as const } },
      ],
    } : {}),
  };
}
