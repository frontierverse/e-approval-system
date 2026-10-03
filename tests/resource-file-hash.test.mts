import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { hashResourceFile, resourceFileTechnicalMaxBytes } from "../src/lib/resource-file-hash.ts";

test("resource browser incremental SHA matches Node crypto across multi-chunk binary and empty boundaries", async () => {
  for (const size of [0, 1, 64, 1024 * 1024 - 1, 1024 * 1024, 2 * 1024 * 1024 + 17]) {
    const input = Buffer.alloc(size);
    for (let i = 0; i < size; i++) input[i] = i % 251;
    const progress: number[] = [];
    const actual = await hashResourceFile(new Blob([input]), { onProgress: n => progress.push(n) });
    assert.equal(actual, createHash("sha256").update(input).digest("hex"));
    assert.equal(progress.at(-1) ?? 0, size);
    assert.ok(progress.every((n, i) => n - (progress[i - 1] ?? 0) <= 1024 * 1024));
  }
});

test("resource hash reads bounded slices and never the whole selected Blob", async () => {
  const input = Buffer.alloc(2 * 1024 * 1024 + 37, 91);
  class SliceOnlyBlob extends Blob {
    override arrayBuffer(): Promise<ArrayBuffer> { throw new Error("Whole file read forbidden"); }
    override slice(start?: number, end?: number, contentType?: string) {
      assert.ok((end ?? this.size) - (start ?? 0) <= 1024 * 1024);
      return super.slice(start, end, contentType);
    }
  }
  assert.equal(await hashResourceFile(new SliceOnlyBlob([input])), createHash("sha256").update(input).digest("hex"));
});

test("resource hash cancellation before and between chunks cannot publish a digest", async () => {
  const first = new AbortController(); first.abort();
  await assert.rejects(hashResourceFile(new Blob(["abc"]), { signal: first.signal }), { name: "AbortError" });
  const second = new AbortController(); const progress: number[] = [];
  await assert.rejects(hashResourceFile(new Blob([Buffer.alloc(3 * 1024 * 1024)]), {
    signal: second.signal, onProgress: n => { progress.push(n); second.abort(); },
  }), { name: "AbortError" });
  assert.deepEqual(progress, [1024 * 1024]);
});

test("resource hash rejects impossible policy sizes and changed slice evidence", async () => {
  await assert.rejects(hashResourceFile({ size: resourceFileTechnicalMaxBytes + 1 } as Blob), RangeError);
  await assert.rejects(hashResourceFile({ size: 10, slice: () => new Blob(["short"]) } as unknown as Blob), /snapshot changed/);
});
