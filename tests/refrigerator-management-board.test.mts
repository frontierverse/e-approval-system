import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RefrigeratorManagementBoard } from "../src/components/refrigerator-management-board.tsx";

describe("refrigerator management board", () => {
  test("renders two refrigerator columns with food tables and add buttons", () => {
    const html = renderToStaticMarkup(
      React.createElement(RefrigeratorManagementBoard),
    );

    assert.match(html, /aria-label="냉장고 관리"/);
    assert.match(html, /바자울 1/);
    assert.match(html, /바자울 2/);
    assert.equal(html.match(/>추가</g)?.length ?? 0, 2);
    assert.equal(html.match(/>식품명</g)?.length ?? 0, 2);
    assert.equal(html.match(/>카테고리</g)?.length ?? 0, 2);
    assert.equal(html.match(/>구매일</g)?.length ?? 0, 2);
    assert.equal(html.match(/>유통기한</g)?.length ?? 0, 2);
    assert.equal(html.match(/h-\[27\.5rem\]/g)?.length ?? 0, 2);
    assert.equal(html.match(/type="file"/g)?.length ?? 0, 2);
    assert.equal(html.match(/accept="image\/\*"/g)?.length ?? 0, 2);
    assert.doesNotMatch(html, /bottom-1 right-1/);
  });
});
