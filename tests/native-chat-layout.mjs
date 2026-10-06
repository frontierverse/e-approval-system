import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createAppUpdatesHarness, textOf } from './helpers/mobile-app-updates-client.mjs';

// Use vendored native Yoga, not browser CSS or a mocked layout engine. The
// text widths below model wrapping; physical OS typography still needs QA.
const yoga = fileURLToPath(new URL('../mobile/node_modules/react-native/ReactCommon/yoga/', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'bajaul-chat-yoga-'));
const binary = join(temporary, 'layout');
const cppFiles = path => readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? cppFiles(join(path, e.name)) : e.name.endsWith('.cpp') ? [join(path, e.name)] : []);
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style ?? {};
try {
  const compiled = spawnSync('c++', ['-std=c++20', '-O0', '-I', yoga, fileURLToPath(new URL('./helpers/chat-layout-yoga.cpp', import.meta.url)), ...cppFiles(join(yoga, 'yoga')), '-o', binary], { encoding: 'utf8', timeout: 120000 });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
  let cases = 0;
  for (const width of [180, 320, 360, 390, 1366]) for (const fontScale of [1, 2]) for (const own of [false, true]) for (const status of ['available', 'deleted', 'deleting']) for (const longName of [false, true]) for (const caption of [false, true]) {
    const h = createAppUpdatesHarness({ os: 'android' });
    try {
      h.state.dimensions = { width, height: 844, fontScale, scale: 1 };
      const { ChatThreadMessage, ChatThreadAction } = h.load('components/chat-thread-ui.tsx');
      const file = { id: 'synthetic-layout-file', originalName: longName ? '2026년_업무_자료_길고_긴_파일명_검수용_최종_예시.hwp' : 'a.hwp', size: 29696, status };
      const item = { id: 'synthetic-layout-message', senderId: own ? 'own' : 'peer', recipientId: own ? 'peer' : 'own', sequence: '1', body: caption ? '함께 보낸 합성 메시지입니다.' : `파일: ${file.originalName}`, attachment: file, createdAt: '2026-10-06T00:35:00Z', readAt: own ? '2026-10-06T00:36:00Z' : null };
      const action = h.mount(ChatThreadAction, { label: file.originalName, attachment: file, onPress() {} });
      const message = h.mount(ChatThreadMessage, { item, own, peerName: '예시 직원', children: action.tree });
      const tree = h.renderTree(message.tree), entries = [], protocol = [];
      const visit = (node, parent = -1) => {
        if (!node || typeof node !== 'object' || !node.type) return;
        const id = entries.length, props = node.props, style = flatten(typeof props.style === 'function' ? props.style({ pressed: false }) : props.style);
        entries.push({ node, parent }); protocol.push(`node ${id} ${parent}`);
        for (const [key, value] of Object.entries(style)) {
          if (typeof value === 'number') protocol.push(`style ${id} ${key} ${value}`);
          else if ((key === 'width' || key === 'maxWidth') && typeof value === 'string' && value.endsWith('%')) protocol.push(`style ${id} ${key}Percent ${parseFloat(value)}`);
        }
        if (style.flexDirection === 'row') protocol.push(`style ${id} row 1`);
        const align = { 'flex-start': 'alignStart', 'flex-end': 'alignEnd', center: 'alignCenter' }[style.alignItems];
        if (align) protocol.push(`style ${id} ${align} 1`);
        if (style.justifyContent === 'center') protocol.push(`style ${id} justifyCenter 1`);
        if (node.type === 'Text' || node.type === 'Feather') {
          const size = node.type === 'Feather' ? props.size : style.fontSize ?? 14;
          const textWidth = node.type === 'Feather' ? size : [...textOf(node)].reduce((sum, ch) => sum + size * (ch.codePointAt(0) > 127 ? 1 : .55), 0);
          protocol.push(`text ${id} ${textWidth * fontScale} ${(style.lineHeight ?? size) * fontScale}`);
        } else {
          for (const child of [props.children].flat(Infinity)) visit(child, id);
        }
      };
      visit(tree); protocol.push(`style 0 width ${Math.min(width, 760) - 32}`);
      const result = spawnSync(binary, { input: protocol.join('\n') + '\n', encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      const boxes = result.stdout.trim().split('\n').map(line => { const [id, left, top, width, height] = line.split(' ').map(Number); return { id, left, top, width, height }; });
      const absolute = id => { const box = { ...boxes[id] }; for (let p = entries[id].parent; p >= 0; p = entries[p].parent) { box.left += boxes[p].left; box.top += boxes[p].top; } return box; };
      const bubbleId = entries.findIndex(e => e.node === tree.props.children[0]);
      const bubble = absolute(bubbleId);
      const context = JSON.stringify({ width, fontScale, own, status, longName, caption });
      assert.ok(bubble.width >= Math.min(120, width - 32), `usable attachment width: ${context}: ${bubble.width}`);
      const nameId = entries.findIndex(e => e.node.type === 'Text' && textOf(e.node) === file.originalName);
      const name = absolute(nameId);
      assert.ok(name.width > 0 && name.height >= 20 * fontScale, `filename visible: ${context}: ${JSON.stringify(name)}`);
      const buttons = entries.filter(entry => entry.node.type === 'Pressable');
      assert.equal(buttons.length, status === 'available' ? 1 : 0, `file actions match current status: ${context}`);
      for (const [id, entry] of entries.entries()) if (entry.node.type === 'Text' || entry.node.type === 'Pressable') {
        const box = absolute(id);
        if (id === entries.length - 1) continue; // external timestamp
        assert.ok(box.left >= bubble.left - .1 && box.left + box.width <= bubble.left + bubble.width + .1, `content within bubble width: ${context}`);
        assert.ok(box.top >= bubble.top - .1 && box.top + box.height <= bubble.top + bubble.height + .1, `content within bubble height: ${context}: ${textOf(entry.node)} ${JSON.stringify({ box, bubble })}`);
        if (entry.node.type === 'Pressable') assert.ok(box.height >= 44, `touch target: ${context}`);
      }
      const timestamp = absolute(entries.length - 1);
      assert.ok(timestamp.top >= bubble.top + bubble.height + 3.9, `timestamp follows entire card: ${context}`);
      cases++;
    } finally { h.dispose(); }
  }
  console.log(`Native React Native Yoga attachment layout: ${cases} boundary cases passed.`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
