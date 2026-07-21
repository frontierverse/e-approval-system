import Link from "next/link";
import { Suspense } from "react";
import { UserRole } from "@/generated/prisma/client";
import { logoutAction } from "@/app/login/actions";
import { AppMain } from "@/components/app-main";
import {
  AppNav,
  type NavigationGroup,
  type NavigationItem,
} from "@/components/app-nav";
import { NotificationBell } from "@/components/notification-bell";
import {
  ShellQuickStatusFallback,
  ShellQuickStatusLinks,
} from "@/components/shell-quick-status-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { UserIdentity } from "@/components/user-identity";
import { getShellDocumentCounts } from "@/lib/approval-queries";
import { getCurrentUser } from "@/lib/auth";
import { getBirthdayTopbarAlert } from "@/lib/birthday-alerts";
import { appName, organizationName } from "@/lib/branding";
import { getCafeItemExpirationAlert } from "@/lib/cafe-items";
import { getCurrentCommonScheduleTopbarData } from "@/lib/current-common-schedule";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { getNotificationSummary } from "@/lib/notifications";
import { getStaffLeaveBalanceLabel } from "@/lib/staff-leave";
import { getStaffVacationTopbarAlert } from "@/lib/staff-vacations";
import { getYouthDischargeTopbarAlert } from "@/lib/youth-discharge-alerts";

const approvalNavigationItems: NavigationItem[] = [
  { label: "오늘의 업무", href: "/" },
  { label: "기안작성", href: "/drafts/new" },
  { label: "임시저장함", href: "/drafts" },
  { label: "받은결재함", href: "/inbox" },
  { label: "제출 문서함", href: "/sent" },
  { label: "완료문서함", href: "/completed" },
];

const resourceNavigationItems: NavigationItem[] = [
  { label: "법인", href: "/resources?category=corporation" },
  { label: "카페", href: "/resources?category=cafe" },
  { label: "바자울", href: "/resources?category=bajaul" },
  { label: "교육", href: "/resources?category=education" },
];

const youthNavigationItems: NavigationItem[] = [
  { label: "청소년 명단", href: "/youth/roster" },
  { label: "공통 일정표", href: "/youth/common-schedule" },
  { label: "학습진도", href: "/youth/learning-progress" },
  { label: "규칙", href: "/youth/rules" },
];

const workScheduleNavigationItems: NavigationItem[] = [
  { label: "업무 일정", href: "/work-schedule" },
  { label: "카페 관리", href: "/work-schedule/cafe" },
  { label: "냉장고 관리", href: "/work-schedule/refrigerator" },
  { label: "도시락 현황", href: "/work-schedule/lunch-boxes" },
];

const companyNavigationItems: NavigationItem[] = [
  { label: "회사 정보", href: "/company-info" },
  { label: "입소 절차 안내", href: "/company-info/intake-process" },
];

const accountNavigationItems: NavigationItem[] = [
  { label: "내 계정", href: "/account" },
  { label: "알림", href: "/notifications" },
];

const adminNavigationItems: NavigationItem[] = [
  { label: "직원 정보", href: "/admin/staff" },
  { label: "관리 설정", href: "/admin" },
];
const fallbackNavigationGroups = getNavigationGroups(false);

