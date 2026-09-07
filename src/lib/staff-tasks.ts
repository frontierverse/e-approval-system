import "server-only";

import { UserStatus, type Prisma } from "@/generated/prisma/client";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getStaffTaskToday,
  normalizeStaffTaskStatus,
  type StaffTaskAssignee,
  type StaffTaskCounts,
  type StaffTaskEmployeeSummary,
  type StaffTaskItem,
  type StaffTaskPage,
  type StaffTaskStatus,
} from "@/lib/staff-tasks-core";

const staffTaskPageSize = 20;
const staffTaskSelect = {
  id: true,
  title: true,
  description: true,
  meetingTitle: true,
  dueDate: true,
  assigneeId: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  assignee: { select: { name: true, department: { select: { name: true } } } },
} as const satisfies Prisma.StaffTaskSelect;

const pendingOrder = [
  { dueDate: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.StaffTaskOrderByWithRelationInput[];

type StaffTaskPageOptions = { page?: number; status?: StaffTaskStatus };
type AdminStaffTaskOptions = StaffTaskPageOptions & { assigneeId?: string; query?: string };

export async function getMyStaffTasks(options: StaffTaskPageOptions = {}): Promise<StaffTaskPage> {
  const user = await requireUser();
  return getStaffTaskPage({ assigneeId: user.id }, options);
}

export async function getMyStaffTaskDashboard(): Promise<{ tasks: StaffTaskItem[]; counts: StaffTaskCounts }> {
  const user = await requireUser();
  const where = { assigneeId: user.id };
  const [pending, completed, counts] = await Promise.all([
    prisma.staffTask.findMany({
      where: { ...where, completedAt: null },
      orderBy: pendingOrder,
      take: 5,
      select: staffTaskSelect,
    }),
    prisma.staffTask.findMany({
      where: { ...where, completedAt: { not: null } },
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
  const [users, pending, completed, overdue] = await Promise.all([
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
    prisma.staffTask.groupBy({ by: ["assigneeId"], where: { AND: [where, { completedAt: null }] }, _count: { _all: true } }),
    prisma.staffTask.groupBy({ by: ["assigneeId"], where: { AND: [where, { completedAt: { not: null } }] }, _count: { _all: true } }),
    prisma.staffTask.groupBy({ by: ["assigneeId"], where: { AND: [where, { completedAt: null, dueDate: { lt: today } }] }, _count: { _all: true } }),
  ]);
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
  })).sort((left, right) => right.overdue - left.overdue || right.pending - left.pending);
}

export function eligibleStaffTaskAssigneeWhere(today: string): Prisma.UserWhereInput {
  return {
    status: UserStatus.ACTIVE,
    OR: [{ resignationDate: null }, { resignationDate: { gt: today } }],
  };
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

async function getStaffTaskPage(baseWhere: Prisma.StaffTaskWhereInput, options: StaffTaskPageOptions): Promise<StaffTaskPage> {
  const status = normalizeStaffTaskStatus(options.status);
  const today = getStaffTaskToday();
  const counts = await getStaffTaskCounts(baseWhere, today);
  const total = status === "all" ? counts.pending + counts.completed : counts[status];
  const totalPages = Math.max(1, Math.ceil(total / staffTaskPageSize));
  const requestedPage = Number.isSafeInteger(options.page) && (options.page ?? 0) > 0 ? options.page! : 1;
  const page = Math.min(requestedPage, totalPages);
  const statusWhere: Prisma.StaffTaskWhereInput =
    status === "completed" ? { completedAt: { not: null } } :
    status === "overdue" ? { completedAt: null, dueDate: { lt: today } } :
    status === "pending" ? { completedAt: null } : {};
  const tasks = await prisma.staffTask.findMany({
    where: { AND: [baseWhere, statusWhere] },
    orderBy: status === "completed"
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

async function getStaffTaskCounts(where: Prisma.StaffTaskWhereInput, today: string): Promise<StaffTaskCounts> {
  const [pending, completed, overdue] = await Promise.all([
    prisma.staffTask.count({ where: { AND: [where, { completedAt: null }] } }),
    prisma.staffTask.count({ where: { AND: [where, { completedAt: { not: null } }] } }),
    prisma.staffTask.count({ where: { AND: [where, { completedAt: null, dueDate: { lt: today } }] } }),
  ]);
  return { pending, completed, overdue };
}

function mapStaffTask(task: Prisma.StaffTaskGetPayload<{ select: typeof staffTaskSelect }>): StaffTaskItem {
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
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    version: task.version,
  };
}
