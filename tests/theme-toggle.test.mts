import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "../src/components/theme-toggle.tsx";

describe("ThemeToggle", () => {
  test("keeps its mobile header shape", () => {
    const html = renderToStaticMarkup(React.createElement(ThemeToggle));

    assert.match(html, /w-\[4\.75rem\]/);
    assert.match(html, /shrink-0/);
    assert.match(html, /overflow-hidden/);
  });
});
