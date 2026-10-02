import type { NavigationGroup, NavigationItem } from "@/lib/app-nav-core";
import { dailyReportPath } from "@/lib/daily-report-core";

export const dailyReportNavigationItem: NavigationItem = { label: "일일 업무보고", href: dailyReportPath };

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
  { label: "개인 일정표", href: "/youth/personal-schedule" },
  { label: "학습진도", href: "/youth/learning-progress" },
  { label: "규칙", href: "/youth/rules" },
];

const workScheduleNavigationItems: NavigationItem[] = [
  { label: "업무 일정", href: "/work-schedule" },
  { label: "업무일지", href: "/work-schedule/work-log" },
  { label: "카페 관리", href: "/work-schedule/cafe" },
  { label: "냉장고 관리", href: "/work-schedule/refrigerator" },
  { label: "도시락 현황", href: "/work-schedule/lunch-boxes" },
];

const companyNavigationItems: NavigationItem[] = [
  { label: "회사 정보", href: "/company-info" },
  { label: "입소 절차 안내", href: "/company-info/intake-process" },
];

const accountNavigationItems: NavigationItem[] = [
  { label: "내 할 일", href: "/tasks" },
  { label: "내 계정", href: "/account" },
  { label: "알림", href: "/notifications" },
];

const adminNavigationItems: NavigationItem[] = [
  { label: "직원 할 일", href: "/admin/tasks" },
  { label: "직원 정보", href: "/admin/staff" },
  { label: "관리 설정", href: "/admin" },
];
export function getNavigationGroups(isAdmin: boolean): NavigationGroup[] {
  return [
    {
      label: "전자결재",
      items: approvalNavigationItems,
    },
    {
      label: dailyReportNavigationItem.label,
      items: [dailyReportNavigationItem],
    },
    {
      label: "업무 관리",
      items: workScheduleNavigationItems,
    },
    {
      label: "자료실",
      items: resourceNavigationItems,
    },
    {
      label: "청소년 관리",
      items: isAdmin
        ? [...youthNavigationItems, { label: "퇴소기록 관리", href: "/youth/retention" }]
        : youthNavigationItems,
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
