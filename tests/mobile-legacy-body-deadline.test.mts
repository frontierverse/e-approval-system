import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import ts from "typescript";
import { MobileStaffTaskRequestError } from "../src/lib/mobile-staff-tasks-core.ts";
import { MobileDailyReportRequestError } from "../src/lib/mobile-daily-reports-core.ts";

// Execute the unchanged private production function, extracted through its TS AST.
// Only its lexical wall clock and stream boundary are injected; global Date/timers stay real.
type Parser = (request: Request, maxBytes?: number) => Promise<unknown>;
type ParserError = Error & { status: number; code: string };
async function actualParser(file: string, errorName: string) {
  const text = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const node = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "boundedJson");
  assert.ok(node, "production boundedJson must exist");
  const code = `export function parser(clock, ErrorType) { const Date = { now: clock }; const ${errorName} = ErrorType; const maxJsonBytes = 16 * 1024; ${node.getText(source)} return boundedJson; }`;
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)).parser as (clock: () => number, error: typeof MobileStaffTaskRequestError | typeof MobileDailyReportRequestError) => Parser;
}
const tasks = await actualParser("mobile-staff-tasks.ts", "MobileStaffTaskRequestError");
const daily = await actualParser("mobile-daily-reports.ts", "MobileDailyReportRequestError");
const bytes = new TextEncoder().encode('{"title":"valid"}');
type Step = { at: number; chunk?: Uint8Array; done?: boolean };
function streamBoundary(steps: Step[]) {
  const state = { now: 0, reads: 0, cancelled: 0, released: 0 };
  const request = { headers: new Headers({ "content-type": "application/json" }), body: { getReader() { return {
    async read() { const step = steps[state.reads++]; assert.ok(step, "parser must not read past its deadline"); state.now = step.at; return { done: !!step.done, value: step.chunk }; },
    async cancel() { state.cancelled++; }, releaseLock() { state.released++; },
  }; } } } as unknown as Request;
  return { state, request };
}
for (const entry of [{ name: "tasks", factory: tasks, ErrorType: MobileStaffTaskRequestError, limit: 16 * 1024 },
  { name: "daily report save", factory: daily, ErrorType: MobileDailyReportRequestError, limit: 8 * 1024 * 1024 },
  { name: "daily report review", factory: daily, ErrorType: MobileDailyReportRequestError, limit: 8 * 1024 }]) {
  describe(`${entry.name}: actual production body deadline`, () => {
    for (const [label, steps] of [
      ["immediately ready data at deadline", [{ at: 10000, chunk: bytes }, { at: 10000, done: true }]],
      ["immediately ready EOF at deadline", [{ at: 1, chunk: bytes }, { at: 10000, done: true }]],
      ["zero-byte ready chunks cannot spin past deadline", [{ at: 5000, chunk: new Uint8Array() }, { at: 10000, chunk: new Uint8Array() }, { at: 10001, chunk: bytes }, { at: 10001, done: true }]],
    ] as [string, Step[]][]) {
      test(label, async () => {
        const h = streamBoundary(steps), parse = entry.factory(() => h.state.now, entry.ErrorType);
        await assert.rejects(parse(h.request, entry.limit), (error: ParserError) => error instanceof entry.ErrorType && error.status === 408 && error.code === "REQUEST_TIMEOUT");
        assert.equal(h.state.cancelled, 1); assert.equal(h.state.released, 1);
        assert.ok(h.state.reads <= 2);
      });
    }
    test("valid ready chunks before deadline preserve JSON semantics", async () => {
      const h = streamBoundary([{ at: 9998, chunk: bytes }, { at: 9999, done: true }]);
      assert.deepEqual(await entry.factory(() => h.state.now, entry.ErrorType)(h.request, entry.limit), { title: "valid" });
      assert.equal(h.state.cancelled, 0); assert.equal(h.state.released, 1);
    });
    test("existing byte cap remains independent of ready stream timing", async () => {
      const h = streamBoundary([{ at: 1, chunk: new Uint8Array(entry.limit + 1) }]);
      await assert.rejects(entry.factory(() => h.state.now, entry.ErrorType)(h.request, entry.limit), (error: ParserError) => error instanceof entry.ErrorType && error.status === 413 && error.code === "PAYLOAD_TOO_LARGE");
      assert.equal(h.state.cancelled, 1); assert.equal(h.state.released, 1);
    });
  });
}
