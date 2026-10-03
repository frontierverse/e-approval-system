import { sha256 } from "@noble/hashes/sha2.js";
import { ApiError, apiUrl } from "./api";
import { safeAttachmentFilename, transferProgress } from "./attachment-file";
import { createResourceFileApi, resourceBinaryError, resourceDownloadInfo, type ResourceFileAdapter, type ResourceFileCall, type ResourceFilePickOptions } from "./resource-file-core";
import { validateResourceFile } from "./resources";
export type { SelectedResourceFile, ResourceUploadOperation, ResourceFileTransfer, ResourceFilePreview, ResourceFilePickOptions, ResourceUploadOptions, ResourceFileScope } from "./resource-file-core";
export { resourceFileSize, isResourceFileCancellation } from "./resource-file-core";
const urls = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pickers = new Set<() => void>();
function url(blob: Blob) { const value = URL.createObjectURL(blob); urls.add(value); return value; }
function revoke(value: string) { const timer = timers.get(value); if (timer) {
    clearTimeout(timer);
    timers.delete(value);
} if (urls.delete(value))
    URL.revokeObjectURL(value); }
async function pick(options: ResourceFilePickOptions, call: ResourceFileCall) {
    if (typeof document === "undefined")
        return null;
    return new Promise<{
        file: Blob;
        name: string;
        size: number;
        mimeType: string;
    } | null>((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = false;
        input.accept = options.policy.allowedExtensions.join(",");
        input.style.display = "none";
        let finished = false, off = () => { };
        const finish = (result: {
            file: Blob;
            name: string;
            size: number;
            mimeType: string;
        } | null, cause?: unknown) => {
            if (finished)
                return;
            finished = true;
            off();
            pickers.delete(cancel);
            input.removeEventListener("change", changed);
            input.removeEventListener("cancel", cancel);
            input.remove();
            if (cause)
                reject(cause);
            else
                resolve(result);
        };
        const cancel = () => finish(null);
        const changed = () => {
            try {
                call.check();
                const source = input.files?.[0];
                if (!source)
                    return finish(null);
                const name = validateResourceFile(source.name, source.size, options.policy);
                const mimeType = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(source.type) ? source.type.toLowerCase() : "application/octet-stream";
                const file = source.slice(0, source.size, mimeType);
                call.check();
                finish({ file, name, size: file.size, mimeType });
            }
            catch (cause) {
                finish(null, cause);
            }
        };
        pickers.add(cancel);
        input.addEventListener("change", changed);
        input.addEventListener("cancel", cancel);
        document.body.appendChild(input);
        off = call.onCancel(cancel);
        try {
            call.check();
            if (!finished)
                input.click();
        }
        catch (cause) {
            finish(null, cause);
        }
    });
}
async function network<T>(parent: ResourceFileCall, work: (call: ResourceFileCall) => Promise<T>) {
    const controller = new AbortController();
    let timeout = false;
    const cancel = () => controller.abort(), off = parent.onCancel(cancel);
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, 120000);
    const call: ResourceFileCall = { ...parent, signal: controller.signal, check() { parent.check(); if (timeout)
            throw new ApiError("파일 요청 시간이 초과되었습니다. 같은 요청으로 다시 확인하세요.", 0); if (controller.signal.aborted) {
            const error = new Error("취소했습니다.");
            error.name = "AbortError";
            throw error;
        } }, onCancel(callback) { controller.signal.addEventListener("abort", callback, { once: true }); if (controller.signal.aborted)
            callback(); return () => controller.signal.removeEventListener("abort", callback); } };
    let rejectStopped!: (cause: Error) => void;
    const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
    const stop = () => { try {
        call.check();
    }
    catch (cause) {
        rejectStopped(cause as Error);
    } };
    controller.signal.addEventListener("abort", stop, { once: true });
    try {
        call.check();
        return await Promise.race([work(call), stopped]);
    }
    finally {
        clearTimeout(timer);
        off();
        controller.signal.removeEventListener("abort", stop);
    }
}
const adapter: ResourceFileAdapter<Blob> = {
    pick, size: file => file.size,
    async hash(file, call) {
        const hash = sha256.create();
        try {
            for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
                call.check();
                const bytes = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + 1024 * 1024)).arrayBuffer());
                call.check();
                hash.update(bytes);
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }
            call.check();
            return [...hash.digest()].map(byte => byte.toString(16).padStart(2, "0")).join("");
        }
        finally {
            hash.destroy();
        }
    },
    async put(file, grant, parent) {
        return network(parent, async (call) => {
            call.check();
            call.onProgress(null);
            let response: Response;
            try {
                response = await fetch(grant.url, { method: "PUT", body: file, headers: { ...grant.headers }, credentials: "omit", redirect: "error", signal: call.signal });
            }
            catch {
                call.check();
                throw new ApiError("파일 전송 결과를 확인하지 못했습니다. 원래 업로드 결과를 확인하세요.", 0);
            }
            call.check();
            if (!response.ok)
                throw new ApiError("파일 전송을 완료하지 못했습니다. 원래 업로드 결과를 확인하세요.", response.status);
            await response.body?.cancel().catch(() => { });
            call.onProgress(1);
        });
    },
    async download(endpoint, expected, parent) {
        return network(parent, async (call) => {
            call.check();
            let response: Response;
            try {
                response = await fetch(apiUrl(endpoint), { headers: { Authorization: `Bearer ${call.token}`, Accept: "application/octet-stream" }, signal: call.signal, cache: "no-store", redirect: "error" });
            }
            catch {
                call.check();
                throw new ApiError("파일을 내려받지 못했습니다. 연결을 확인하세요.", 0);
            }
            call.check();
            if (response.status !== 200) {
                const data: unknown = await response.json().catch(() => null);
                call.check();
                resourceBinaryError(response.status, data);
            }
            let info;
            try {
                info = resourceDownloadInfo(Object.fromEntries(response.headers.entries()), expected);
            }
            catch (cause) {
                await response.body?.cancel().catch(() => { });
                throw cause;
            }
            call.onProgress(null);
            let blob: Blob;
            if (response.body) {
                const reader = response.body.getReader();
                let count = 0;
                const off = call.onCancel(() => { void reader.cancel().catch(() => { }); });
                try {
                    const stream = new ReadableStream<Uint8Array>({
                        async pull(controller) {
                            try {
                                call.check();
                                const chunk = await reader.read();
                                call.check();
                                if (chunk.done) {
                                    if (count !== expected.size)
                                        throw new ApiError("파일이 완전히 내려받아지지 않았습니다.", 0);
                                    controller.close();
                                    return;
                                }
                                count += chunk.value.byteLength;
                                if (count > expected.size)
                                    throw new ApiError("파일 크기가 일치하지 않습니다.", 0);
                                call.onProgress(transferProgress(count, expected.size));
                                controller.enqueue(chunk.value);
                            }
                            catch (cause) {
                                void reader.cancel().catch(() => { });
                                controller.error(cause);
                            }
                        }, cancel() { return reader.cancel(); },
                    });
                    blob = await new Response(stream, { headers: { "Content-Type": info.mimeType } }).blob();
                }
                finally {
                    off();
                    reader.releaseLock();
                }
            }
            else
                blob = await response.blob();
            call.check();
            if (blob.size !== expected.size)
                throw new ApiError("파일이 완전히 내려받아지지 않았습니다.", 0);
            call.onProgress(1);
            return { file: blob, info };
        });
    },
    async head(file) { return new Uint8Array(await file.slice(0, 16).arrayBuffer()); },
    async export(file, info, action, call) {
        call.check();
        if (typeof document === "undefined")
            throw new ApiError("이 환경에서는 파일 저장을 지원하지 않습니다.", 0);
        if (action === "share")
            throw new ApiError("웹에서는 파일을 먼저 저장한 뒤 브라우저 또는 파일 앱에서 공유하세요.", 400);
        const value = url(file), anchor = document.createElement("a");
        let clicked = false;
        try {
            anchor.href = value;
            anchor.download = safeAttachmentFilename(info.name);
            anchor.style.display = "none";
            document.body.appendChild(anchor);
            call.check();
            anchor.click();
            clicked = true;
            call.check();
        }
        finally {
            anchor.remove();
            if (clicked)
                timers.set(value, setTimeout(() => revoke(value), 60000));
            else
                revoke(value);
        }
        return "파일 저장을 요청했습니다. 브라우저의 다운로드 목록에서 확인하세요.";
    },
    preview(file, mimeType) { const uri = url(file.slice(0, file.size, mimeType)); return { uri, release: () => revoke(uri) }; },
    release() { },
    async clear() { for (const cancel of [...pickers])
        cancel(); for (const value of [...urls])
        revoke(value); },
};
export const { pickResourceFile, discardResourceFile, createResourceUpload, createResourceFileTransfer, loadResourcePreview, clearResourceFileResources } = createResourceFileApi(adapter);
