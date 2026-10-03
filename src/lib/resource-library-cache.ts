import "server-only";
import { revalidatePath } from "next/cache";

export function revalidateResourceLibrary(resourceId?: string): void {
  try {
    revalidatePath("/resources");
    if (resourceId) {
      revalidatePath(`/resources/${resourceId}`);
      revalidatePath(`/resources/${resourceId}/edit`);
    }
  } catch {
    // Content was already committed. Cache maintenance cannot undo that result.
    console.error("Resource cache refresh failed", "CACHE_REFRESH_FAILED");
  }
}
