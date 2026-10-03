import { ApiError } from "./api";
import type { AttachmentPolicy, MobileResource, ResourceCategory, ResourceDetailResponse, ResourceEditorResponse, ResourceFile, ResourceLevelFilter, ResourceListResponse, ResourceMutationResult, ResourceOptionsResponse, ResourceUploadDto, ResourceUploadGrant, ResourceUser, ResourceViewer, ResourceViewersResponse, ResourceVisitResult } from "../types/resources";
export const resourceCategories = [
    { value: "corporation", label: "법인" }, { value: "cafe", label: "카페" },
    { value: "bajaul", label: "바자울" }, { value: "education", label: "교육" },
] as const;
export const resourceLevels = [
    { value: "all", label: "전체" }, { value: "common", label: "공통" },
    { value: "high", label: "고등" }, { value: "middle", label: "중등" },
] as const;
export function resourceCategoryLabel(value: ResourceCategory) { return resourceCategories.find(item => item.value === value)?.label ?? "자료"; }
export function resourceLevelLabel(value: ResourceLevelFilter | null) { return resourceLevels.find(item => item.value === value)?.label ?? ""; }
export function resourceScalar(value: unknown): string | undefined { return value === undefined ? undefined : typeof value === "string" ? value : ""; }
export function resourceCategory(value: unknown): ResourceCategory | null {
    return value === undefined ? "corporation" : resourceCategories.some(item => item.value === value) ? value as ResourceCategory : null;
}
export function resourceLevel(value: unknown): ResourceLevelFilter | null {
    return value === undefined ? "all" : resourceLevels.some(item => item.value === value) ? value as ResourceLevelFilter : null;
}
export function resourcePage(value: unknown): number | null {
    if (value === undefined)
        return 1;
    return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}
