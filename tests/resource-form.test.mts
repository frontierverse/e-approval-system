import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceForm } from "../src/components/resource-form.tsx";

describe("ResourceForm", () => {
  test("renders an attachment drop zone while keeping the file input", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceForm, {
        action: async () => ({}),
        attachmentPolicy: {
          allowedExtensions: [".pdf", ".png"],
          maxFileCount: 3,
          maxFileSizeMb: 10,
        },
        initialValues: {
          category: "bajaul",
          summary: "",
          title: "",
        },
        mode: "create",
      }),
    );

    assert.match(html, /type="file"/);
    assert.match(html, /aria-describedby="attachments-drop-help"/);
    assert.match(
      html,
      /파일을 이 영역에 끌어다 놓거나 파일 선택 버튼으로 추가하세요\./,
    );
  });
});
