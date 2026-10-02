import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";

// Isolate the OS alert and hook lifecycle to exercise cancellation and duplicate
// prompts using the production hook. Device focus and appearance require UI QA.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Value = any;
const refs: Value[] = [], states: Value[] = [], cleanups: (() => void)[] = [], effectDependencies: Value[][] = [];
let refIndex = 0, stateIndex = 0, effectIndex = 0;
let alert: { buttons: { onPress: () => void }[]; options: { onDismiss: () => void } } | null = null;
const platform = { OS: "android" };
const key = "__mobileConfirmationTest";
(globalThis as Value)[key] = {
  useState(initial: Value) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (value: Value) => { states[index] = value; }]; },
  useRef(initial: Value) { const index = refIndex++; return refs[index] ??= { current: initial }; },
  useCallback: (fn: Value) => fn,
  useEffect: (fn: () => () => void, dependencies: Value[]) => {
    const index = effectIndex++, previous = effectDependencies[index];
    if (!previous || dependencies.some((value, i) => value !== previous[i])) {
      cleanups[index]?.(); effectDependencies[index] = dependencies; cleanups[index] = fn();
    }
  },
  Alert: { alert(_title: string, _message: string, buttons: Value, options: Value) { alert = { buttons, options }; } },
  Platform: platform, useTheme: () => ({}),
  React: { createElement: (type: Value, props: Value, ...children: Value[]) => ({ type, props, children }) },
  Modal: "Modal", View: "View", Text: "Text", ScrollView: "ScrollView", TextAction: "TextAction", PrimaryButton: "PrimaryButton",
};
const source = readFileSync(new URL("../mobile/src/components/use-confirm-action.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("confirmation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "useConfirmAction");
assert.ok(declaration);
const code = ts.transpileModule(`const {${Object.keys((globalThis as Value)[key]).join(",")}} = globalThis.${key};\n${declaration.getText(ast)}`,
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }, fileName: "confirmation.tsx" }).outputText;
const { useConfirmAction: runConfirmationHook } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const render = () => { refIndex = 0; stateIndex = 0; effectIndex = 0; return runConfirmationHook(); };
const question = { title: "회수 확인", message: "결재를 중단하고 수정합니다.", confirm: "회수", danger: true };
beforeEach(() => { refs.length = 0; states.length = 0; cleanups.length = 0; effectDependencies.length = 0; alert = null; platform.OS = "android"; });
after(() => { delete (globalThis as Value)[key]; });

test("native confirmation cancels on dismissal and suppresses duplicate prompts", async () => {
  const hook = render(), first = hook.ask(question);
  assert.equal(await hook.ask(question), false);
  alert!.options.onDismiss();
  assert.equal(await first, false);
  const second = hook.ask(question); alert!.buttons[1].onPress();
  assert.equal(await second, true);
});
test("leaving a screen resolves its pending confirmation without approving it", async () => {
  const pending = render().ask(question);
  cleanups[0]();
  assert.equal(await pending, false);
});
test("web close cancels the pending operation and labels the accessible dialog", async () => {
  platform.OS = "web";
  const pending = render().ask(question), dialog = render().dialog;
  assert.equal(dialog.type, "Modal");
  assert.equal(dialog.props.accessibilityLabel, "회수 확인");
  assert.equal(dialog.props.visible, true);
  dialog.props.onRequestClose();
  assert.equal(await pending, false);
  assert.equal(render().dialog.props.visible, false);
});
test("web cancellation restores its initiating control after closing the modal, once", async () => {
  platform.OS = "web";
  let restored = 0;
  const pending = render().ask({ ...question, onReturnFocus: () => { restored++; } });
  const dialog = render().dialog;
  assert.equal(restored, 0);
  dialog.props.onRequestClose();
  assert.equal(await pending, false);
  assert.equal(restored, 0);
  render();
  assert.equal(restored, 1);
  render();
  assert.equal(restored, 1);
});
