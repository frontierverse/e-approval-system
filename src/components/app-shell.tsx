import Link from "next/link";
import { UserRole } from "@/generated/prisma/client";
import { logoutAction } from "@/app/login/actions";
import { AppNav, type NavigationItem } from "@/components/app-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { getShellDocumentCounts } from "@/lib/approval-queries";
import type { AuthUser } from "@/lib/auth";
import { appName, organizationName } from "@/lib/branding";
import { getNotificationSummary } from "@/lib/notifications";

const baseNavigationItems: NavigationItem[] = [
  { label: "홈", href: "/" },
  { label: "기안작성", href: "/drafts/new" },
  { label: "받은결재함", href: "/inbox" },
  { label: "제출 문서함", href: "/sent" },
  { label: "완료문서함", href: "/completed" },
  { label: "내 계정", href: "/account" },
];

const adminNavigationItem: NavigationItem = { label: "관리자", href: "/admin" };

export async function AppShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const isAdmin = user.role === UserRole.ADMIN;
  const navigationItems = isAdmin
    ? [...baseNavigationItems, adminNavigationItem]
    : baseNavigationItems;
  const [documentCounts, notificationSummary] = await Promise.all([
    getShellDocumentCounts(user.id),
    getNotificationSummary(user.id),
  ]);
  const roleLabel = isAdmin ? "관리자" : "사용자";

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#16181d]">
      <header className="sticky top-0 z-30 border-b border-[#d9dee7] bg-white/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#196b69] text-sm font-bold text-white">
              결
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold leading-5">
                {appName}
              </span>
              <span className="block text-xs text-[#697386]">
                {organizationName}
              </span>
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-[#697386]">
                {user.department.name} · {user.position.name} · {roleLabel}
              </p>
            </div>
            <NotificationBell
              initialUnreadCount={notificationSummary.unreadCount}
              initialNotifications={notificationSummary.notifications}
            />
            <ThemeToggle />
            <UserAvatar user={user} />
            <form action={logoutAction}>
              <button
                type="submit"
                className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>

        <AppNav items={navigationItems} variant="mobile" />
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="sticky top-24 hidden h-[calc(100vh-6.5rem)] w-64 shrink-0 self-start border-r border-[#d9dee7] pr-5 lg:block">
          <AppNav items={navigationItems} variant="desktop" />

          <div className="mt-8 border-t border-[#d9dee7] pt-5">
            <p className="text-xs font-semibold uppercase text-[#697386]">
              빠른 현황
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#697386]">받은결재</dt>
                <dd className="font-semibold text-[#16181d]">
                  {documentCounts.inbox}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#697386]">제출문서</dt>
                <dd className="font-semibold text-[#16181d]">
                  {documentCounts.sent}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#697386]">완료문서</dt>
                <dd className="font-semibold text-[#16181d]">
                  {documentCounts.completed}
                </dd>
              </div>
            </dl>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
