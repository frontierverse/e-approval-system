import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isActivePath,
  MobileMenuTrigger,
  MobileNavigationMenuContent,
  TopbarBirthdayAlertModalContent,
  TopbarCurrentScheduleLink,
  TopbarDdayAlertModalContent,
  TopbarExpirationAlertModalContent,
  TopbarFoodExpirationAlertModalContent,
  TopbarVacationAlertModalContent,
  TopbarWidgetGroup,
  type NavigationTopbarBirthdayAlert,
  type NavigationTopbarCurrentScheduleAlert,
  type NavigationTopbarAlert,
  type NavigationTopbarVacationAlert,
  type NavigationGroup,
} from "../src/components/app-nav.tsx";

const appShellSource = readFileSync(
  new URL("../src/components/app-shell.tsx", import.meta.url),
  "utf8",
);

describe("app navigation active paths", () => {
  test("keeps work schedule and cafe management sibling links exclusive", () => {
    assert.equal(
      isActivePath(
        "/work-schedule/cafe",
        "/work-schedule",
        "/work-schedule/cafe",
      ),
      false,
    );
    assert.equal(
      isActivePath(
        "/work-schedule/cafe",
        "/work-schedule/cafe",
        "/work-schedule/cafe",
      ),
      true,
    );
    assert.equal(
      isActivePath("/work-schedule", "/work-schedule", "/work-schedule"),
      true,
    );
  });

  test("matches cafe alert links by expected filters", () => {
    assert.equal(
      isActivePath(
        "/work-schedule/cafe",
        "/work-schedule/cafe?category=food&deadline=dueSoon&q=%EC%9A%B0%EC%9C%A0",
        "/work-schedule/cafe?category=food&deadline=dueSoon&q=%EC%9A%B0%EC%9C%A0",
      ),
      true,
    );
    assert.equal(
      isActivePath(
        "/work-schedule/cafe",
        "/work-schedule/cafe?category=food&deadline=dueSoon&q=%EC%9A%B0%EC%9C%A0",
        "/work-schedule/cafe?category=food&deadline=dueSoon&q=%EC%BB%A4%ED%94%BC",
      ),
      false,
    );
  });

  test("keeps notifications in the account navigation instead of the approval fallback", () => {
    assert.equal(isActivePath("/notifications", "/", "/notifications"), false);
    assert.equal(
      isActivePath("/notifications", "/notifications", "/notifications"),
      true,
    );
    assert.match(
      appShellSource,
      /const accountNavigationItems[\s\S]*?label: "알림", href: "\/notifications"/,
    );
  });

  test("keeps the topbar mounted in a desktop-only visual wrapper", () => {
    assert.match(
      appShellSource,
      /<div className="hidden lg:block" data-shell-topbar>[\s\S]*?<ShellNavigation variant="topbar" \/>/,
    );
  });

  test("renders an accessible mobile all-menu trigger", () => {
    const closedHtml = renderToStaticMarkup(
      React.createElement(MobileMenuTrigger, {
        onClick() {},
        open: false,
      }),
    );
    const openHtml = renderToStaticMarkup(
      React.createElement(MobileMenuTrigger, {
        onClick() {},
        open: true,
      }),
    );

    assert.match(closedHtml, /aria-expanded="false"/);
    assert.match(closedHtml, /aria-haspopup="dialog"/);
    assert.match(closedHtml, /aria-label="전체 메뉴 열기"/);
    assert.match(closedHtml, /h-11/);
    assert.match(closedHtml, />전체 메뉴</);
    assert.match(openHtml, /aria-expanded="true"/);
  });

  test("renders every navigation group and marks the active mobile menu item", () => {
    const groups: NavigationGroup[] = [
      {
        label: "전자결재",
        items: [
          { label: "오늘의 업무", href: "/" },
          { label: "기안작성", href: "/drafts/new" },
        ],
      },
      {
        label: "업무 관리",
        items: [
          { label: "업무 일정", href: "/work-schedule" },
          { label: "카페 관리", href: "/work-schedule/cafe" },
        ],
      },
      {
        label: "내 정보",
        items: [
          { label: "내 계정", href: "/account" },
          { label: "알림", href: "/notifications" },
        ],
        align: "end",
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(MobileNavigationMenuContent, {
        currentHref: "/notifications",
        descriptionId: "mobile-menu-description",
        groups,
        onClose() {},
        pathname: "/notifications",
        titleId: "mobile-menu-title",
      }),
    );

    assert.match(html, /id="mobile-menu-title"/);
    assert.match(html, /id="mobile-menu-description"/);
    assert.match(html, /aria-label="전체 메뉴"/);
    assert.match(html, /aria-labelledby="mobile-menu-title-group-0"/);
    assert.match(html, /aria-labelledby="mobile-menu-title-group-1"/);
    assert.match(html, /aria-labelledby="mobile-menu-title-group-2"/);
    assert.match(html, /오늘의 업무/);
    assert.match(html, /기안작성/);
    assert.match(html, /업무 일정/);
    assert.match(html, /카페 관리/);
    assert.match(html, /내 계정/);
    assert.match(
      html,
      /<a[^>]*aria-current="page"[^>]*href="\/notifications"/,
    );
    assert.match(html, /현재 영역/);
    assert.match(html, />현재</);
    assert.match(html, /aria-label="전체 메뉴 닫기"/);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  });

  test("renders the current common schedule topbar link", () => {
    const alert: NavigationTopbarCurrentScheduleAlert = {
      content: "공용 자습",
      href: "/youth/common-schedule",
      label: "현재 일정",
      status: "active",
      timeLabel: "09:00-10:30",
      weekdayLabel: "목",
    };
    const html = renderToStaticMarkup(
      React.createElement(TopbarCurrentScheduleLink, {
        alert,
      }),
    );

    assert.match(html, /href="\/youth\/common-schedule"/);
    assert.doesNotMatch(html, />현재 일정<\/span>/);
    assert.match(html, /공용 자습/);
    assert.match(html, /09:00-10:30/);
  });

  test("renders an empty current common schedule topbar link", () => {
    const alert: NavigationTopbarCurrentScheduleAlert = {
      content: "현재 일정 없음",
      href: "/youth/common-schedule",
      label: "현재 일정",
      status: "empty",
      timeLabel: "",
      weekdayLabel: "",
    };
    const html = renderToStaticMarkup(
      React.createElement(TopbarCurrentScheduleLink, {
        alert,
      }),
    );

    assert.match(html, /현재 일정 없음/);
    assert.doesNotMatch(html, /<span[^>]*>09:00-10:30<\/span>/);
  });

  test("groups topbar widgets under a single parent", () => {
    const currentScheduleAlert: NavigationTopbarCurrentScheduleAlert = {
      content: "공용 자습",
      href: "/youth/common-schedule",
      label: "현재 일정",
      status: "active",
      timeLabel: "09:00-10:30",
      weekdayLabel: "목",
    };
    const birthdayAlert: NavigationTopbarBirthdayAlert = {
      ddayLabel: "D-5",
      items: [],
      label: "생일",
      personName: "김민지",
    };
    const expirationAlert: NavigationTopbarAlert = {
      ddayLabel: "D-3",
      href: "/work-schedule/cafe",
      itemName: "우유",
      items: [],
      label: "유통기한",
    };
    const vacationAlert: NavigationTopbarVacationAlert = {
      ddayLabel: "D-4",
      items: [],
      label: "휴가",
      staffName: "박서연",
    };
    const html = renderToStaticMarkup(
      React.createElement(TopbarWidgetGroup, {
        birthdayAlert,
        currentScheduleAlert,
        expirationAlert,
        vacationAlert,
      }),
    );

    assert.match(html, /role="group"/);
    assert.match(html, /aria-label="상단 위젯"/);
    assert.match(html, /ml-auto/);
    assert.match(html, /공용 자습/);
    assert.match(html, /박서연/);
    assert.match(html, /김민지/);
    assert.match(html, /우유/);
    assert.match(html, /식품/);
    assert.doesNotMatch(html, /topbar-widget-due/);
  });

  test("marks D-Day topbar widgets for blinking", () => {
    const birthdayAlert: NavigationTopbarBirthdayAlert = {
      ddayLabel: "D-Day",
      items: [
        {
          birthdayDate: "2026-06-29",
          birthDate: "1990-06-29",
          ddayLabel: "D-Day",
          detailLabel: "바자울 / 팀장",
          id: "staff-001",
          name: "김민지",
          typeLabel: "직원",
        },
      ],
      label: "생일",
      personName: "김민지",
    };
    const expirationAlert: NavigationTopbarAlert = {
      ddayLabel: "D-Day",
      href: "/work-schedule/cafe",
      itemName: "우유",
      items: [
        {
          ddayLabel: "D-Day",
          expirationDate: "2026-06-29",
          href: "/work-schedule/cafe?category=food&sort=expirationAsc&q=%EC%9A%B0%EC%9C%A0",
          id: "cafe-item-001",
          isHeld: true,
          itemName: "우유",
        },
      ],
      label: "유통기한",
    };
    const vacationAlert: NavigationTopbarVacationAlert = {
      ddayLabel: "D-Day",
      items: [
        {
          date: "2026-06-29",
          ddayLabel: "D-Day",
          detailLabel: "바자울 / 팀장",
          id: "vacation-001",
          staffName: "박서연",
          vacationLabel: "연차",
          workScheduleHref: "/work-schedule?month=2026-06",
        },
      ],
      label: "휴가",
      staffName: "박서연",
    };
    const html = renderToStaticMarkup(
      React.createElement(TopbarWidgetGroup, {
        birthdayAlert,
        expirationAlert,
        vacationAlert,
      }),
    );

    assert.match(html, /topbar-widget-due topbar-widget-due-birthday/);
    assert.match(html, /topbar-widget-due topbar-widget-due-expiration/);
    assert.match(html, /topbar-widget-due topbar-widget-due-vacation/);
    assert.match(html, /보류/);
  });

  test("renders D-Day birthday, vacation and expiration items in one modal", () => {
    const birthdayItems: NavigationTopbarBirthdayAlert["items"] = [
      {
        birthdayDate: "2026-06-29",
        birthDate: "1990-06-29",
        ddayLabel: "D-Day",
        detailLabel: "바자울 / 팀장",
        id: "staff-001",
        name: "김민지",
        typeLabel: "직원",
      },
    ];
    const expirationItems: NavigationTopbarAlert["items"] = [
      {
        ddayLabel: "D-Day",
        expirationDate: "2026-06-29",
        href: "/work-schedule/cafe?category=food&sort=expirationAsc&q=%EC%9A%B0%EC%9C%A0",
        id: "cafe-item-001",
        isHeld: true,
        itemName: "우유",
      },
    ];
    const foodExpirationItems = [
      {
        ddayLabel: "D-Day",
        expirationDate: "2026-06-29",
        href: "/work-schedule/refrigerator",
        id: "refrigerator-item-001",
        itemName: "샐러드",
        locationLabel: "바자울 1",
      },
    ];
    const vacationItems: NavigationTopbarVacationAlert["items"] = [
      {
        date: "2026-06-29",
        ddayLabel: "D-Day",
        detailLabel: "바자울 / 팀장",
        id: "vacation-001",
        staffName: "박서연",
        vacationLabel: "연차",
        workScheduleHref: "/work-schedule?month=2026-06",
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(TopbarDdayAlertModalContent, {
        birthdayItems,
        descriptionId: "description-id",
        expirationItems,
        foodExpirationItems,
        onClose: () => undefined,
        titleId: "title-id",
        vacationItems,
      }),
    );

    assert.match(html, /오늘 확인할 알림/);
    assert.match(html, /오늘 생일/);
    assert.match(html, /김민지/);
    assert.match(html, /오늘 휴가/);
    assert.match(html, /박서연/);
    assert.match(html, /휴가일 2026\.06\.29 \(월\)/);
    assert.match(html, /유통기한 도래·경과/);
    assert.match(html, /우유/);
    assert.match(html, /dark:!text-black/);
    assert.match(html, /보류/);
    assert.match(html, /식품 유통기한 도래·경과/);
    assert.match(html, /샐러드/);
    assert.match(html, /D-Day/);
  });

  test("renders expired food in the login confirmation modal", () => {
    const html = renderToStaticMarkup(
      React.createElement(TopbarDdayAlertModalContent, {
        birthdayItems: [],
        descriptionId: "description-id",
        expirationItems: [
          {
            ddayLabel: "D+2",
            expirationDate: "2026-06-27",
            href: "/work-schedule/cafe",
            id: "cafe-item-expired",
            isHeld: true,
            itemName: "우유",
          },
        ],
        foodExpirationItems: [
          {
            ddayLabel: "D+1",
            expirationDate: "2026-06-28",
            href: "/work-schedule/refrigerator",
            id: "refrigerator-item-expired",
            itemName: "샐러드",
            locationLabel: "바자울 1",
          },
        ],
        onClose: () => undefined,
        titleId: "title-id",
      }),
    );

    assert.match(html, /아직 조치되지 않은 유통기한 경과 항목/);
    assert.match(html, /D[+]2/);
    assert.match(html, /D[+]1/);
    assert.match(html, /보류/);
    assert.ok(html.includes("bg-[#fff1f1]"));
  });

  test("renders vacation alert modal items", () => {
    const html = renderToStaticMarkup(
      React.createElement(TopbarVacationAlertModalContent, {
        alert: {
          ddayLabel: "D-5",
          items: [
            {
              date: "2026-07-04",
              ddayLabel: "D-5",
              detailLabel: "바자울 / 팀장",
              id: "vacation-001",
              staffName: "박서연",
              vacationLabel: "연차",
              workScheduleHref: "/work-schedule?month=2026-07",
            },
          ],
          label: "휴가",
          staffName: "박서연",
        },
        descriptionId: "description-id",
        onClose: () => undefined,
        titleId: "title-id",
      }),
    );

    assert.match(html, /예정된 승인 휴가/);
    assert.match(html, /31일 이내에 사용 예정인 휴가입니다\./);
    assert.match(html, /박서연/);
    assert.match(html, /연차/);
    assert.match(html, /휴가일 2026\.07\.04 \(토\)/);
    assert.match(html, /href="\/work-schedule\?month=2026-07"/);
  });

  test("renders refrigerator food expiration alert modal items", () => {
    const html = renderToStaticMarkup(
      React.createElement(TopbarFoodExpirationAlertModalContent, {
        alert: {
          ddayLabel: "D-2",
          itemName: "샐러드",
          items: [
            {
              ddayLabel: "D-2",
              expirationDate: "2026-07-01",
              href: "/work-schedule/refrigerator",
              id: "refrigerator-item-001",
              itemName: "샐러드",
              locationLabel: "바자울 1",
            },
          ],
          label: "식품 유통기한",
        },
        descriptionId: "description-id",
        onClose: () => undefined,
        titleId: "title-id",
      }),
    );

    assert.match(html, /냉장고 식품 유통기한/);
    assert.match(html, /바자울 1/);
    assert.match(html, /샐러드/);
    assert.match(html, /2026\.07\.01/);
  });

  test("renders cafe expiration alert modal items", () => {
    const alert: NavigationTopbarAlert = {
      ddayLabel: "D-5",
      href: "/work-schedule/cafe?category=food&deadline=dueSoon&q=%EC%9A%B0%EC%9C%A0",
      itemName: "우유",
      label: "유통기한",
      items: [
        {
          ddayLabel: "D-5",
          expirationDate: "2026-06-30",
          href: "/work-schedule/cafe?category=food&sort=expirationAsc&q=%EC%9A%B0%EC%9C%A0",
          id: "cafe-item-001",
          isHeld: false,
          itemName: "우유",
        },
        {
          ddayLabel: "D-31",
          expirationDate: "2026-07-26",
          href: "/work-schedule/cafe?category=food&sort=expirationAsc&q=%EC%BB%A4%ED%94%BC",
          id: "cafe-item-002",
          isHeld: true,
          itemName: "커피 원두",
        },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(TopbarExpirationAlertModalContent, {
        alert,
        descriptionId: "description-id",
        onClose: () => undefined,
        titleId: "title-id",
      }),
    );

    assert.match(html, /유통기한 조치 필요 물품/);
    assert.match(html, /유통기한이 지난 항목과 31일 이내에 도래하는 식품 목록입니다\./);
    assert.match(html, /PDF 출력 · 15일 이내/);
    assert.match(
      html,
      /href="\/work-schedule\/cafe\/expiring-foods\/print"/,
    );
    assert.match(html, /target="_blank"/);
    assert.match(html, /bg-\[#196b69\]/);
    assert.match(html, /우유/);
    assert.match(html, /2026\.06\.30/);
    assert.match(html, /D-31/);
    assert.match(html, /보류/);
    assert.match(
      html,
      /href="\/work-schedule\/cafe\?category=food&amp;sort=expirationAsc&amp;q=%EC%BB%A4%ED%94%BC"/,
    );
  });

  test("renders an empty cafe expiration alert modal state", () => {
    const html = renderToStaticMarkup(
      React.createElement(TopbarExpirationAlertModalContent, {
        alert: {
          ddayLabel: "",
          href: "",
          itemName: "임박 없음",
          items: [],
          label: "유통기한",
          status: "empty",
        },
        descriptionId: "description-id",
        onClose: () => undefined,
        titleId: "title-id",
      }),
    );

    assert.match(
      html,
      /유통기한이 지난 항목 또는 31일 이내에 도래하는 물품이 없습니다\./,
    );
  });

  test("renders birthday alert modal items", () => {
    const alert: NavigationTopbarBirthdayAlert = {
      ddayLabel: "D-5",
      label: "생일",
      personName: "김민지",
      items: [
        {
          birthdayDate: "2026-06-30",
          birthDate: "1990-06-30",
          ddayLabel: "D-5",
          detailLabel: "바자울 / 팀장",
          id: "staff-001",
          name: "김민지",
          typeLabel: "직원",
        },
        {
          birthdayDate: "2026-07-26",
          birthDate: "2009-07-26",
          ddayLabel: "D-31",
          detailLabel: "입소중 청소년",
          id: "youth-001",
          name: "이하늘",
          typeLabel: "입소중",
        },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(TopbarBirthdayAlertModalContent, {
        alert,
        descriptionId: "description-id",
        onClose: () => undefined,
        titleId: "title-id",
      }),
    );

    assert.match(html, /다가오는 생일/);
    assert.match(
      html,
      /직원과 입소중 청소년 중 31일 이내에 생일이 있는 대상입니다\./,
    );
    assert.match(html, /김민지/);
    assert.match(html, /바자울 \/ 팀장/);
    assert.match(html, /생년월일 1990\.06\.30 · 생일 2026\.06\.30 \(화\)/);
    assert.match(html, /이하늘/);
    assert.match(html, /D-31/);
    assert.match(html, /href="\/youth\/roster"/);
    assert.match(html, /청소년 명단으로 이동/);
  });

  test("renders an empty birthday alert modal state", () => {
    const html = renderToStaticMarkup(
      React.createElement(TopbarBirthdayAlertModalContent, {
        alert: {
          ddayLabel: "",
          items: [],
          label: "생일",
          personName: "예정 없음",
          status: "empty",
        },
        descriptionId: "description-id",
        onClose: () => undefined,
        titleId: "title-id",
      }),
    );

    assert.match(
      html,
      /31일 이내에 생일이 있는 직원 또는 입소중 청소년이 없습니다\./,
    );
  });
});
