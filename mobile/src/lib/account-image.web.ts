import { ApiError, apiUrl } from "./api";
import { ACCOUNT_IMAGE_MIME_TYPES, accountImageAbortError, accountImageInputName, accountImagePath, accountImageResponse, isAccountImageAbortError, validateAccountImage, validateAccountImagePreview,
  type AccountImageLoadOptions, type AccountImageSource, type AccountImageUploadOptions, type SelectedAccountImage } from "./account-image-core";
export type { AccountImageKind, AccountImageSource, AccountImageUploadResult, SelectedAccountImage } from "./account-image-core";

const active = new Set<() => void>();
const resources = new Set<() => void>();
const selections = new Map<SelectedAccountImage, Blob>();
let generation = 0;
function resource(blob: Blob) {
  const uri = URL.createObjectURL(blob);
  let released = false;
  const release = () => { if (!released) { released = true; URL.revokeObjectURL(uri); resources.delete(release); } };
  resources.add(release);
  return { uri, release };
}
function requestOperation(signal?: AbortSignal) {
  const started = generation;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  active.add(cancel);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  return {
    signal: controller.signal,
    check() { if (controller.signal.aborted || started !== generation) throw accountImageAbortError(); },
    stopped() { return controller.signal.aborted || started !== generation; },
    finish() { active.delete(cancel); signal?.removeEventListener("abort", cancel); },
  };
}
function failure(error: unknown, stopped: boolean, message: string): never {
  if (stopped || isAccountImageAbortError(error)) throw accountImageAbortError();
  if (error instanceof ApiError) throw error;
  throw new ApiError(message, 0);
}
export async function clearAccountImageResources(): Promise<void> {
  generation += 1;
  for (const cancel of [...active]) cancel();
  for (const release of [...resources]) release();
}
export function pickAccountImage(): Promise<SelectedAccountImage | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const started = generation;
  // Keep browser activation synchronous; the input is removed on selection, cancellation and account change.
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg,.jpeg,.png,.webp," + ACCOUNT_IMAGE_MIME_TYPES.join(",");
  input.multiple = false;
  input.style.display = "none";
  document.body.appendChild(input);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => { input.remove(); active.delete(cancel); input.removeEventListener("change", changed); input.removeEventListener("cancel", cancel); };
    const finish = (image: SelectedAccountImage | null) => { if (!settled) { settled = true; cleanup(); resolve(image); } else image?.release(); };
    const cancel = () => finish(null);
    const changed = async () => {
      try {
        const file = input.files?.[0];
        if (!file) { finish(null); return; }
        const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        if (settled || started !== generation) { finish(null); return; }
        const metadata = validateAccountImage(file.name, file.size, bytes);
        const normalized = file.slice(0, file.size, metadata.mimeType);
        const preview = resource(normalized);
        const image: SelectedAccountImage = { ...metadata, uri: preview.uri, release: () => { selections.delete(image); resources.delete(image.release); preview.release(); } };
        // Account-wide cleanup releases both the URL and its uploadable file reference.
        resources.delete(preview.release);
        resources.add(image.release);
        selections.set(image, normalized);
        finish(image);
      } catch (error) {
        if (settled || started !== generation) { finish(null); return; }
        settled = true; cleanup();
        reject(error instanceof ApiError ? error : new ApiError("선택한 이미지를 읽을 수 없습니다. 다른 파일을 선택하세요.", 0));
      }
    };
    active.add(cancel);
    input.addEventListener("change", changed);
    input.addEventListener("cancel", cancel);
    try { input.click(); } catch (error) { settled = true; cleanup(); reject(error); }
  });
}
export async function uploadAccountImage(options: AccountImageUploadOptions) {
  const operation = requestOperation(options.signal);
  try {
    operation.check();
    if (!options.token) throw new ApiError("로그인이 필요합니다.", 401);
    const file = selections.get(options.image);
    if (!file) throw new ApiError("이미지를 다시 선택하세요.", 0);
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    operation.check();
    const metadata = validateAccountImage(options.image.name, file.size, bytes);
    const body = new FormData();
    body.append(accountImageInputName(options.kind), file, metadata.name);
    const response = await fetch(apiUrl(accountImagePath(options.kind)), { method: "POST", headers: { Authorization: `Bearer ${options.token}`, Accept: "application/json" },
      body, cache: "no-store", redirect: "error", signal: operation.signal });
    operation.check();
    const result: unknown = await response.json().catch(() => null);
    operation.check();
    return accountImageResponse(response.status, result);
  } catch (error) { return failure(error, operation.stopped(), "이미지를 저장하지 못했습니다. 연결을 확인하고 다시 시도하세요."); }
  finally { operation.finish(); }
}
export async function loadAccountImage(options: AccountImageLoadOptions): Promise<AccountImageSource> {
  const operation = requestOperation(options.signal);
  try {
    operation.check();
    if (!options.token) throw new ApiError("로그인이 필요합니다.", 401);
    const response = await fetch(apiUrl(accountImagePath(options.kind, options.updatedAt)), { headers: { Authorization: `Bearer ${options.token}`, Accept: ACCOUNT_IMAGE_MIME_TYPES.join(", ") },
      cache: "no-store", redirect: "error", signal: operation.signal });
    operation.check();
    if (response.status !== 200) {
      const body: unknown = await response.json().catch(() => null);
      operation.check();
      accountImageResponse(response.status, body);
      throw new ApiError("이미지를 불러오지 못했습니다.", response.status);
    }
    const blob = await response.blob();
    operation.check();
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    operation.check();
    validateAccountImagePreview(blob.size, bytes, Object.fromEntries(response.headers.entries()));
    return resource(blob);
  } catch (error) { return failure(error, operation.stopped(), "이미지를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요."); }
  finally { operation.finish(); }
}
