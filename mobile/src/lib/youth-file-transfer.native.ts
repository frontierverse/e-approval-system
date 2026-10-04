import * as DocumentPicker from "expo-document-picker";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import ReactNativeBlobUtil, { type FetchBlobResponse, type StatefulPromise } from "react-native-blob-util";
import { ApiError, apiUrl } from "./api";
import { availableAttachmentFilename, isAttachmentTransferCancellation, transferProgress } from "./attachment-file";
import { createYouthFileApi, youthBinaryError, youthDownloadInfo, type YouthFileAdapter, type YouthFileCall } from "./youth-file-core";
import { validateYouthDecisionFile } from "./youth-file-core";
export type { SelectedYouthFile, YouthUploadOperation, YouthDecisionTransfer, YouthFileScope, YouthDecisionPolicy } from './youth-file-core';
export { youthFileSize, isYouthFileCancellation } from './youth-file-core';
type LocalFile = {
    file: File;
    directory: Directory;
};
const directories = new Set<Directory>();
function remove(directory: Directory) { directories.delete(directory); try {
    if (directory.exists)
        directory.delete();
}
catch { /* Only owned private directories are removable. */ } }
function path(uri: string) { if (!uri.startsWith("file://"))
    throw new ApiError("앱 임시 파일을 확인하지 못했습니다.", 0); return decodeURIComponent(uri.slice(7)); }
