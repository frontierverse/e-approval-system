import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppUpdatesHarness, nodes, textOf } from "./helpers/mobile-app-updates-client.mjs";

test("actual preview header has one heading and a named 44px back target without a second title", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatFilePreviewHeader } = h.load("components/chat-file-preview-ui.tsx");
    let back = 0;
    const row = h.mount(ChatFilePreviewHeader, { backLabel: "뒤로, 직원 대화", onBack: () => back++ });
    const tree = h.renderTree(row.tree), headings = nodes(tree).filter(n => n.props?.role === "heading");
    assert.equal(headings.length, 1); assert.equal(headings[0].props["aria-level"], 1);
    assert.equal(textOf(headings[0]), "파일 미리보기");
    const target = nodes(tree).find(n => n.type === "Pressable");
    assert.equal(target.props.accessibilityLabel, "뒤로, 직원 대화");
    assert.equal(target.props.style({ pressed: false }).minHeight, 44);
    target.props.onPress(); assert.equal(back, 1);
  } finally { h.dispose(); }
});

test("actual authorized file summary uses verified MIME and full selectable name with one non-consuming notice", () => {
  const h = createAppUpdatesHarness({ os: "web" });
  try {
    const { ChatFilePreviewInfo } = h.load("components/chat-file-preview-ui.tsx");
    const file = { originalName: "아주_긴_한글_검수자료_이름과_영문_Final_Review.pdf", size: 42034 };
    const tree = h.renderTree(h.mount(ChatFilePreviewInfo, { file, mimeType: "image/png" }).tree);
    assert.ok(textOf(tree).includes("PNG · 41KB"), "verified bytes determine format, not filename extension");
    assert.equal(nodes(tree).filter(n => n.type === "Text" && textOf(n) === file.originalName && n.props.selectable).length, 1);
    assert.equal(textOf(tree).split("미리보기만으로 수신 완료하거나 원본을 삭제하지 않습니다.").length, 2);
    assert.equal(nodes(tree).some(n => n.props?.numberOfLines || n.type === "Pressable"), false);
  } finally { h.dispose(); }
});

test("actual retry and return controls remain 48px with visible focus and wrapping at large text", () => {
  const h = createAppUpdatesHarness();
  try {
    h.state.dimensions.fontScale = 2;
    const { ChatFilePreviewAction } = h.load("components/chat-file-preview-ui.tsx");
    for (const primary of [false, true]) {
      const row = h.mount(ChatFilePreviewAction, { label: "미리보기 다시 확인", primary, onPress: () => {} });
      let button = h.renderTree(row.tree);
      assert.equal(button.props.style({ pressed: false }).minHeight, 48);
      assert.equal(nodes(button).some(n => n.props?.numberOfLines), false);
      const border = button.props.style({ pressed: false }).borderColor;
      button.props.onFocus(); row.render(); button = h.renderTree(row.tree);
      assert.notEqual(button.props.style({ pressed: false }).borderColor, border);
    }
  } finally { h.dispose(); }
});

test("actual preview loading and deleted feedback are distinct and web PDF has only a truthful notice", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatFilePreviewLoading, ChatFilePreviewFeedback, ChatFilePreviewWebPdf } = h.load("components/chat-file-preview-ui.tsx");
    const loading = h.renderTree(h.mount(ChatFilePreviewLoading).tree);
    assert.ok(nodes(loading).some(n => n.props?.role === "status"));
    assert.equal(textOf(loading), "미리보기 확인 중");
    const deleted = h.renderTree(h.mount(ChatFilePreviewFeedback, { error: "파일 원본이 없습니다.", failure: "deleted", children: null }).tree);
    assert.ok(textOf(deleted).includes("원본이 삭제되어 미리볼 수 없습니다"));
    assert.equal(nodes(deleted).find(n => n.type === "Feather").props.color, "#5C6675");
    const web = h.renderTree(h.mount(ChatFilePreviewWebPdf).tree);
    assert.equal(textOf(web), "PDF 미리보기는 설치한 모바일 앱에서 제공됩니다.");
    assert.equal(nodes(web).some(n => n.type === "Pressable" || n.props?.role === "document"), false);
  } finally { h.dispose(); }
});

test("actual permission feedback supplies a next action without repeating the server error as a second title", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatFilePreviewFeedback } = h.load("components/chat-file-preview-ui.tsx");
    const tree = h.renderTree(h.mount(ChatFilePreviewFeedback, { error: "이 파일에 접근할 수 없습니다.", failure: "forbidden", children: null }).tree);
    assert.equal(textOf(tree).split("이 파일에 접근할 수 없습니다").length, 2);
    assert.ok(textOf(tree).includes("대화로 돌아가 주세요."));
    assert.ok(nodes(tree).some(n => n.props?.accessibilityRole === "alert" && n.props?.tabIndex === -1));
  } finally { h.dispose(); }
});
