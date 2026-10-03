import * as DocumentPicker from "expo-document-picker";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import ReactNativeBlobUtil, { type FetchBlobResponse, type StatefulPromise } from "react-native-blob-util";
import { ApiError, apiUrl } from "./api";
import { ACCOUNT_IMAGE_MIME_TYPES, accountImageAbortError, accountImageInputName, accountImagePath, accountImageResponse, isAccountImageAbortError, validateAccountImage, validateAccountImagePreview,
  type AccountImageLoadOptions, type AccountImageSource, type AccountImageUploadOptions, type SelectedAccountImage } from "./account-image-core";
export type { AccountImageKind, AccountImageSource, AccountImageUploadResult, SelectedAccountImage } from "./account-image-core";

const CACHE_NAME = "account-images";
const resources = new Set<() => void>();
const selections = new Map<SelectedAccountImage, { file: File; name: string; size: number; mimeType: string }>();
const active = new Set<() => void>();
let generation = 0;
function rootCache() { return new Directory(Paths.cache, CACHE_NAME); }
function remove(directory: Directory) { try { if (directory.exists) directory.delete(); } catch { /* Retried by account cleanup. */ } }
function operationCache() {
  const root = rootCache();
  root.create({ intermediates: true, idempotent: true });
  const cache = new Directory(root, `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  cache.create();
  return cache;
}
function localPath(uri: string) {
  if (!uri.startsWith("file://")) throw new ApiError("선택한 이미지의 임시 파일을 읽을 수 없습니다. 다시 선택하세요.", 0);
  return decodeURIComponent(uri.slice(7));
}
function pickerCacheFile(uri: string) {
  const path = localPath(uri);
  const expected = localPath(new Directory(Paths.cache, "DocumentPicker").uri).replace(/\/$/, "") + "/";
  if (!path.startsWith(expected) || path.slice(expected.length).split("/").some(segment => segment === "." || segment === "..")) throw new ApiError("선택한 이미지의 임시 파일을 읽을 수 없습니다. 다시 선택하세요.", 0);
  return new File(uri);
}
function peek(file: File) {
  const reader = file.open(FileMode.ReadOnly);
  try { return reader.readBytes(12); } finally { reader.close(); }
}
function requestOperation(signal?: AbortSignal) {
  const started = generation;
  let cancelled = false;
  let task: StatefulPromise<FetchBlobResponse> | null = null;
  const cancel = () => { cancelled = true; try { task?.cancel(); } catch { /* A completed request is no longer cancellable. */ } };
  active.add(cancel);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  return {
    check() { if (cancelled || started !== generation) throw accountImageAbortError(); },
    attach(request: StatefulPromise<FetchBlobResponse>) { task = request; if (cancelled || started !== generation) cancel(); return request; },
    stopped() { return cancelled || started !== generation; },
    finish() { task = null; active.delete(cancel); signal?.removeEventListener("abort", cancel); },
  };
}
function failure(error: unknown, stopped: boolean, message: string): never {
  if (stopped || isAccountImageAbortError(error)) throw accountImageAbortError();
  if (error instanceof ApiError) throw error;
  throw new ApiError(message, 0);
}
export async function clearAccountImageResources(): Promise<void> {
  generation += 1;
  for (const cancel of active) cancel();
  for (const release of [...resources]) release();
  remove(rootCache());
}
export async function pickAccountImage(): Promise<SelectedAccountImage | null> {
  const started = generation;
  let copied: File | null = null;
  let cache: Directory | null = null;
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: ACCOUNT_IMAGE_MIME_TYPES, multiple: false, copyToCacheDirectory: true, base64: false });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) throw new ApiError("선택한 이미지를 읽을 수 없습니다.", 0);
    // Delete only the cache copy created by DocumentPicker, never the user's original.
    copied = pickerCacheFile(asset.uri);
    if (started !== generation) return null;
    const metadata = validateAccountImage(asset.name, copied.size, peek(copied));
    cache = operationCache();
    const file = new File(cache, metadata.name);
    await copied.move(file);
    copied = null;
    if (started !== generation) return null;
    const ownedCache = cache;
    const image: SelectedAccountImage = { ...metadata, uri: file.uri, release: () => {
      selections.delete(image); resources.delete(image.release); remove(ownedCache);
    } };
    selections.set(image, { file, ...metadata });
    resources.add(image.release);
    cache = null;
    return image;
  } catch (error) {
    if (started !== generation || isAccountImageAbortError(error)) return null;
    return failure(error, false, "이미지를 선택하지 못했습니다. 파일을 확인하고 다시 시도하세요.");
  } finally {
    if (copied) { try { if (copied.exists) copied.delete(); } catch { /* Only a DocumentPicker-owned temporary copy is eligible. */ } }
    if (cache) remove(cache);
  }
}
export async function uploadAccountImage(options: AccountImageUploadOptions) {
  const operation = requestOperation(options.signal);
  try {
    operation.check();
    if (!options.token) throw new ApiError("로그인이 필요합니다.", 401);
    const selected = selections.get(options.image);
    if (!selected || !selected.file.exists) throw new ApiError("이미지를 다시 선택하세요.", 0);
    const metadata = validateAccountImage(selected.name, selected.file.size, peek(selected.file));
    const response = await operation.attach(ReactNativeBlobUtil.config({ timeout: 120_000, followRedirect: false }).fetch("POST", apiUrl(accountImagePath(options.kind)), {
      Authorization: `Bearer ${options.token}`, Accept: "application/json", "Content-Type": "multipart/form-data",
    }, [{ name: accountImageInputName(options.kind), filename: metadata.name, type: metadata.mimeType, data: ReactNativeBlobUtil.wrap(localPath(selected.file.uri)) }]));
    operation.check();
    let body: unknown = null;
    try { body = await response.json(); } catch { /* Response validation below retains the HTTP status. */ }
    operation.check();
    return accountImageResponse(response.info().status, body);
  } catch (error) { return failure(error, operation.stopped(), "이미지를 저장하지 못했습니다. 연결을 확인하고 다시 시도하세요."); }
  finally { operation.finish(); }
}
export async function loadAccountImage(options: AccountImageLoadOptions): Promise<AccountImageSource> {
  const operation = requestOperation(options.signal);
  let cache: Directory | null = null;
  try {
    operation.check();
    if (!options.token) throw new ApiError("로그인이 필요합니다.", 401);
    const url = apiUrl(accountImagePath(options.kind, options.updatedAt));
    cache = operationCache();
    const file = new File(cache, "preview.part");
    const response = await operation.attach(ReactNativeBlobUtil.config({ path: localPath(file.uri), timeout: 120_000, followRedirect: false }).fetch("GET", url, {
      Authorization: `Bearer ${options.token}`, Accept: ACCOUNT_IMAGE_MIME_TYPES.join(", "),
    }));
    operation.check();
    const info = response.info();
    if (info.status !== 200) {
      let body: unknown = null;
      try { body = await response.json(); } catch { /* HTTP status is authoritative, including invalid JSON errors. */ }
      accountImageResponse(info.status, body);
      throw new ApiError("이미지를 불러오지 못했습니다.", info.status);
    }
    if (!file.exists) throw new ApiError("이미지를 불러오지 못했습니다. 다시 시도하세요.", 0);
    const mimeType = validateAccountImagePreview(file.size, peek(file), info.headers);
    const preview = new File(cache, `preview.${mimeType === "image/jpeg" ? "jpg" : mimeType.slice(6)}`);
    await file.move(preview);
    operation.check();
    const ownedCache = cache;
    const release = () => { resources.delete(release); remove(ownedCache); };
    resources.add(release);
    cache = null;
    return { uri: preview.uri, release };
  } catch (error) { return failure(error, operation.stopped(), "이미지를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요."); }
  finally { operation.finish(); if (cache) remove(cache); }
}
