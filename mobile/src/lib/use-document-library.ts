import type { DocumentLibraryPage } from "./document-library";
import { useFocusedPage } from "./use-focused-page";

export function useDocumentLibrary(path: string) {
  return useFocusedPage<DocumentLibraryPage>(path);
}
