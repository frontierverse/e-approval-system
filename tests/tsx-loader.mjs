import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return resolveFile(path.join(projectRoot, "src", specifier.slice(2)));
    }

    const packageSubpath = resolvePackageSubpath(specifier);

    if (packageSubpath) {
      return packageSubpath;
    }

    if (specifier.startsWith(".")) {
      const parentPath = context.parentURL?.startsWith("file:")
        ? fileURLToPath(context.parentURL)
        : path.join(projectRoot, "index.mjs");

      return resolveFile(path.resolve(path.dirname(parentPath), specifier));
    }

    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (!url.startsWith("file:")) {
      return nextLoad(url, context);
    }

    const filename = fileURLToPath(url);

    if (!/\.[cm]?tsx?$/.test(filename)) {
      return nextLoad(url, context);
    }

    const source = readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        allowImportingTsExtensions: true,
        esModuleInterop: true,
        isolatedModules: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    });

    return {
      format: "module",
      shortCircuit: true,
      source: output.outputText,
    };
  },
});

function resolveFile(filePath) {
  const resolved = getExistingFile(filePath);

  if (!resolved) {
    return undefined;
  }

  return {
    shortCircuit: true,
    url: pathToFileURL(resolved).href,
  };
}

function getExistingFile(filePath) {
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }

  for (const extension of sourceExtensions) {
    const candidate = `${filePath}${extension}`;

    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  for (const extension of sourceExtensions) {
    const candidate = path.join(filePath, `index${extension}`);

    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function resolvePackageSubpath(specifier) {
  const parts = specifier.split("/");

  if (parts.length < 2 || specifier.startsWith("@")) {
    return null;
  }

  const resolved = getExistingFile(
    path.join(projectRoot, "node_modules", ...parts),
  );

  if (!resolved) {
    return null;
  }

  return {
    shortCircuit: true,
    url: pathToFileURL(resolved).href,
  };
}