export function isResourceId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
export function isResourceRequestId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value); }
// Request IDs identify attempts, not secrets. Existing Hermes does not require a
// cryptographic RNG/polyfill or a native module for this collision-resistant key.
export function newResourceRequestId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, letter => {
        const value = Math.floor(Math.random() * 16);
        return (letter === "x" ? value : (value & 3) | 8).toString(16);
    });
}
export function isResourceTimestamp(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function formatResourceTimestamp(value: string) {
    if (!isResourceTimestamp(value))
        return "날짜 확인 필요";
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function keys(value: Record<string, unknown>, names: string[]) { return Object.keys(value).length === names.length && Object.keys(value).every(name => names.includes(name)); }
function text(value: unknown): value is string { return typeof value === "string"; }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function uniqueIds(values: {
    id: string;
}[]) { return new Set(values.map(value => value.id)).size === values.length; }
export function isResourceUser(value: unknown): value is ResourceUser {
    return object(value) && keys(value, ["id", "name", "departmentName", "positionName"]) && isResourceId(value.id) && text(value.name) && text(value.departmentName) && text(value.positionName);
}
export function isResourceFile(value: unknown): value is ResourceFile {
    return object(value) && keys(value, ["id", "name", "mimeType", "size", "previewKind"]) && isResourceId(value.id) && text(value.name) && !!value.name && text(value.mimeType) && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(value.mimeType) && count(value.size) && ["image", "pdf", "unsupported"].includes(String(value.previewKind));
}
export function isMobileResource(value: unknown): value is MobileResource {
    return object(value) && keys(value, ["id", "title", "summary", "category", "educationLevel", "pinned", "createdAt", "updatedAt", "uniqueViewerCount", "author", "canManage", "attachments"]) &&
        isResourceId(value.id) && text(value.title) && text(value.summary) && resourceCategory(value.category) === value.category &&
        (value.category === "education" ? ["common", "high", "middle"].includes(String(value.educationLevel)) : value.educationLevel === null) &&
        typeof value.pinned === "boolean" && typeof value.canManage === "boolean" && isResourceTimestamp(value.createdAt) && isResourceTimestamp(value.updatedAt) &&
        count(value.uniqueViewerCount) && isResourceUser(value.author) && Array.isArray(value.attachments) && value.attachments.every(isResourceFile) && uniqueIds(value.attachments);
}
export function isResourcePolicy(value: unknown): value is AttachmentPolicy {
    return object(value) && keys(value, ["maxFileCount", "maxFileSizeMb", "allowedExtensions"]) && count(value.maxFileCount) && value.maxFileCount >= 1 && value.maxFileCount <= 20 && count(value.maxFileSizeMb) && value.maxFileSizeMb >= 1 && value.maxFileSizeMb <= 300 && value.maxFileCount * value.maxFileSizeMb <= 300 && Array.isArray(value.allowedExtensions) && value.allowedExtensions.every(extension => typeof extension === "string" && /^\.[a-z0-9]+$/.test(extension)) && new Set(value.allowedExtensions).size === value.allowedExtensions.length;
}
function pagination(value: Record<string, unknown>, size: number, length: number) {
    return value.pageSize === size && count(value.total) && count(value.totalPages) && value.totalPages === Math.max(1, Math.ceil(value.total / size)) && count(value.page) && value.page >= 1 && value.page <= value.totalPages && length === Math.max(0, Math.min(size, value.total - (value.page - 1) * size));
}
export function isResourceList(value: unknown): value is ResourceListResponse {
    return object(value) && keys(value, ["items", "category", "level", "q", "page", "pageSize", "total", "totalPages"]) && resourceCategory(value.category) === value.category && resourceLevel(value.level) === value.level && (value.category === "education" || value.level === "all") && text(value.q) && Array.isArray(value.items) && value.items.every(isMobileResource) && uniqueIds(value.items) && value.items.every(item => item.category === value.category && (value.level === "all" || item.educationLevel === value.level)) && pagination(value, value.category === "education" ? 10 : 3, value.items.length);
}
export function isResourceOptions(value: unknown): value is ResourceOptionsResponse {
    return object(value) && keys(value, ["defaults", "attachmentPolicy"]) && object(value.defaults) && keys(value.defaults, ["category", "educationLevel"]) && value.defaults.category === "bajaul" && value.defaults.educationLevel === null && isResourcePolicy(value.attachmentPolicy);
}
export function isResourceDetail(value: unknown, id: string): value is ResourceDetailResponse {
    return object(value) && keys(value, ["resource"]) && isMobileResource(value.resource) && value.resource.id === id;
}
export function isResourceEditor(value: unknown, id: string): value is ResourceEditorResponse {
    return object(value) && keys(value, ["resource", "attachmentPolicy"]) && isMobileResource(value.resource) && value.resource.id === id && value.resource.canManage && isResourcePolicy(value.attachmentPolicy);
}
function visitTimes(value: Record<string, unknown>) { return isResourceTimestamp(value.firstViewedAt) && isResourceTimestamp(value.lastViewedAt) && value.firstViewedAt <= value.lastViewedAt && count(value.visitCount) && value.visitCount >= 1; }
export function isResourceViewer(value: unknown): value is ResourceViewer { return object(value) && keys(value, ["user", "firstViewedAt", "lastViewedAt", "visitCount"]) && isResourceUser(value.user) && visitTimes(value); }
export function isResourceViewers(value: unknown, id: string): value is ResourceViewersResponse {
    return object(value) && keys(value, ["resourceId", "uniqueViewerCount", "items", "page", "pageSize", "total", "totalPages"]) && value.resourceId === id && count(value.uniqueViewerCount) && count(value.total) && Array.isArray(value.items) && value.items.every(isResourceViewer) && new Set(value.items.map(item => item.user.id)).size === value.items.length && pagination(value, 20, value.items.length);
}
export function isResourceVisit(value: unknown, id: string): value is ResourceVisitResult {
    return object(value) && keys(value, ["ok", "replayed", "resourceId", "uniqueViewerCount", "viewer"]) && value.ok === true && typeof value.replayed === "boolean" && value.resourceId === id && count(value.uniqueViewerCount) && value.uniqueViewerCount >= 1 && object(value.viewer) && keys(value.viewer, ["firstViewedAt", "lastViewedAt", "visitCount"]) && visitTimes(value.viewer);
}
export function isResourceMutation(value: unknown, expected: {
    operation: ResourceMutationResult["operation"];
    resourceId?: string;
}): value is ResourceMutationResult {
    if (!object(value) || !keys(value, ["ok", "message", "replayed", "operation", "outcome", "resourceId", "committedUpdatedAt", "resource", "cleanupPending"]) || value.ok !== true || !text(value.message) || typeof value.replayed !== "boolean" || value.operation !== expected.operation || !isResourceId(value.resourceId) || expected.resourceId && value.resourceId !== expected.resourceId || typeof value.cleanupPending !== "boolean")
        return false;
    if (value.operation !== "delete" && !isResourceTimestamp(value.committedUpdatedAt) || value.operation === "delete" && value.committedUpdatedAt !== null && !isResourceTimestamp(value.committedUpdatedAt))
        return false;
    // A receipt proves the original operation. Its live projection may be newer
    // or deleted; never compare current body/token to the original input.
    return value.outcome === "deleted" ? value.resource === null : value.outcome === "present" && value.operation !== "delete" && isMobileResource(value.resource) && value.resource.id === value.resourceId && value.resource.canManage;
}
export function isResourceUpload(value: unknown): value is ResourceUploadDto {
    if (!object(value) || !keys(value, ["id", "targetResourceId", "file", "state", "expiresAt", "completedAt", "consumedResourceId", "cleanupPending"]) || !isResourceId(value.id) || value.targetResourceId !== null && !isResourceId(value.targetResourceId) || !["uploading", "finalizing", "ready", "consumed", "deleting", "deleted", "expired"].includes(String(value.state)) || !isResourceTimestamp(value.expiresAt) || value.completedAt !== null && !isResourceTimestamp(value.completedAt) || value.consumedResourceId !== null && !isResourceId(value.consumedResourceId) || typeof value.cleanupPending !== "boolean")
        return false;
    if (value.file === null)
        return ["deleting", "deleted", "expired"].includes(String(value.state));
    return object(value.file) && keys(value.file, ["name", "mimeType", "size", "wholeSha256"]) && text(value.file.name) && !!value.file.name && text(value.file.mimeType) && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(value.file.mimeType) && count(value.file.size) && value.file.size > 0 && value.file.size <= 300 * 1024 * 1024 && text(value.file.wholeSha256) && /^[a-f0-9]{64}$/.test(value.file.wholeSha256) && (!["ready", "consumed"].includes(String(value.state)) || isResourceTimestamp(value.completedAt)) && (value.state !== "consumed" || isResourceId(value.consumedResourceId));
}
export function isResourceGrant(value: unknown): value is ResourceUploadGrant {
    if (!object(value) || !keys(value, ["upload", "grant"]) || !isResourceUpload(value.upload))
        return false;
    if (value.grant === null)
        return value.upload.state !== "uploading";
    const grant = value.grant;
    if (value.upload.state !== "uploading" || !object(grant) || !keys(grant, ["method", "url", "headers", "expiresAt"]) || grant.method !== "PUT" || !text(grant.url) || !isResourceTimestamp(grant.expiresAt) || !object(grant.headers) || !keys(grant.headers, ["Content-Type"]) || !text(grant.headers["Content-Type"]) || !/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(grant.headers["Content-Type"]))
        return false;
    try {
        const url = new URL(grant.url);
        return url.protocol === "https:" && !url.username && !url.password && !url.hash;
    }
    catch {
        return false;
    }
}
export function resourceFieldErrors(input: {
    title: string;
    summary: string;
    category: ResourceCategory;
    educationLevel: ResourceLevelFilter | null;
}) {
    const errors: Record<string, string> = {};
    if (input.title.trim().length < 2 || input.title.trim().length > 120)
        errors.title = "제목은 2~120자로 입력하세요.";
    if (input.summary.trim().length < 5 || input.summary.trim().length > 1000)
        errors.summary = "내용은 5~1,000자로 입력하세요.";
    if (input.category === "education" && !["common", "high", "middle"].includes(input.educationLevel ?? ""))
        errors.educationLevel = "교육 대상을 선택하세요.";
    return errors;
}
export function resourceUnknown(cause: unknown) {
    return !(cause instanceof ApiError) || cause.status === 0 || cause.status === 408 || cause.status >= 500 || cause.status >= 200 && cause.status < 300 || cause.status === 409;
}
export function resourceError(cause: unknown) { return cause instanceof Error ? cause.message : "자료 요청을 처리하지 못했습니다. 다시 확인하세요."; }
export function resourcePrivateFailure(cause: unknown) { return cause instanceof ApiError && [401, 403, 404].includes(cause.status); }
export function resourceUploadName(name: string) { return name.split(/[\\/]/).pop()?.trim().slice(0, 180) || "attachment"; }
export function validateResourceFile(name: string, size: number, policy: AttachmentPolicy) {
    const normalized = resourceUploadName(name), index = normalized.lastIndexOf("."), extension = index < 0 ? "" : normalized.slice(index).toLowerCase();
    if (!isResourcePolicy(policy))
        throw new ApiError("첨부 정책을 다시 확인하세요.", 0);
    if (!policy.allowedExtensions.includes(extension))
        throw new ApiError("허용되지 않는 파일 형식입니다.", 415);
    if (!Number.isSafeInteger(size) || size <= 0 || size > policy.maxFileSizeMb * 1024 * 1024)
        throw new ApiError(`파일은 0바이트보다 크고 ${policy.maxFileSizeMb}MB 이하여야 합니다.`, 413);
    return normalized;
}
