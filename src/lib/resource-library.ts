import "server-only";
import { randomUUID } from "node:crypto";
import type { UserRole } from "@/generated/prisma/client";
import { ResourceError } from "@/lib/mobile-resources-core";
import { recordResourceView } from "@/lib/resource-library-mutations";
import { getResourceDetail, getWebResourceDetail, getWebResourcePage } from "@/lib/resource-library-queries";
import type { ResourceCategoryFilter, ResourceEducationLevelFilter } from "@/lib/resource-library-core";

export async function getResourceLibraryPage(input: {
  category: ResourceCategoryFilter; educationLevel: ResourceEducationLevelFilter;
  currentUserId: string; currentUserRole: UserRole; page: number; pageSize: number; query: string;
}) {
  return getWebResourcePage({ actorId: input.currentUserId }, input);
}

export async function getResourcePostForEdit(input: { postId: string; userId: string; userRole: UserRole }) {
  try {
    const resource = await getResourceDetail({ actorId: input.userId }, input.postId, { editor: true });
    return { ...resource, attachments: resource.attachments.map(file => ({
      id: file.id, originalName: file.name, mimeType: file.mimeType, size: file.size,
    })) };
  } catch (error) {
    if (error instanceof ResourceError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

export async function getResourcePostById(input: { currentUserId: string; currentUserRole: UserRole; postId: string }) {
  const context = { actorId: input.currentUserId };
  try {
    // Preserve the web's existing per-render visit policy through the locked domain.
    await recordResourceView(context, { resourceId: input.postId, requestId: randomUUID() });
    return getWebResourceDetail(context, input.postId);
  } catch (error) {
    if (error instanceof ResourceError && error.status === 404) return null;
    throw error;
  }
}

export function canManageResourcePost(userId: string, userRole: UserRole, authorId: string) {
  return userRole === "ADMIN" || userId === authorId;
}
export { paginateResourceItems } from "@/lib/resource-library-core";
export type { ResourceAttachment, ResourceCategory, ResourceCategoryFilter, ResourceEducationLevel,
  ResourceEducationLevelFilter, ResourceLibraryItem, ResourceLibraryPage, ResourcePostDetail, ResourceViewer,
} from "@/lib/resource-library-core";
