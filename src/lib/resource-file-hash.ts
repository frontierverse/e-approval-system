import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const chunkBytes = 1024 * 1024;
export const resourceFileTechnicalMaxBytes = 300 * 1024 * 1024;

export async function hashResourceFile(
  file: Blob,
  options: { signal?: AbortSignal; onProgress?: (bytes: number) => void } = {},
): Promise<string> {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > resourceFileTechnicalMaxBytes)
    throw new RangeError("Invalid resource file size");
  const check = () => {
    if (options.signal?.aborted) throw new DOMException("File processing cancelled", "AbortError");
  };
  const hash = sha256.create();
  try {
    check();
    for (let offset = 0; offset < file.size; offset += chunkBytes) {
      check();
      const expected = Math.min(chunkBytes, file.size - offset);
      const bytes = new Uint8Array(await file.slice(offset, offset + expected).arrayBuffer());
      check();
      if (bytes.byteLength !== expected) throw new Error("Resource file snapshot changed");
      hash.update(bytes);
      options.onProgress?.(offset + bytes.byteLength);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    check();
    return bytesToHex(hash.digest());
  } finally {
    hash.destroy();
  }
}
