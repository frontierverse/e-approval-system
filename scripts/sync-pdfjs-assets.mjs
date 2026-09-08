import { cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("pdfjs-dist/package.json");
const packageRoot = path.dirname(packagePath);
const { version } = JSON.parse(await readFile(packagePath, "utf8"));

// The installed package version is also used by the browser when it constructs
// these URLs. Validate it as a single directory segment before writing assets.
if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("The installed PDF.js package has an invalid version.");
}

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(projectRoot, "public", "pdfjs", version);
const assets = [
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["wasm", "wasm"],
  ["LICENSE", "LICENSE"],
];

await mkdir(destination, { recursive: true });
for (const [source, target] of assets) {
  // Only this explicit package allowlist is public. User documents and other
  // public assets are never read, moved or removed by this script.
  await cp(path.join(packageRoot, source), path.join(destination, target), {
    recursive: true,
    force: true,
  });
}

console.log(`PDF.js ${version}: worker, CMaps, fonts, WASM and license are ready.`);
