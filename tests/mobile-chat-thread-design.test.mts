import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppUpdatesHarness, nodes, textOf } from "./helpers/mobile-app-updates-client.mjs";

const attachment = { id: "design-file", originalName: "길고_긴_회의자료_예시.pdf", size: 1258291, status: "available" };
const item = { id: "design-message", sequence: "51", senderId: "peer", recipientId: "own", body: "첫 문단\n둘째 문단", createdAt: "2026-10-06T00:35:00.000Z", readAt: null, attachment: null };

test("actual thread puts read status only on outgoing timestamp and keeps message paragraphs selectable", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatThreadMessage } = h.load("components/chat-thread-ui.tsx");
    for (const own of [false, true]) {
      const row = h.mount(ChatThreadMessage, { item, own });
      const tree = h.renderTree(row.tree);
      assert.ok(textOf(tree).includes("10. 6. 09:35"));
      assert.equal(textOf(tree).includes("안 읽음"), own);
      assert.ok(nodes(tree).some(n => n.type === "Text" && n.props.selectable && textOf(n) === item.body));
      const timestamp = nodes(tree).find(n => n.type === "Text" && textOf(n).includes("09:35"));
      assert.equal(tree.props.children[1], timestamp, "timestamp is outside the bubble");
    }
  } finally { h.dispose(); }
});

test("actual file card has full accessible filename, explicit file action and neutral deleted state", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatThreadAction } = h.load("components/chat-thread-ui.tsx");
    let pressed = 0;
    const row = h.mount(ChatThreadAction, { label: attachment.originalName, accessibilityLabel: `${attachment.originalName} 파일 작업 열기`, attachment, onPress: () => pressed++ });
    const tree = h.renderTree(row.tree), button = nodes(tree).find(n => n.type === "Pressable");
    assert.equal(button.props.accessibilityLabel, `${attachment.originalName} 파일 작업 열기`);
    assert.ok(textOf(tree).includes("1.2MB · 원본 보관 중"));
    assert.equal(textOf(button), "파일 작업 열기");
    const deletedRow = h.mount(ChatThreadAction, { label: attachment.originalName, attachment: { ...attachment, status: "deleted" }, onPress: () => pressed++ });
    const deletedTree = h.renderTree(deletedRow.tree);
    const deleted = nodes(deletedTree).find(n => n.type === "Text" && textOf(n).includes("원본 삭제됨"));
    assert.equal(Object.assign({}, ...deleted.props.style.filter(Boolean)).color, "#5C6675");
    assert.equal(nodes(deletedTree).some(n => n.type === "Pressable"), false);
    button.props.onPress(); assert.equal(pressed, 1);
  } finally { h.dispose(); }
});

test("actual uncertain composer input retains content and ignores edit callbacks while disabled", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatThreadInput } = h.load("components/chat-thread-ui.tsx");
    const values: string[] = [];
    const row = h.mount(ChatThreadInput, { label: "메시지 입력", value: "보관한 전송", disabled: true, multiline: true, onChange: (value: string) => values.push(value) });
    const input = h.renderTree(row.tree);
    assert.equal(input.props.value, "보관한 전송"); assert.equal(input.props.editable, false);
    input.props.onChangeText("바꾼 입력"); assert.deepEqual(values, []);
  } finally { h.dispose(); }
});

test("actual panel and composer actions keep minimum targets and visible focus at fontScale2", () => {
  const h = createAppUpdatesHarness();
  try {
    h.state.dimensions.fontScale = 2;
    const { ChatThreadAction, ChatThreadSend } = h.load("components/chat-thread-ui.tsx");
    const outline = h.mount(ChatThreadAction, { label: "작성 내용 버리기", warning: true, panel: true, onPress: () => {} });
    let button = h.renderTree(outline.tree);
    const flatten = (styles: unknown[]) => Object.assign({}, ...styles.filter(Boolean));
    assert.equal(flatten(button.props.style({ pressed: false })).minHeight, 48);
    assert.equal(flatten(button.props.style({ pressed: false })).borderColor, "#5C6675", "warning border uses a contrasting token");
    button.props.onFocus(); outline.render(); button = h.renderTree(outline.tree);
    assert.equal(flatten(button.props.style({ pressed: false })).borderColor, "#2563EB");
    const primary = h.mount(ChatThreadSend, { title: "같은 전송 다시 확인", onPress: () => {} });
    const send = h.renderTree(primary.tree);
    assert.equal(flatten(send.props.style({ pressed: false })).minHeight, 44);
    assert.ok(!nodes(send).some(n => n.props?.numberOfLines), "large text remains in normal flow");
  } finally { h.dispose(); }
});
