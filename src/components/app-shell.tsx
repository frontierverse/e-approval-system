import Link from "next/link";
import { Suspense } from "react";
import { UserRole } from "@/generated/prisma/client";
import { logoutAction } from "@/app/login/actions";
import { AppMain } from "@/components/app-main";
import { AppNav, type NavigationItem } from "@/components/app-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { getShellDocumentCounts } from "@/lib/approval-queries";
import { getCurrentUser } from "@/lib/auth";
import { appName, organizationName } from "@/lib/branding";
import { getNotificationSummary } from "@/lib/notifications";

const baseNavigationItems: NavigationItem[] = [
  { label: "홈", href: "/" },
  { label: "기안작성", href: "/drafts/new" },
  { label: "임시저장함", href: "/drafts" },
  { label: "받은결재함", href: "/inbox" },
  { label: "제출 문서함", href: "/sent" },
  { label: "완료문서함", href: "/completed" },
  { label: "내 계정", href: "/account" },
];

const adminNavigationItem: NavigationItem = { label: "관리자", href: "/admin" };

export function AppShell({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
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
            <Suspense fallback={<ShellUserFallback />}>
              <ShellUserSummary />
            </Suspense>
            <Suspense fallback={<NotificationBellFallback />}>
              <ShellNotificationBell userId={userId} />
            </Suspense>
            <ThemeToggle />
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

        <Suspense
          fallback={<AppNav items={baseNavigationItems} variant="mobile" />}
        >
          <ShellNavigation variant="mobile" />
        </Suspense>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:h-[calc(100vh-4rem)] lg:min-h-0 lg:overflow-hidden lg:px-8">
        <aside className="scrollbar-stable hidden w-64 shrink-0 border-r border-[#d9dee7] pr-5 lg:block lg:h-full lg:min-h-0 lg:overflow-y-auto">
          <Suspense
            fallback={<AppNav items={baseNavigationItems} variant="desktop" />}
          >
            <ShellNavigation variant="desktop" />
          </Suspense>

          <div className="mt-8 border-t border-[#d9dee7] pt-5">
            <p className="text-xs font-semibold uppercase text-[#697386]">
              빠른 현황
            </p>
            <Suspense fallback={<ShellDocumentCountsFallback />}>
              <ShellDocumentCounts userId={userId} />
            </Suspense>
          </div>
        </aside>

        <AppMain>{children}</AppMain>
      </div>
    </div>
  );
}

async function ShellNavigation({
  variant,
}: {
  variant: "mobile" | "desktop";
}) {
  const user = await getCurrentUser();
  const items =
    user?.role === UserRole.ADMIN
      ? [...baseNavigationItems, adminNavigationItem]
      : baseNavigationItems;

  return <AppNav items={items} variant={variant} />;
}

async function ShellUserSummary() {
  const user = await getCurrentUser();

  if (!user) {
    return <ShellUserFallback />;
  }

  const roleLabel = user.role === UserRole.ADMIN ? "관리자" : "사용자";

  return (
    <>
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-xs text-[#697386]">
          {user.department.name} · {user.position.name} · {roleLabel}
        </p>
      </div>
      <UserAvatar user={user} />
    </>
  );
}

function ShellUserFallback() {
  return (
    <>
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-[#8a95a6]">불러오는 중</p>
        <p className="text-xs text-[#a7b0bf]">계정 정보 확인 중</p>
      </div>
      <span
        className="grid size-9 place-items-center rounded-full border border-[#cfd6e3] bg-[#f7f9fc] text-sm font-semibold text-[#8a95a6]"
        aria-label="계정 정보 불러오는 중"
      >
        -
      </span>
    </>
  );
}

async function ShellNotificationBell({ userId }: { userId: string }) {
  const notificationSummary = await getNotificationSummary(userId);

  return (
    <NotificationBell
      initialUnreadCount={notificationSummary.unreadCount}
      initialNotifications={notificationSummary.notifications}
    />
  );
}

function NotificationBellFallback() {
  return (
    <button
      type="button"
      aria-label="알림 불러오는 중"
      disabled
      className="relative grid size-9 place-items-center rounded-full border border-[#cfd6e3] bg-white text-[#8a95a6]"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>
  );
}

async function ShellDocumentCounts({ userId }: { userId: string }) {
  const documentCounts = await getShellDocumentCounts(userId);

  return (
    <dl className="mt-3 space-y-2 text-sm">
      <ShellDocumentCount label="받은결재" value={documentCounts.inbox} />
      <ShellDocumentCount label="임시저장" value={documentCounts.drafts} />
      <ShellDocumentCount label="제출문서" value={documentCounts.sent} />
      <ShellDocumentCount label="완료문서" value={documentCounts.completed} />
    </dl>
  );
}

function ShellDocumentCountsFallback() {
  return (
    <dl className="mt-3 space-y-2 text-sm" aria-label="빠른 현황 불러오는 중">
      <ShellDocumentCount label="받은결재" value="-" />
      <ShellDocumentCount label="임시저장" value="-" />
      <ShellDocumentCount label="제출문서" value="-" />
      <ShellDocumentCount label="완료문서" value="-" />
    </dl>
  );
}

function ShellDocumentCount({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#697386]">{label}</dt>
      <dd className="font-semibold text-[#16181d]">{value}</dd>
    </div>
  );
}