function create(name: string): LocalFile {
    const parent = new Directory(Paths.cache, "youth-decision-file-transfers");
    parent.create({ intermediates: true, idempotent: true });
    const directory = new Directory(parent, `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    directory.create();
    directories.add(directory);
    return { file: new File(directory, name), directory };
}
function pickerCopy(uri: string) {
    const value = path(uri), prefix = path(new Directory(Paths.cache, "DocumentPicker").uri).replace(/\/$/, "") + "/";
    if (!value.startsWith(prefix) || value.slice(prefix.length).split("/").some(segment => segment === "." || segment === ".."))
        throw new ApiError("선택한 파일의 앱 사본을 확인하지 못했습니다. 다시 선택하세요.", 0);
    return new File(uri);
}
function checkDiskSpace(size: number) {
    const available = Paths.availableDiskSpace;
    if (typeof available !== "number" || !Number.isFinite(available) || available < size + 1024 * 1024)
        throw new ApiError("파일을 처리할 기기 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도하세요.", 0);
}
async function copy(source: File, target: File, length: number, call: YouthFileCall) {
    call.check();
    const reader = source.open(FileMode.ReadOnly);
    let writer: ReturnType<File["open"]> | undefined;
    try {
        writer = target.open(FileMode.WriteOnly);
        let copied = 0, ticks = 0;
        while (copied < length) {
            call.check();
            const bytes = reader.readBytes(Math.min(64 * 1024, length - copied));
            if (!bytes.length || bytes.length > length - copied)
                throw new ApiError("파일을 완전히 복사하지 못했습니다. 저장 위치를 확인하세요.", 0);
            writer.writeBytes(bytes);
            copied += bytes.length;
            if (++ticks % 16 === 0)
                await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        call.check();
    }
    finally {
        try {
            writer?.close();
        }
        finally {
            reader.close();
        }
    }
    if (!target.exists || target.size !== length)
        throw new ApiError("저장된 파일의 전체 크기를 확인하지 못했습니다.", 0);
}
async function response(task: StatefulPromise<FetchBlobResponse>, call: YouthFileCall, upload = false) {
    const cancel = () => { try {
        task.cancel();
    }
    catch { /* The request may already have completed. */ } };
    const off = call.onCancel(cancel);
    if (upload)
        task.uploadProgress({ interval: 250 }, (written, total) => { try {
            call.check();
            call.onProgress(transferProgress(written, total));
        }
        catch {
            cancel();
        } });
    else
        task.progress({ interval: 250 }, (received, total) => { try {
            call.check();
            call.onProgress(transferProgress(received, total));
        }
        catch {
            cancel();
        } });
    try {
        const value = await task;
        call.check();
        return value;
    }
    catch (cause) {
        call.check();
        if (cause instanceof ApiError || isAttachmentTransferCancellation(cause))
            throw cause;
        throw new ApiError("파일 전송 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.", 0);
    }
    finally {
        off();
    }
}
const adapter: YouthFileAdapter<LocalFile> = {
    async pick(options, call) {
        let copied: File | undefined, snapshot: LocalFile | undefined;
        try {
            call.check();
            const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, base64: false });
            if (result.canceled)
                return null;
            const asset = result.assets[0];
            if (!asset)
                throw new ApiError("선택한 파일을 확인하지 못했습니다.", 0);
            copied = pickerCopy(asset.uri);
            call.check();
            const size = copied.size, name = validateYouthDecisionFile(asset.name, size, options.policy);
            if (typeof asset.size === "number" && asset.size !== size)
                throw new ApiError("선택한 파일 크기가 변경되었습니다. 다시 선택하세요.", 0);
            const mimeType = asset.mimeType && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(asset.mimeType) ? asset.mimeType.toLowerCase() : "application/octet-stream";
            snapshot = create(name);
            await copied.move(snapshot.file);
            copied = undefined;
            call.check();
            if (!snapshot.file.exists || snapshot.file.size !== size)
                throw new ApiError("선택한 파일의 전체 사본을 확인하지 못했습니다.", 0);
            // The picker-owned cache copy is moved, not duplicated. Provider originals
            // are never deleted and 300MiB files never enter a JS buffer/base64 string.
            checkDiskSpace(0);
            const file = snapshot;
            snapshot = undefined;
            return { file, name, size, mimeType };
        }
        catch (cause) {
            if (isAttachmentTransferCancellation(cause))
                return null;
            throw cause;
        }
        finally {
            if (copied) {
                try {
                    if (copied.exists)
                        copied.delete();
                }
                catch { /* Never remove the external original. */ }
            }
            if (snapshot)
                remove(snapshot.directory);
        }
    },
    size: local => local.file.exists ? local.file.size : -1,
    async hash(local, call) {
        call.check();
        try {
            const value = await ReactNativeBlobUtil.fs.hash(path(local.file.uri), "sha256");
            call.check();
            return value;
        }
        catch {
            call.check();
            throw new ApiError("파일 검증을 완료하지 못했습니다. 원본을 다시 선택하거나 같은 업로드를 확인하세요.", 0);
        }
    },
    async put(local, grant, call) {
        call.check();
        const value = await response(ReactNativeBlobUtil.config({ timeout: 120000, followRedirect: false }).fetch("PUT", grant.url, { ...grant.headers }, ReactNativeBlobUtil.wrap(path(local.file.uri))), call, true);
        if (value.info().status < 200 || value.info().status >= 300)
            throw new ApiError("파일 전송을 완료하지 못했습니다. 원래 업로드 결과를 확인한 뒤 다시 시도하세요.", value.info().status);
    },
    async download(endpoint, expected, call) {
        checkDiskSpace(expected.size);
        const local = create("download.part");
        let success = false;
        try {
            call.check();
            call.onProgress(null);
            const value = await response(ReactNativeBlobUtil.config({ path: path(local.file.uri), timeout: 120000, followRedirect: false }).fetch("POST", apiUrl(endpoint), { Authorization: `Bearer ${call.token}`, Accept: "application/octet-stream", "Content-Type": "application/json" }, JSON.stringify(call.downloadBody)), call);
            const metadata = value.info();
            if (metadata.status !== 200) {
                const data: unknown = local.file.exists && local.file.size <= 16 * 1024 ? await value.json().catch(() => null) : null;
                call.check();
                youthBinaryError(metadata.status, data);
            }
            const info = youthDownloadInfo(metadata.headers, expected);
            if (!local.file.exists || local.file.size !== expected.size)
                throw new ApiError("파일이 완전히 내려받아지지 않았습니다. 다시 내려받으세요.", 0);
            const complete = new File(local.directory, info.name);
            await local.file.move(complete);
            local.file = complete;
            call.check();
            call.onProgress(1);
            success = true;
            return { file: local, info };
        }
        finally {
            if (!success)
                remove(local.directory);
        }
    },
    async head(local) { const handle = local.file.open(FileMode.ReadOnly); try {
        return handle.readBytes(16);
    }
    finally {
        handle.close();
    } },
    async export(local, info, action, call) {
        call.check();
        if (action === "share" || Platform.OS === "ios") {
            if (!(await Sharing.isAvailableAsync()))
                throw new ApiError("이 기기에서는 파일 공유를 지원하지 않습니다.", 0);
            call.check();
            await Sharing.shareAsync(local.file.uri, { mimeType: info.mimeType, dialogTitle: action === "save" ? "파일에 저장" : "파일 공유" });
            call.check();
            return "파일 공유 창을 열었습니다. 파일 앱에서 저장 위치를 선택할 수 있습니다.";
        }
        let target: File | undefined, saved = false;
        try {
            const folder = await Directory.pickDirectoryAsync();
            call.check();
            if (!folder)
                return null;
            const occupied = folder.info().files;
            if (!occupied)
                throw new ApiError("저장 폴더의 파일 목록을 확인하지 못했습니다.", 0);
            const name = availableAttachmentFilename(info.name, occupied);
            target = folder.createFile(name, info.mimeType);
            await copy(local.file, target, info.size, call);
            call.check();
            if (!target.exists || target.size !== info.size)
                throw new ApiError("저장된 파일의 전체 크기를 확인하지 못했습니다.", 0);
            saved = true;
            return `${name} 파일을 저장했습니다.`;
        }
        catch (cause) {
            if (isAttachmentTransferCancellation(cause))
                return null;
            throw cause;
        }
        finally {
            if (target && !saved) {
                try {
                    if (target.exists)
                        target.delete();
                }
                catch { /* Remove only this operation's new partial. */ }
            }
        }
    },
    preview(local) { return { uri: local.file.uri, release() { } }; },
    release: local => remove(local.directory),
    async clear() {
        for (const directory of [...directories]) remove(directory);
        // Startup has no in-memory handles for copies left by an interrupted
        // process. The whole app-owned cache subtree is safe to purge before
        // a different account can start an operation.
        const parent = new Directory(Paths.cache, "youth-decision-file-transfers");
        try { if (parent.exists) parent.delete(); } catch { /* Cache cleanup is best effort. */ }
    },
};
export const { pickYouthDecisionFile, discardYouthDecisionFile, purgeYouthDecisionFile, createYouthDecisionUpload, createYouthDecisionTransfer, clearYouthFileResources } = createYouthFileApi(adapter);
