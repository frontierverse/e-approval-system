import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { ChatRequestError } from "../src/hooks/use-staff-chat-data.ts";
import { uploadStaffChatFile, uploadStaffChatZip, type ChatUploadProgress } from "../src/lib/staff-chat-upload-client.ts";
import { staffChatChunkSize } from "../src/lib/staff-chat-file-limits.ts";

class UploadRequest {
  static requests: UploadRequest[] = [];
  upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = "";
  timeout = 0;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body?: Blob | FormData;
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(body: Blob | FormData) { this.body = body; UploadRequest.requests.push(this); }
  progress(loaded: number, total: number, lengthComputable = true) { this.upload.onprogress?.({ loaded, total, lengthComputable }); }
  respond(status: number, result: unknown) { this.status = status; this.responseText = JSON.stringify(result); this.onload?.(); }
}

const originalXhr = globalThis.XMLHttpRequest;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  UploadRequest.requests = [];
  globalThis.XMLHttpRequest = UploadRequest as unknown as typeof XMLHttpRequest;
});
afterEach(() => {
  globalThis.XMLHttpRequest = originalXhr;
  globalThis.fetch = originalFetch;
});

async function waitForRequest(count: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (UploadRequest.requests.length >= count) return UploadRequest.requests[count - 1];
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("upload request was not started");
}

const options = { peerId: "peer", requestId: "request-progress", body: "유지할 초안" };

describe("chat measured upload progress", () => {
  test("multipart progress follows browser bytes and waits for the server before finishing", async () => {
    const file = new File([new Uint8Array(1000)], "자료.zip");
    const progress: ChatUploadProgress[] = [];
    const result = uploadStaffChatFile({ ...options, file, onProgress: (value) => progress.push(value) });
    const request = await waitForRequest(1);
    assert.equal(request.url, "/api/chat/files"); assert.equal(request.method, "POST");
    assert.equal(request.timeout, 90_000);
    assert.ok(request.body instanceof FormData);
    assert.equal(request.body.get("requestId"), options.requestId);
    assert.equal(request.body.get("body"), options.body);
    assert.equal(request.headers["Content-Type"], undefined, "browser must supply multipart boundary");
    request.progress(300, 1200);
    assert.equal(progress.at(-1)?.completedBytes, 250);
    request.progress(780, 1200);
    assert.equal(progress.at(-1)?.completedBytes, 650);
    const count = progress.length;
    request.progress(1, 0, false);
    assert.equal(progress.length, count, "unknown sizes do not invent percentage updates");
    request.progress(1200, 1200);
    assert.equal(progress.at(-1)?.stage, "uploading");
    assert.ok(progress.at(-1)!.completedBytes < file.size);
    request.respond(200, { message: { id: "sent" } });
    assert.deepEqual(await result, { message: { id: "sent" } });
    assert.deepEqual(progress.at(-1), { stage: "finishing", completedBytes: 1000, totalBytes: 1000 });
    assert.equal(request.upload.onprogress, null);
  });

  test("resumed ZIP progress includes saved chunks plus in-flight bytes and finishes after every part is acknowledged", async () => {
    const file = new File([new Uint8Array(staffChatChunkSize * 2.5)], "자료.ZIP");
    const progress: ChatUploadProgress[] = [];
    let finish!: (response: Response) => void;
    const jsonRequests: string[] = [];
    globalThis.fetch = async (input) => {
      jsonRequests.push(String(input));
      if (String(input) === "/api/chat/uploads") return Response.json({ uploadId: "resume", uploadedParts: [0] });
      return new Promise<Response>((resolve) => { finish = resolve; });
    };
    const result = uploadStaffChatZip({ ...options, file, onProgress: (value) => progress.push(value) });
    const first = await waitForRequest(1);
    assert.equal(first.url, "/api/chat/uploads/resume/parts/1");
    assert.equal(first.headers["Content-Type"], "application/octet-stream");
    assert.ok(first.body instanceof Blob); assert.equal(first.body.size, staffChatChunkSize);
    assert.equal(progress.at(-1)?.completedBytes, staffChatChunkSize);
    first.progress(staffChatChunkSize / 2, staffChatChunkSize);
    assert.equal(progress.at(-1)?.completedBytes, file.size * 0.6);
    first.respond(200, { ok: true });
    const last = await waitForRequest(2);
    assert.equal(last.url, "/api/chat/uploads/resume/parts/2");
    assert.ok(last.body instanceof Blob); assert.equal(last.body.size, staffChatChunkSize / 2);
    last.progress(staffChatChunkSize / 2, staffChatChunkSize / 2);
    assert.equal(progress.at(-1)?.stage, "uploading");
    assert.ok(progress.at(-1)!.completedBytes < file.size);
    last.respond(200, { ok: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(progress.at(-1), { stage: "finishing", completedBytes: file.size, totalBytes: file.size });
    finish(Response.json({ message: { id: "complete" } }));
    assert.deepEqual(await result, { message: { id: "complete" } });
    assert.deepEqual(jsonRequests, ["/api/chat/uploads", "/api/chat/uploads/resume/complete"]);
  });

  test("HTTP authentication errors preserve their type and do not claim completion", async () => {
    const progress: ChatUploadProgress[] = [];
    const result = uploadStaffChatFile({ ...options, file: new File(["content"], "자료.txt"), onProgress: (value) => progress.push(value) });
    const rejected = assert.rejects(result, (error: unknown) => error instanceof ChatRequestError && error.status === 401);
    const request = await waitForRequest(1);
    request.respond(401, { error: "expired" });
    await rejected;
    assert.ok(progress.every((value) => value.stage !== "finishing"));
    assert.equal(request.upload.onprogress, null);
  });

  test("network failure, timeout and abort reject and release progress handlers", async () => {
    for (const [handler, name] of [["onerror", "TypeError"], ["ontimeout", "TimeoutError"], ["onabort", "AbortError"]] as const) {
      const result = uploadStaffChatFile({ ...options, file: new File(["x"], "자료.txt") });
      const rejected = assert.rejects(result, { name });
      const request = UploadRequest.requests.at(-1)!;
      request[handler]!();
      await rejected;
      assert.equal(request.upload.onprogress, null);
      assert.equal(request.onload, null);
    }
  });
});
