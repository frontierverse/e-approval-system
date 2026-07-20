import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument, PageSizes } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CafeItemChangeLogTable } from "../src/components/cafe-item-change-log-table.tsx";
import { CafeItemInventoryPrintLink } from "../src/components/cafe-item-inventory-print-link.tsx";
import {
  CafeItemHeldItemsModal,
  CafeItemList,
} from "../src/components/cafe-item-list.tsx";
import { createCafeItemInventoryPdf } from "../src/lib/cafe-item-inventory-pdf.ts";
import { createCafeExpiringFoodsPdf } from "../src/lib/cafe-item-expiration-pdf.ts";
import {
  createCafeItemDueSoonHref,
  createCafeItemExpirationAlert,
  createCafeItemExpirationSearchHref,
  createCafeItemExpiringFoodPrintHref,
  createCafeItemInventoryPrintHref,
  formatCafeItemDateValue,
  getCafeItemUsageDday,
  normalizeCafeItemSort,
  type CafeItemChangeLogPage,
  type CafeItem,
  type CafeItemInventoryItem,
  type CafeItemPage,
} from "../src/lib/cafe-items-core.ts";

const cafeItems: CafeItem[] = [
  {
    id: "cafe-item-001",
    name: "우유",
    category: "food",
    purchasedAt: "2026-06-01",
    priceWon: 3200,
    purchaseReason: "라떼 재고 보충",
    expirationDate: "2026-07-24",
    expirationHoldReason: null,
    createdAt: "2026-06-24T00:00:00.000Z",
  },
  {
    id: "cafe-item-002",
    name: "청소용 장갑",
    category: "consumable",
    purchasedAt: "2026-03-16",
    priceWon: null,
    purchaseReason: null,
    expirationDate: null,
    expirationHoldReason: null,
    createdAt: "2026-06-23T00:00:00.000Z",
  },
];

const heldCafeItem: CafeItem = {
  ...cafeItems[0],
  id: "cafe-item-held",
  name: "보류 쿠키",
  expirationDate: "2026-06-20",
  expirationHoldReason: "폐기 전 재고 확인을 위해 임시 보관",
};

const itemPage: CafeItemPage = {
  expiredFoodCount: 2,
  filters: {
    category: "all",
    deadline: "all",
    page: 1,
    query: "",
    sort: "latest",
  },
  heldItems: [heldCafeItem],
  items: cafeItems,
  page: 1,
  pageSize: 7,
  total: 10,
  totalPages: 2,
};

const changeLogPage: CafeItemChangeLogPage = {
  actors: [
    {
      id: "user-001",
      name: "최윤서",
      email: "yunseo@example.com",
    },
  ],
  filters: {
    action: "update",
    actorId: "user-001",
    page: 2,
    query: "우유",
  },
  logs: [
    {
      id: "cafe-log-001",
      actionType: "update",
      actor: {
        id: "user-001",
        name: "최윤서",
        email: "yunseo@example.com",
      },
      createdAt: "2026-06-24T09:30:00.000Z",
      itemId: "cafe-item-001",
      itemName: "우유",
      message: "우유 물품 정보를 수정했습니다.",
    },
  ],
  page: 2,
  pageSize: 5,
  total: 7,
  totalPages: 2,
};

