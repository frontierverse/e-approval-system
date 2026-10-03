import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
const renderForm = (element: React.ReactElement) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, element));
import { renderToStaticMarkup } from "react-dom/server";
import {
  ResourceForm,
  ResourceUploadPendingOverlay,
} from "../src/components/resource-form.tsx";

describe("ResourceForm", () => {
  test("renders an attachment drop zone while keeping the file input", () => {
    const html = renderForm(
      React.createElement(ResourceForm, {
        actorId: "synthetic-actor", initialRequestId: "synthetic-request", directUploadSupported: true,
        action: async () => ({}),
        attachmentPolicy: {
          allowedExtensions: [".pdf", ".png"],
          maxFileCount: 3,
          maxFileSizeMb: 10,
        },
        initialValues: {
          category: "bajaul",
          educationLevel: "",
          summary: "",
          title: "",
        },
        mode: "create",
      }),
    );

    assert.match(html, /type="file"/);
    assert.match(html, /id="category"/);
    assert.match(html, /aria-describedby="attachments-drop-help"/);
    assert.match(
      html,
      /파일을 이 영역에 끌어다 놓거나 파일 선택 버튼으로 추가하세요\./,
    );
  });

  test("renders an upload pending modal", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceUploadPendingOverlay, {
        show: true,
      }),
    );

    assert.match(html, /aria-busy="true"/);
    assert.match(html, /role="status"/);
    assert.match(html, /저장 중/);
    assert.match(html, /자료와 첨부파일을 저장하고 있습니다/);
  });

  test("renders an education level selector for education resources", () => {
    const html = renderForm(
      React.createElement(ResourceForm, {
        actorId: "synthetic-actor", initialRequestId: "synthetic-request", directUploadSupported: true,
        action: async () => ({}),
        attachmentPolicy: {
          allowedExtensions: [".pdf"],
          maxFileCount: 3,
          maxFileSizeMb: 10,
        },
        initialValues: {
          category: "education",
          educationLevel: "middle",
          summary: "",
          title: "",
        },
        mode: "create",
      }),
    );

    assert.match(html, /name="educationLevel"/);
    assert.match(html, /type="hidden" name="category" value="education"/);
    assert.match(html, /lg:grid-cols-\[minmax\(0,1fr\)_12rem\]/);
    assert.doesNotMatch(html, /id="category"/);
    assert.match(html, /교육 대상/);
    assert.match(html, /value="common">공통/);
    assert.match(html, /value="middle" selected="">중등/);
  });
});