export function AppShell({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
      >
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color:var(--surface)]/95 backdrop-blur">
        <div className="flex h-16 min-w-0 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label={`${appName} 홈`}
            className="flex min-w-0 flex-1 items-center rounded-md"
          >
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold leading-5">
                {appName}
              </span>
              <span className="block truncate text-xs text-[#697386]">
                {organizationName}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <Suspense fallback={<ShellUserFallback />}>
              <ShellUserSummary />
            </Suspense>
            <Suspense fallback={<NotificationBellFallback />}>
              <ShellNotificationBell userId={userId} />
            </Suspense>
            <ThemeToggle compact />
            <form action={logoutAction} className="shrink-0">
              <button
                type="submit"
                aria-label="로그아웃"
                className="inline-flex size-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] sm:h-10 sm:w-auto sm:rounded-md sm:px-3 sm:text-sm sm:font-semibold"
              >
                <svg
                  aria-hidden="true"
                  className="size-4 sm:hidden"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                </svg>
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </form>
          </div>
        </div>

        <div className="hidden lg:block" data-shell-topbar>
          <Suspense
            fallback={
              <AppNav groups={fallbackNavigationGroups} variant="topbar" />
            }
          >
            <ShellNavigation variant="topbar" />
          </Suspense>
        </div>

        <Suspense
          fallback={<AppNav groups={fallbackNavigationGroups} variant="mobile" />}
        >
          <ShellNavigation variant="mobile" />
        </Suspense>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:h-[calc(100vh-7.25rem)] lg:min-h-0 lg:overflow-hidden lg:px-8">
        <aside
          aria-label="주 메뉴 및 빠른 현황"
          className="scrollbar-stable hidden w-64 shrink-0 border-r border-[var(--border)] pr-5 lg:block lg:h-full lg:min-h-0 lg:overflow-y-auto"
        >
          <Suspense
            fallback={<AppNav groups={fallbackNavigationGroups} variant="desktop" />}
          >
            <ShellNavigation variant="desktop" />
          </Suspense>

          <div className="mt-8 border-t border-[#d9dee7] pt-5">
            <p className="text-xs font-semibold uppercase text-[#697386]">
              빠른 현황
            </p>
            <Suspense fallback={<ShellQuickStatusFallback />}>
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
  variant: "mobile" | "desktop" | "topbar";
}) {
  const [
    user,
    cafeExpirationAlert,
    birthdayAlert,
    currentScheduleData,
    dischargeAlert,
    vacationAlert,
  ] =
    await Promise.all([
      getCurrentUser(),
      variant === "topbar"
        ? getCafeItemExpirationAlert()
        : Promise.resolve(null),
      variant === "topbar" ? getBirthdayTopbarAlert() : Promise.resolve(null),
      variant === "topbar"
        ? getCurrentCommonScheduleTopbarData()
        : Promise.resolve(null),
      variant === "topbar"
        ? getYouthDischargeTopbarAlert()
        : Promise.resolve(null),
      variant === "topbar"
        ? getStaffVacationTopbarAlert()
        : Promise.resolve(null),
    ]);
  const groups = getNavigationGroups(user?.role === UserRole.ADMIN);

  return (
    <AppNav
      groups={groups}
      topbarCurrentScheduleAlert={
        currentScheduleData?.alert
          ? {
              ...currentScheduleData.alert,
              href: "/youth/common-schedule",
              label: "현재 일정",
              status: "active",
            }
          : {
              content: "현재 일정 없음",
              href: "/youth/common-schedule",
              label: "현재 일정",
              status: "empty",
              timeLabel: "",
              weekdayLabel: "",
            }
      }
      topbarCurrentScheduleItems={currentScheduleData?.schedules ?? []}
      topbarBirthdayAlert={
        birthdayAlert
          ? {
              ...birthdayAlert,
              label: "생일",
            }
          : {
              ddayLabel: "",
              items: [],
              label: "생일",
              personName: "예정 없음",
              status: "empty",
            }
      }
      topbarDischargeAlert={
        dischargeAlert
          ? {
              ...dischargeAlert,
              label: "퇴소",
              status: "active",
            }
          : {
              ddayLabel: "",
              items: [],
              label: "퇴소",
              status: "empty",
              youthName: "예정 없음",
            }
      }
      topbarVacationAlert={
        vacationAlert
          ? {
              ...vacationAlert,
              label: "휴가",
              status: "active",
            }
          : {
              ddayLabel: "",
              items: [],
              label: "휴가",
              staffName: "예정 없음",
              status: "empty",
            }
      }
      topbarAlert={
        cafeExpirationAlert
          ? {
              ...cafeExpirationAlert,
              label: "유통기한",
            }
          : {
              ddayLabel: "",
              href: "",
              itemName: "임박 없음",
              items: [],
              label: "유통기한",
              status: "empty",
            }
      }
      variant={variant}
    />
  );
}

function getNavigationGroups(isAdmin: boolean): NavigationGroup[] {
  return [
    {
      label: "전자결재",
      items: approvalNavigationItems,
    },
    {
      label: "자료실",
      items: resourceNavigationItems,
    },
    {
      label: "청소년 관리",
      items: youthNavigationItems,
    },
    {
      label: "업무 관리",
      items: workScheduleNavigationItems,
    },
    {
      label: "회사 정보",
      items: companyNavigationItems,
    },
    ...(isAdmin
      ? [
          {
            label: "관리",
            items: adminNavigationItems,
            align: "end" as const,
          },
        ]
      : []),
    {
      label: "내 정보",
      items: accountNavigationItems,
      align: "end",
    },
  ];
}

async function ShellUserSummary() {
  const user = await getCurrentUser();

  if (!user) {
    return <ShellUserFallback />;
  }

  const roleLabel = user.role === UserRole.ADMIN ? "관리자" : "사용자";
  const leaveBalance = await getStaffLeaveBalanceLabel(user.id);

  return (
    <>
      <Link
        href="/account"
        aria-label={`${user.name} 계정 열기`}
        className="hidden min-w-0 rounded-md sm:block"
      >
        <UserIdentity
          user={user}
          size="sm"
          meta={`${user.department.name} · ${user.position.name} · ${roleLabel} · 연차 ${leaveBalance}일`}
          nameClassName="text-[#16181d]"
        />
      </Link>
      <Link
        href="/account"
        aria-label={`${user.name} 계정 열기`}
        className="grid size-10 shrink-0 place-items-center rounded-full sm:hidden"
      >
        <UserAvatar user={user} />
      </Link>
    </>
  );
}

function ShellUserFallback() {
  return (
    <>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full border border-[#cfd6e3] bg-[#f7f9fc] text-sm font-semibold text-[#8a95a6]"
        aria-label="계정 정보 불러오는 중"
      >
        -
      </span>
      <div className="hidden text-left sm:block">
        <p className="text-sm font-medium text-[#8a95a6]">불러오는 중</p>
        <p className="text-xs text-[#a7b0bf]">계정 정보 확인 중</p>
      </div>
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
      className="relative grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[#8a95a6]"
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
  const todayDate = getKoreanDateValue();
  const items = [
    {
      label: "받은결재",
      value: documentCounts.inbox,
      href: "/inbox",
    },
    {
      label: "임시저장",
      value: documentCounts.drafts,
      href: "/drafts",
    },
    {
      label: "제출문서",
      value: documentCounts.sent,
      href: "/sent",
    },
    {
      label: "완료문서",
      value: documentCounts.completed,
      href: "/completed",
    },
    {
      label: "보관 검토",
      value: documentCounts.archiveReview,
      href: `/completed?archiveReview=review&dateFrom=${todayDate}&dateTo=${todayDate}`,
    },
  ];

  return <ShellQuickStatusLinks items={items} />;
}
