export type ResourceCategory = "corporation" | "cafe" | "bajaul" | "education";
export type ResourceEducationLevel = "common" | "high" | "middle";
export type ResourceLevelFilter = "all" | ResourceEducationLevel;
export type ResourceUser = {
    id: string;
    name: string;
    departmentName: string;
    positionName: string;
};
export type ResourceFile = {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    previewKind: "image" | "pdf" | "unsupported";
};
export type MobileResource = {
    id: string;
    title: string;
    summary: string;
    category: ResourceCategory;
    educationLevel: ResourceEducationLevel | null;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
    uniqueViewerCount: number;
    author: ResourceUser;
    canManage: boolean;
    attachments: ResourceFile[];
};
export type AttachmentPolicy = {
    maxFileCount: number;
    maxFileSizeMb: number;
    allowedExtensions: string[];
};
export type ResourceListResponse = {
    items: MobileResource[];
    category: ResourceCategory;
    level: ResourceLevelFilter;
    q: string;
    page: number;
    pageSize: 3 | 10;
    total: number;
    totalPages: number;
};
export type ResourceOptionsResponse = {
    defaults: {
        category: "bajaul";
        educationLevel: null;
    };
    attachmentPolicy: AttachmentPolicy;
};
export type ResourceDetailResponse = {
    resource: MobileResource;
};
export type ResourceEditorResponse = ResourceDetailResponse & {
    attachmentPolicy: AttachmentPolicy;
};
export type ResourceViewer = {
    user: ResourceUser;
    firstViewedAt: string;
    lastViewedAt: string;
    visitCount: number;
};
export type ResourceViewersResponse = {
    resourceId: string;
    uniqueViewerCount: number;
    items: ResourceViewer[];
    page: number;
    pageSize: 20;
    total: number;
    totalPages: number;
};
export type ResourceVisitResult = {
    ok: true;
    replayed: boolean;
    resourceId: string;
    uniqueViewerCount: number;
    viewer: {
        firstViewedAt: string;
        lastViewedAt: string;
        visitCount: number;
    };
};
export type ResourceMutationResult = {
    ok: true;
    message: string;
    replayed: boolean;
    operation: "create" | "update" | "delete";
    outcome: "present" | "deleted";
    resourceId: string;
    committedUpdatedAt: string | null;
    resource: MobileResource | null;
    cleanupPending: boolean;
};
export type ResourceCreateInput = {
    requestId: string;
    title: string;
    summary: string;
    category: ResourceCategory;
    educationLevel: ResourceEducationLevel | null;
    uploadIds: string[];
};
export type ResourceUpdateInput = ResourceCreateInput & {
    expectedUpdatedAt: string;
    removeAttachmentIds: string[];
};
export type ResourceDeleteInput = {
    requestId: string;
    expectedUpdatedAt: string;
};
export type ResourceUploadState = "uploading" | "finalizing" | "ready" | "consumed" | "deleting" | "deleted" | "expired";
export type ResourceUploadDto = {
    id: string;
    targetResourceId: string | null;
    file: {
        name: string;
        mimeType: string;
        size: number;
        wholeSha256: string;
    } | null;
    state: ResourceUploadState;
    expiresAt: string;
    completedAt: string | null;
    consumedResourceId: string | null;
    cleanupPending: boolean;
};
export type ResourceUploadGrant = {
    upload: ResourceUploadDto;
    grant: {
        method: "PUT";
        url: string;
        headers: {
            "Content-Type": string;
        };
        expiresAt: string;
    } | null;
};
