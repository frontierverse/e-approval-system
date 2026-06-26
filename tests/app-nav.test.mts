import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isActivePath,
  TopbarBirthdayAlertModalContent,
  TopbarCurrentScheduleLink,
  TopbarExpirationAlertModalContent,
  type NavigationTopbarBirthdayAlert,
  type NavigationTopbarCurrentScheduleAlert,
  type NavigationTopbarAlert,
} from "../src/components/app-nav.tsx";

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
          itemName: "우유",
        },
        {
          ddayLabel: "D-31",
          expirationDate: "2026-07-26",
          href: "/work-schedule/cafe?category=food&sort=expirationAsc&q=%EC%BB%A4%ED%94%BC",
          id: "cafe-item-002",
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

    assert.match(html, /임박 물품 목록/);
    assert.match(html, /유통기한이 31일 이하로 남은 식품 목록입니다\./);
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

    assert.match(html, /유통기한이 31일 이하로 남은 물품이 없습니다\./);
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
    assert.match(html, /생년월일 1990\.06\.30 · 생일 2026\.06\.30/);
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
