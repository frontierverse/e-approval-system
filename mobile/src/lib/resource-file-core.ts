import { ApiError } from "./api";
import { attachmentDownloadInfo, attachmentFileSize, isAttachmentTransferCancellation } from "./attachment-file";
import { resourceAbort, resourceRequest } from "./resource-request";
import { isResourceFile, isResourceGrant, isResourceId, isResourceRequestId, isResourceUpload, validateResourceFile } from "./resources";
import type { AttachmentPolicy, ResourceFile, ResourceUploadDto, ResourceUploadGrant, ResourceUploadState } from "../types/resources";
export const resourceFileSize = attachmentFileSize;
export const isResourceFileCancellation = isAttachmentTransferCancellation;
export type ResourceFileScope = {
    token: string;
    isCurrent?: () => boolean;
    signal?: AbortSignal;
    onProgress?: (fraction: number | null) => void;
};
export type SelectedResourceFile = Readonly<{
    name: string;
    size: number;
    release(): void;
}>;
export type ResourceFilePickOptions = ResourceFileScope & {
    policy: AttachmentPolicy;
};
export type ResourceUploadOptions = ResourceFileScope & {
    file: SelectedResourceFile;
    targetResourceId: string | null;
    requestId: string;
};
export type ResourceUploadOperation = {
    prepare(): Promise<void>;
    refresh(): Promise<void>;
    readyUploadId(): string | null;
    getState(): {
        phase: "selected" | "hashing" | ResourceUploadState;
        busy: boolean;
        uncertain: boolean;
    };
    cancel(): void;
    release(): void;
};
export type ResourceFileTransfer = {
    download(): Promise<boolean>;
    save(): Promise<string | null>;
    share(): Promise<string | null>;
    isReady(): boolean;
    cancel(): void;
    release(): void;
};
export type ResourceFilePreview = {
    uri: string;
    kind: "image" | "pdf";
    mimeType: string;
    release(): void;
};
export type ResourceFileInfo = {
    name: string;
    mimeType: string;
    size: number;
};
export type ResourceFileCall = {
    token: string;
    signal: AbortSignal;
    check(): void;
    onProgress(fraction: number | null): void;
    onCancel(cancel: () => void): () => void;
};
export type ResourceFileAdapter<F> = {
    pick(options: ResourceFilePickOptions, call: ResourceFileCall): Promise<{
        file: F;
        name: string;
        mimeType: string;
        size: number;
    } | null>;
    size(file: F): number;
    hash(file: F, call: ResourceFileCall): Promise<string>;
    put(file: F, grant: NonNullable<ResourceUploadGrant["grant"]>, call: ResourceFileCall): Promise<void>;
    download(endpoint: string, expected: ResourceFile, call: ResourceFileCall): Promise<{
        file: F;
        info: ResourceFileInfo;
    }>;
    head(file: F): Promise<Uint8Array>;
    export(file: F, info: ResourceFileInfo, action: "save" | "share", call: ResourceFileCall): Promise<string | null>;
    preview(file: F, mimeType: string): {
        uri: string;
        release(): void;
    };
    release(file: F): void;
    clear(): Promise<void>;
};
export function resourceDownloadInfo(headers: Record<string, unknown>, expected: ResourceFile): ResourceFileInfo {
    let info: ReturnType<typeof attachmentDownloadInfo>;
    try {
        info = attachmentDownloadInfo(headers, expected.id);
    }
    catch {
        throw new ApiError("첨부 내려받기 정보를 확인하지 못했습니다. 다시 시도하세요.", 0);
    }
    const announced = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-length")?.[1];
    if (announced !== undefined && (typeof announced !== "string" || !/^\d+$/.test(announced) || !Number.isSafeInteger(Number(announced))))
        throw new ApiError("파일 크기 정보를 확인하지 못했습니다.", 0);
    if (info.size !== null && info.size !== expected.size)
        throw new ApiError("파일 크기가 일치하지 않습니다. 다시 내려받으세요.", 0);
    return { ...info, size: expected.size };
}
export function resourcePreviewKind(bytes: Uint8Array, mimeType: string): "image" | "pdf" {
    const ascii = (offset: number, text: string) => [...text].every((letter, index) => bytes[offset + index] === letter.charCodeAt(0));
    const valid = mimeType === "application/pdf" ? ascii(0, "%PDF-") : mimeType === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) : mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mimeType === "image/gif" ? ascii(0, "GIF87a") || ascii(0, "GIF89a") : mimeType === "image/webp" ? ascii(0, "RIFF") && ascii(8, "WEBP") : false;
    if (!valid)
        throw new ApiError("이 파일은 미리보기를 지원하지 않습니다. 파일 저장을 이용하세요.", 415);
    return mimeType === "application/pdf" ? "pdf" : "image";
}
export function resourceBinaryError(status: number, data: unknown): never {
    const value = data && typeof data === "object" ? data as Record<string, unknown> : null;
    throw new ApiError(typeof value?.error === "string" ? value.error : "파일 요청을 처리하지 못했습니다. 다시 확인하세요.", status, undefined, typeof value?.code === "string" ? value.code : undefined);
}
export function createResourceFileApi<F>(adapter: ResourceFileAdapter<F>, request = resourceRequest) {
    let generation = 0;
    const owned = new Set<F>();
    const active = new Set<() => void>();
    const previews = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    type Selection = {
        file: F;
        name: string;
        size: number;
        mimeType: string;
        token: string;
        generation: number;
        busy: boolean;
        released: boolean;
        operation?: ResourceUploadOperation;
        uploadBinding?: {
            requestId: string;
            targetResourceId: string | null;
        };
    };
    const selections = new WeakMap<SelectedResourceFile, Selection>();
    const entries = new Set<Selection>();
    function own(file: F) { owned.add(file); return file; }
    function remove(file: F) { owned.delete(file); adapter.release(file); }
    function context(options: ResourceFileScope) {
        const epoch = generation, controller = new AbortController(), callbacks = new Set<() => void>();
        const cancel = () => { controller.abort(); for (const callback of [...callbacks]) {
            try {
                callback();
            }
            catch { /* Cancellation is best effort. */ }
        } };
        active.add(cancel);
        const abort = () => cancel();
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted)
            cancel();
        const call: ResourceFileCall = {
            token: options.token, signal: controller.signal,
            check() { if (epoch !== generation || controller.signal.aborted || options.isCurrent && !options.isCurrent())
                throw resourceAbort(); if (!options.token)
                throw new ApiError("로그인이 필요합니다.", 401); },
            onProgress(fraction) { call.check(); options.onProgress?.(fraction); },
            onCancel(callback) { callbacks.add(callback); if (controller.signal.aborted)
                callback(); return () => { callbacks.delete(callback); }; },
        };
        return { call, cancel, finish() { active.delete(cancel); callbacks.clear(); options.signal?.removeEventListener("abort", abort); call.token = ""; } };
    }
    function validSelection(file: SelectedResourceFile, options: ResourceFileScope) {
        const entry = selections.get(file);
        if (!entry || entry.generation !== generation || entry.token !== options.token || options.isCurrent && !options.isCurrent())
            throw resourceAbort();
        return entry;
    }
    async function pickResourceFile(options: ResourceFilePickOptions): Promise<SelectedResourceFile | null> {
        const op = context(options);
        let local: F | undefined;
        try {
            op.call.check();
            const result = await adapter.pick(options, op.call);
            if (result)
                local = own(result.file);
            op.call.check();
            if (!result)
                return null;
            const name = validateResourceFile(result.name, result.size, options.policy);
            if (adapter.size(result.file) !== result.size)
                throw new ApiError("선택한 파일의 크기가 변경되었습니다. 다시 선택하세요.", 0);
            const entry: Selection = { ...result, name, token: options.token, generation, busy: false, released: false };
            const selected: SelectedResourceFile = Object.freeze({ name, size: result.size, release() {
                    entry.released = true;
                    // A private immutable attempt remains recoverable until explicit discard
                    // or account cleanup. Normal blur/unmount never substitutes a new key.
                    if (entry.busy || entry.operation)
                        return;
                    entries.delete(entry);
                    selections.delete(selected);
                    entry.token = "";
                    remove(entry.file);
                } });
            selections.set(selected, entry);
            entries.add(entry);
            local = undefined;
            return selected;
        }
        catch (cause) {
            if (isResourceFileCancellation(cause))
                return null;
            throw cause;
        }
        finally {
            if (local !== undefined)
                remove(local);
            op.finish();
        }
    }
    function discardResourceFile(file: SelectedResourceFile, options: Pick<ResourceFileScope, "token" | "isCurrent">) {
        const entry = validSelection(file, options);
        if (entry.busy)
            throw new ApiError("파일 요청을 처리하고 있습니다. 취소 후 결과를 확인하세요.", 409);
        entry.operation?.cancel();
        entry.operation = undefined;
        entry.token = "";
        entry.released = true;
        selections.delete(file);
        entries.delete(entry);
        remove(entry.file);
    }
    function createResourceUpload(options: ResourceUploadOptions): ResourceUploadOperation {
        const entry = validSelection(options.file, options);
        if (!isResourceRequestId(options.requestId) || options.targetResourceId !== null && !isResourceId(options.targetResourceId))
            throw new ApiError("파일 업로드 요청을 다시 확인하세요.", 400);
        if (entry.operation) {
            if (entry.uploadBinding?.requestId !== options.requestId || entry.uploadBinding.targetResourceId !== options.targetResourceId)
                throw new ApiError("원래 업로드 요청과 대상이 다릅니다. 같은 요청으로 결과를 확인하세요.", 409);
            return entry.operation;
        }
        if (entry.released)
            throw new ApiError("파일을 다시 선택하세요.", 0);
        let phase: "selected" | "hashing" | ResourceUploadState = "selected", uncertain = false, digest: string | undefined, upload: ResourceUploadDto | undefined;
        let putSent = false;
        let current: ReturnType<typeof context> | undefined;
        const check = () => { validSelection(options.file, options); if (adapter.size(entry.file) !== entry.size)
            throw new ApiError("선택한 파일의 사본이 변경되었습니다. 원본을 다시 선택하세요.", 0); };
        const body = () => ({ requestId: options.requestId, targetResourceId: options.targetResourceId, name: entry.name, mimeType: entry.mimeType, size: entry.size, wholeSha256: digest });
        function accept(value: unknown): ResourceUploadDto {
            if (!isResourceUpload(value) || value.targetResourceId !== options.targetResourceId || upload && upload.id !== value.id || value.file && (value.file.name !== entry.name || value.file.mimeType !== entry.mimeType || value.file.size !== entry.size || value.file.wholeSha256 !== digest) || value.state === "consumed" && options.targetResourceId !== null && value.consumedResourceId !== options.targetResourceId)
                throw new ApiError("파일 업로드 응답이 일치하지 않습니다. 같은 요청의 결과를 다시 확인하세요.", 200);
            upload = value;
            phase = value.state;
            uncertain = false;
            return value;
        }
        const json = async (path: string, method: "GET" | "POST", payload: unknown, call: ResourceFileCall) => {
            call.check();
            const value = await request<unknown>(path, call.token, { method, body: payload, signal: call.signal, timeoutMs: 120000 });
            call.check();
            return value;
        };
        async function work(action: "prepare" | "refresh") {
            check();
            if (entry.busy)
                throw new ApiError("파일 요청을 처리하고 있습니다.", 409);
            entry.busy = true;
            current = context(options);
            const op = current;
            try {
                op.call.check();
                if (!digest) {
                    if (action === "refresh")
                        throw new ApiError("파일 업로드를 먼저 시작하세요.", 0);
                    phase = "hashing";
                    op.call.onProgress(null);
                    digest = (await adapter.hash(entry.file, op.call)).toLowerCase();
                    op.call.check();
                    check();
                    if (!/^[a-f0-9]{64}$/.test(digest))
                        throw new ApiError("파일을 검증하지 못했습니다. 다시 선택하세요.", 0);
                }
                if (action === "refresh") {
                    const result = await json(upload ? `/resources/uploads/${upload.id}` : `/resources/uploads?requestId=${encodeURIComponent(options.requestId)}`, "GET", undefined, op.call) as {
                        upload?: unknown;
                    };
                    if (!result || Object.keys(result).length !== 1)
                        throw new ApiError("파일 업로드 결과를 확인하지 못했습니다.", 200);
                    accept(result.upload);
                    return;
                }
                if (upload && ["ready", "consumed", "deleted", "expired", "deleting"].includes(upload.state)) {
                    const value = await json(`/resources/uploads/${upload.id}`, "GET", undefined, op.call) as {
                        upload?: unknown;
                    };
                    accept(value.upload);
                    if (phase !== "ready" && phase !== "consumed")
                        throw new ApiError("이 업로드는 사용할 수 없습니다. 파일을 제거한 뒤 다시 선택하세요.", 410);
                    return;
                }
                let grant: ResourceUploadGrant["grant"] = null;
                if (!upload) {
                    uncertain = true;
                    const result = await json("/resources/uploads", "POST", body(), op.call);
                    if (!isResourceGrant(result))
                        throw new ApiError("파일 업로드 요청의 결과를 확인하지 못했습니다.", 201);
                    accept(result.upload);
                    grant = result.grant;
                }
                else if (upload.state === "uploading" && !putSent) {
                    uncertain = true;
                    const result = await json(`/resources/uploads/${upload.id}/grant`, "POST", {}, op.call);
                    if (!isResourceGrant(result))
                        throw new ApiError("파일 전송 정보를 확인하지 못했습니다.", 200);
                    accept(result.upload);
                    grant = result.grant;
                }
                if (upload?.state === "uploading" && !putSent) {
                    if (!grant)
                        throw new ApiError("파일 전송 정보를 다시 확인하세요.", 200);
                    uncertain = true;
                    check();
                    putSent = true;
                    await adapter.put(entry.file, grant, op.call);
                    op.call.check();
                    check();
                }
                if (upload && ["uploading", "finalizing"].includes(upload.state)) {
                    uncertain = true;
                    const value = await json(`/resources/uploads/${upload.id}/complete`, "POST", {}, op.call) as {
                        upload?: unknown;
                    };
                    if (!value || Object.keys(value).length !== 1)
                        throw new ApiError("파일 준비 결과를 확인하지 못했습니다.", 200);
                    accept(value.upload);
                }
                if (phase === "uploading")
                    throw new ApiError("업로드 결과가 확정되지 않았습니다. 같은 업로드의 결과를 다시 확인하세요.", 0);
                if (phase === "finalizing")
                    throw new ApiError("서버가 파일을 검증하고 있습니다. 업로드 결과 확인으로 다시 확인하세요.", 202);
                if (phase !== "ready" && phase !== "consumed")
                    throw new ApiError("파일을 사용할 수 없습니다. 업로드 결과를 확인하세요.", 410);
            }
            catch (cause) {
                if (cause instanceof ApiError && cause.status === 503 && cause.code === "UPLOAD_RETRY") {
                    // Only the server can prove the previous write absent. A pure status
                    // of uploading never authorizes retransmitting immutable bytes.
                    putSent = false;
                    uncertain = false;
                    phase = "uploading";
                    if (upload)
                        upload = { ...upload, state: "uploading" };
                }
                // Never discard the original upload start key or snapshot on response
                // loss. Even a subsequent 404 cannot prove the previous write absent.
                throw cause;
            }
            finally {
                op.finish();
                if (current === op)
                    current = undefined;
                entry.busy = false;
            }
        }
        const operation: ResourceUploadOperation = {
            prepare: () => work("prepare"), refresh: () => work("refresh"),
            readyUploadId() { try {
                check();
                return upload && upload.state === "ready" && Date.parse(upload.expiresAt) > Date.now() ? upload.id : null;
            }
            catch {
                return null;
            } },
            getState: () => ({ phase, busy: entry.busy, uncertain }),
            cancel() { current?.cancel(); },
            release() { options.file.release(); },
        };
        entry.uploadBinding = { requestId: options.requestId, targetResourceId: options.targetResourceId };
        entry.operation = operation;
        return operation;
    }
    function createResourceFileTransfer(options: ResourceFileScope & {
        attachment: ResourceFile;
    }): ResourceFileTransfer {
        if (!isResourceFile(options.attachment))
            throw new ApiError("첨부 정보를 다시 확인하세요.", 0);
        let local: F | undefined, info: ResourceFileInfo | undefined, busy = false, released = false, shared = false;
        let current: ReturnType<typeof context> | undefined;
        const epoch = generation;
        const check = () => { if (epoch !== generation || released || options.isCurrent && !options.isCurrent())
            throw resourceAbort(); };
        async function download() {
            check();
            if (busy)
                throw new ApiError("파일 요청을 처리하고 있습니다.", 409);
            if (local !== undefined)
                return true;
            busy = true;
            const op = context(options);
            current = op;
            let result: Awaited<ReturnType<typeof adapter.download>> | undefined;
            try {
                result = await adapter.download(`/resources/attachments/${options.attachment.id}/download`, options.attachment, op.call);
                own(result.file);
                op.call.check();
                check();
                local = result.file;
                info = result.info;
                result = undefined;
                return true;
            }
            catch (cause) {
                if (isResourceFileCancellation(cause))
                    return false;
                throw cause;
            }
            finally {
                if (result)
                    remove(result.file);
                op.finish();
                current = undefined;
                busy = false;
            }
        }
        async function exportFile(action: "save" | "share") {
            check();
            if (busy || local === undefined || !info)
                throw new ApiError("파일을 먼저 완전히 내려받으세요.", 0);
            busy = true;
            const op = context(options);
            current = op;
            try {
                const value = await adapter.export(local, info, action, op.call);
                op.call.check();
                check();
                if (value && (action === "share" || value.includes("공유 창")))
                    shared = true;
                return value;
            }
            finally {
                op.finish();
                current = undefined;
                busy = false;
            }
        }
        return {
            download, save: () => exportFile("save"), share: () => exportFile("share"),
            isReady() { try {
                check();
                return local !== undefined && !busy;
            }
            catch {
                return false;
            } },
            cancel() { current?.cancel(); },
            release() {
                if (released)
                    return;
                released = true;
                current?.cancel();
                if (local !== undefined) {
                    const file = local;
                    local = undefined;
                    if (shared && epoch === generation) {
                        const timer = setTimeout(() => { timers.delete(timer); if (owned.has(file))
                            remove(file); }, 10 * 60 * 1000);
                        timers.add(timer);
                    }
                    else
                        remove(file);
                }
            },
        };
    }
    async function loadResourcePreview(options: ResourceFileScope & {
        attachment: ResourceFile;
    }): Promise<ResourceFilePreview> {
        if (!isResourceFile(options.attachment) || options.attachment.previewKind === "unsupported")
            throw new ApiError("이 파일은 미리보기를 지원하지 않습니다.", 415);
        const op = context(options);
        let local: F | undefined;
        let preview: ReturnType<typeof adapter.preview> | undefined;
        try {
            const result = await adapter.download(`/resources/attachments/${options.attachment.id}/preview`, options.attachment, op.call);
            local = own(result.file);
            op.call.check();
            const kind = resourcePreviewKind(await adapter.head(local), result.info.mimeType);
            op.call.check();
            preview = adapter.preview(local, result.info.mimeType);
            const file = local, url = preview;
            local = undefined;
            preview = undefined;
            let released = false;
            const release = () => { if (released)
                return; released = true; previews.delete(release); url.release(); remove(file); };
            previews.add(release);
            return { uri: url.uri, kind, mimeType: result.info.mimeType, release };
        }
        finally {
            preview?.release();
            if (local !== undefined)
                remove(local);
            op.finish();
        }
    }
    async function clearResourceFileResources() {
        generation++;
        for (const cancel of [...active])
            cancel();
        active.clear();
        for (const timer of timers)
            clearTimeout(timer);
        timers.clear();
        for (const release of [...previews])
            release();
        previews.clear();
        for (const entry of entries) {
            entry.token = "";
            entry.operation = undefined;
            entry.released = true;
        }
        entries.clear();
        for (const file of [...owned])
            remove(file);
        owned.clear();
        await adapter.clear();
    }
    return { pickResourceFile, discardResourceFile, createResourceUpload, createResourceFileTransfer, loadResourcePreview, clearResourceFileResources };
}
