import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppUpdatesHarness, nodes, textOf } from "./helpers/mobile-app-updates-client.mjs";

const peer = { id: "design-peer", name: "김아주긴이름예시직원", departmentName: "긴 예시 지원 부서", positionName: "야간·주말 담당", active: false };
const conversation = { peer, unreadCount: 128, lastMessage: { body: "", attachment: { originalName: "길고_긴_회의자료_예시.pdf" }, createdAt: "2026-10-06T00:40:00.000Z" } };

test("actual chat row exposes full unread count, inactive record and attachment in one accessible target", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatListRow } = h.load("components/chat-list-ui.tsx");
    const row = h.mount(ChatListRow, { peer, conversation, directory: false, first: true, last: true, onPress: () => {}, disabled: false });
    const tree = h.renderTree(row.tree), button = nodes(tree).find(n => n.type === "Pressable");
    assert.ok(button.props.accessibilityLabel.includes("안 읽은 메시지 128개"));
    assert.ok(button.props.accessibilityLabel.includes("현재 대화 기록만 확인 가능"));
    assert.ok(button.props.accessibilityLabel.includes("첨부파일 길고_긴_회의자료_예시.pdf"));
    assert.ok(textOf(tree).includes("99+"));
    assert.equal(nodes(tree).filter(n => n.type === "Pressable").length, 1);
  } finally { h.dispose(); }
});

test("actual chat presentation stacks date metadata at native fontScale2 without dropping date or staff identity", () => {
  const h = createAppUpdatesHarness();
  try {
    h.state.dimensions.fontScale = 2;
    const { ChatListRow } = h.load("components/chat-list-ui.tsx");
    const row = h.mount(ChatListRow, { peer, conversation, directory: false, first: true, last: true, onPress: () => {}, disabled: false });
    const tree = h.renderTree(row.tree);
    const date = nodes(tree).find(n => n.type === "Text" && textOf(n).includes("09:40"));
    assert.ok(date); assert.ok(textOf(tree).includes(peer.name)); assert.ok(textOf(tree).includes(peer.departmentName));
    assert.ok(textOf(date).includes("\u00a0"), "date stays together in its own metadata flow");
  } finally { h.dispose(); }
});

test("actual employee finder prioritizes department and role without showing conversation body", () => {
  const h = createAppUpdatesHarness();
  try {
    const { ChatListRow } = h.load("components/chat-list-ui.tsx");
    const row = h.mount(ChatListRow, { peer: { ...peer, active: true }, conversation: { ...conversation, lastMessage: { ...conversation.lastMessage, body: "private conversation preview" } }, directory: true, first: true, last: true, onPress: () => {}, disabled: false });
    const tree = h.renderTree(row.tree);
    assert.ok(textOf(tree).includes(peer.positionName)); assert.ok(!textOf(tree).includes("private conversation preview"));
  } finally { h.dispose(); }
});