describe("cafe items", () => {
  test("formats food usage d-day from the expiration date", () => {
    assert.deepEqual(
      getCafeItemUsageDday(cafeItems[0], "2026-06-24"),
      {
        basisLabel: "유통기한 기준",
        label: "D-30",
        status: "soon",
      },
    );
  });

  test("marks expired food with elapsed d-day", () => {
    assert.deepEqual(
      getCafeItemUsageDday(cafeItems[0], "2026-07-26"),
      {
        basisLabel: "유통기한 기준",
        label: "D+2",
        status: "expired",
      },
    );
  });

  test("formats non-food usage d-day from the purchase date", () => {
    assert.deepEqual(
      getCafeItemUsageDday(cafeItems[1], "2026-06-24"),
      {
        basisLabel: "구매일 기준",
        label: "D+100",
        status: "soon",
      },
    );
  });

  test("formats database date values from Date objects and strings", () => {
    assert.equal(
      formatCafeItemDateValue(new Date(Date.UTC(2026, 5, 24))),
      "2026-06-24",
    );
    assert.equal(formatCafeItemDateValue("2026-07-24"), "2026-07-24");
  });

  test("creates due-soon cafe item links with item filters", () => {
    assert.equal(
      createCafeItemDueSoonHref("우유"),
      "/work-schedule/cafe?category=food&deadline=dueSoon&q=%EC%9A%B0%EC%9C%A0",
    );
    assert.equal(
      createCafeItemDueSoonHref(" "),
      "/work-schedule/cafe?category=food&deadline=dueSoon",
    );
  });

  test("creates cafe item expiration search links", () => {
    assert.equal(
      createCafeItemExpirationSearchHref("우유"),
      "/work-schedule/cafe?category=food&sort=expirationAsc&q=%EC%9A%B0%EC%9C%A0",
    );
    assert.equal(
      createCafeItemExpirationSearchHref(" "),
      "/work-schedule/cafe?category=food&sort=expirationAsc",
    );
  });

  test("moves held items behind active expiration alerts while preserving each group order", () => {
    const alert = createCafeItemExpirationAlert(
      [
        {
          id: "normal-early",
          name: "먼저 만료되는 일반 식품",
          expirationDate: "2026-07-18",
          expirationHoldReason: null,
        },
        {
          id: "held-early",
          name: "먼저 만료되는 보류 식품",
          expirationDate: "2026-07-20",
          expirationHoldReason: "확인 필요",
        },
        {
          id: "held-late",
          name: "나중에 만료되는 보류 식품",
          expirationDate: "2026-07-22",
          expirationHoldReason: "담당자 확인 필요",
        },
        {
          id: "normal-late",
          name: "나중에 만료되는 일반 식품",
          expirationDate: "2026-07-24",
          expirationHoldReason: null,
        },
      ],
      "2026-07-17",
    );

    assert.ok(alert);
    assert.equal(alert.itemName, "먼저 만료되는 일반 식품");
    assert.equal(alert.ddayLabel, "D-1");
    assert.deepEqual(
      alert.items.map((item) => item.id),
      ["normal-early", "normal-late", "held-early", "held-late"],
    );
    assert.deepEqual(
      alert.items.map((item) => item.isHeld),
      [false, false, true, true],
    );
  });

  test("creates cafe item expiring food print links", () => {
    assert.equal(
      createCafeItemExpiringFoodPrintHref(),
      "/work-schedule/cafe/expiring-foods/print",
    );
  });

  test("creates a prominent full inventory PDF link", () => {
    assert.equal(
      createCafeItemInventoryPrintHref(),
      "/work-schedule/cafe/items/print",
    );

    const html = renderToStaticMarkup(
      React.createElement(CafeItemInventoryPrintLink),
    );

    assert.match(html, /전체 물품 PDF 출력/);
    assert.match(html, /href="\/work-schedule\/cafe\/items\/print"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /전체 카페 물품 상세 목록을 PDF로 출력\(새 창\)/);
    assert.match(html, /h-11/);
    assert.match(html, /bg-\[var\(--brand\)\]/);
  });

  test("normalizes cafe item sort values", () => {
    assert.equal(normalizeCafeItemSort("expirationAsc"), "expirationAsc");
    assert.equal(normalizeCafeItemSort("expirationDesc"), "expirationDesc");
    assert.equal(normalizeCafeItemSort("latest"), "latest");
    assert.equal(normalizeCafeItemSort("createdAt"), "latest");
    assert.equal(normalizeCafeItemSort(undefined), "latest");
  });

  test("renders cafe item filters, inventory rows, and pagination", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemList, {
        itemPage,
        today: "2026-06-24",
      }),
    );
    const purchaseDateHeaderIndex = html.indexOf(
      '<th class="w-[9rem] px-6 py-3.5">구매일</th>',
    );
    const categoryHeaderIndex = html.indexOf(
      '<th class="w-[8rem] px-6 py-3.5">종류</th>',
    );

    assert.match(html, /물품 목록/);
    assert.match(html, /10건 중 1-7건 표시/);
    assert.match(html, /유통기한 15일 이내 PDF/);
    assert.match(
      html,
      /href="\/work-schedule\/cafe\/expiring-foods\/print"/,
    );
    assert.match(html, /target="_blank"/);
    assert.match(html, /border-\[var\(--border-strong\)\]/);
    assert.match(html, /h-11/);
    assert.match(html, /sm:ml-auto/);
    assert.match(html, /유통기한 경과 식품/);
    assert.match(html, /2개/);
    assert.match(html, /보류 처리 1개/);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(
      html,
      /href="\/work-schedule\/cafe\?category=food&amp;deadline=expired"/,
    );
    assert.match(html, /name="q"/);
    assert.match(html, /name="category"/);
    assert.match(html, /name="deadline"/);
    assert.match(html, /aria-label="유통기한 오름차순 정렬"/);
    assert.match(html, /aria-sort="none"/);
    assert.match(html, /href="\/work-schedule\/cafe\?sort=expirationAsc"/);
    assert.notEqual(purchaseDateHeaderIndex, -1);
    assert.notEqual(categoryHeaderIndex, -1);
    assert.ok(purchaseDateHeaderIndex < categoryHeaderIndex);
    assert.match(html, /flex min-w-0 items-center gap-3/);
    assert.match(html, /관리/);
    assert.match(html, /번호/);
    assert.match(html, /tabular-nums/);
    assert.match(
      html,
      /표를 좌우로 스크롤하면 모든 상세 정보를 확인할 수 있습니다/,
    );
    assert.match(html, /sticky left-0/);
    assert.match(html, /우유/);
    assert.match(html, /식품/);
    assert.match(html, /2026\.07\.24/);
    assert.match(html, /D-30/);
    assert.doesNotMatch(html, /유통기한 기준/);
    assert.match(html, /청소용 장갑/);
    assert.match(html, /D\+100/);
    assert.match(html, /구매일 기준/);
    assert.match(html, /3,200원/);
    assert.match(html, />편집</);
    assert.doesNotMatch(html, />삭제</);
    assert.match(html, /href="\/work-schedule\/cafe\?page=2"/);
  });

  test("renders held cafe items in a dedicated modal", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemHeldItemsModal, {
        heldItems: [heldCafeItem],
        onClose() {},
        today: "2026-06-24",
      }),
    );

    assert.match(html, /카페 물품 보류 현황/);
    assert.match(html, /보류 처리된 물품/);
    assert.match(html, /총 1개/);
    assert.match(html, /보류 쿠키/);
    assert.match(html, /2026\.06\.20/);
    assert.match(html, /D\+4/);
    assert.match(html, /폐기 전 재고 확인을 위해 임시 보관/);
    assert.match(html, />닫기</);
  });

  test("disables the held item summary when there are no held items", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemList, {
        itemPage: {
          ...itemPage,
          heldItems: [],
        },
        today: "2026-06-24",
      }),
    );

    assert.match(html, /disabled=""/);
    assert.match(html, /보류 처리 0개/);
  });

  test("renders active cafe item expiration sort links", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemList, {
        itemPage: {
          ...itemPage,
          filters: {
            ...itemPage.filters,
            category: "food",
            deadline: "dueSoon",
            query: "우유",
            sort: "expirationAsc",
          },
        },
        today: "2026-06-24",
      }),
    );

    assert.match(html, /aria-sort="ascending"/);
    assert.match(html, /aria-label="유통기한 내림차순 정렬"/);
    assert.match(html, /name="sort" value="expirationAsc"/);
    assert.match(
      html,
      /href="\/work-schedule\/cafe\?q=%EC%9A%B0%EC%9C%A0&amp;category=food&amp;deadline=dueSoon&amp;sort=expirationDesc"/,
    );
    assert.match(
      html,
      /href="\/work-schedule\/cafe\?q=%EC%9A%B0%EC%9C%A0&amp;category=food&amp;deadline=dueSoon&amp;sort=expirationAsc&amp;page=2"/,
    );
  });

  test("keeps cafe item row numbers continuous across pages", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemList, {
        itemPage: {
          ...itemPage,
          items: [cafeItems[0]],
          page: 2,
        },
        today: "2026-06-24",
      }),
    );

    assert.match(html, /tabular-nums[^"]*">8<\/td>/);
  });

  test("renders the hold status and reason for an expired food item", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemList, {
        itemPage: {
          ...itemPage,
          items: [
            {
              ...cafeItems[0],
              expirationDate: "2026-06-20",
              expirationHoldReason: "폐기 전 수량 확인을 위해 임시 보관",
            },
          ],
          total: 1,
          totalPages: 1,
        },
        today: "2026-06-24",
      }),
    );

    assert.match(html, /보류 사유/);
    assert.match(html, />보류</);
    assert.match(html, /폐기 전 수량 확인을 위해 임시 보관/);
  });

  test("renders cafe item change log filters and pagination", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemChangeLogTable, {
        itemFilters: itemPage.filters,
        logPage: changeLogPage,
      }),
    );

    assert.match(html, /변경내역/);
    assert.match(html, /7건 중 6-7건 표시/);
    assert.match(html, /name="logQ"/);
    assert.match(html, /name="logAction"/);
    assert.match(html, /name="logStaff"/);
    assert.match(html, /flex min-w-0 items-center gap-3/);
    assert.match(html, /우유 물품 정보를 수정했습니다\./);
    assert.match(html, /최윤서/);
    assert.match(html, /href="\/work-schedule\/cafe\?logQ=%EC%9A%B0%EC%9C%A0&amp;logAction=update&amp;logStaff=user-001"/);

    const sortedHtml = renderToStaticMarkup(
      React.createElement(CafeItemChangeLogTable, {
        itemFilters: {
          ...itemPage.filters,
          sort: "expirationDesc",
        },
        logPage: changeLogPage,
      }),
    );

    assert.match(sortedHtml, /name="sort" value="expirationDesc"/);
    assert.match(
      sortedHtml,
      /href="\/work-schedule\/cafe\?sort=expirationDesc&amp;logQ=%EC%9A%B0%EC%9C%A0&amp;logAction=update&amp;logStaff=user-001"/,
    );
  });

  test("creates an expiring food PDF", async () => {
    const buffer = await createCafeExpiringFoodsPdf({
      days: 15,
      items: [
        {
          ...cafeItems[0],
          expirationDate: "2026-07-09",
        },
      ],
      today: "2026-06-24",
    });
    const pdf = await PDFDocument.load(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 1);
  });

  test("creates a detailed, multi-page A4 landscape inventory PDF", async () => {
    const items: CafeItemInventoryItem[] = Array.from(
      { length: 18 },
      (_, index) => ({
        ...cafeItems[index % cafeItems.length],
        id: `inventory-${index + 1}`,
        name: index === 17 ? "마지막 확인 물품" : `카페 물품 ${index + 1}`,
        purchaseReason:
          index === 0
            ? `${"가\n".repeat(247)}구매끝`
            : cafeItems[index % cafeItems.length]?.purchaseReason ?? null,
        expirationHoldReason:
          index === 0 ? `${"나\n".repeat(247)}보류끝` : null,
        updatedAt: "2026-06-25T03:40:00.000Z",
      }),
    );
    const buffer = await createCafeItemInventoryPdf({
      generatedAt: new Date("2026-07-20T09:20:00.000Z"),
      items,
      today: "2026-06-24",
    });
    const pdf = await PDFDocument.load(buffer);
    const text = await extractPdfText(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.ok(pdf.getPageCount() > 1);
    assert.equal(pdf.getTitle(), "카페 물품 전체 목록");
    assertA4LandscapePages(pdf);
    assert.match(text, /카페 물품 전체 목록/);
    assert.match(text, /번호/);
    assert.match(text, /물품명/);
    assert.match(text, /종류/);
    assert.match(text, /사용 상태/);
    assert.match(text, /구매일/);
    assert.match(text, /유통기한/);
    assert.match(text, /등록일시/);
    assert.match(text, /수정일시/);
    assert.match(text, /가격/);
    assert.match(text, /구매·보류 사유/);
    assert.match(text, /3,200원/);
    assert.match(text, /구매끝/);
    assert.match(text, /보류끝/);
    assert.match(text, /마지막 확인 물품/);
  });
});

function readPdfHeader(buffer: Uint8Array) {
  return Buffer.from(buffer.slice(0, 4)).toString("utf8");
}

function assertA4LandscapePages(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    const { height, width } = page.getSize();

    assert.ok(Math.abs(width - PageSizes.A4[1]) < 0.01);
    assert.ok(Math.abs(height - PageSizes.A4[0]) < 0.01);
  }
}

async function extractPdfText(buffer: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const texts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      texts.push(
        ...content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean),
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  return texts.join("|");
}
