import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CafeItemList } from "../src/components/cafe-item-list.tsx";
import {
  getCafeItemUsageDday,
  type CafeItem,
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
    createdAt: "2026-06-23T00:00:00.000Z",
  },
];

const itemPage: CafeItemPage = {
  filters: {
    category: "all",
    deadline: "all",
    page: 1,
    query: "",
  },
  items: cafeItems,
  page: 1,
  pageSize: 8,
  total: 10,
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

  test("renders cafe item filters, inventory rows, and pagination", () => {
    const html = renderToStaticMarkup(
      React.createElement(CafeItemList, {
        itemPage,
        today: "2026-06-24",
      }),
    );

    assert.match(html, /물품 목록/);
    assert.match(html, /10건 중 1-8건 표시/);
    assert.match(html, /name="q"/);
    assert.match(html, /name="category"/);
    assert.match(html, /name="deadline"/);
    assert.match(html, /우유/);
    assert.match(html, /식품/);
    assert.match(html, /2026\.07\.24/);
    assert.match(html, /D-30/);
    assert.match(html, /청소용 장갑/);
    assert.match(html, /D\+100/);
    assert.match(html, /3,200원/);
    assert.match(html, /href="\/work-schedule\/cafe\?page=2"/);
  });
});
