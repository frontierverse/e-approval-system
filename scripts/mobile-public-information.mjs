import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
export const mobilePublicInformationPath = new URL("mobile/src/lib/public-app-information-content.ts", root);

// Render the existing public pages with a small JSX adapter. This only reads
// checked-in source; no network, employee data or server module is evaluated.
export function buildMobilePublicInformation() {
  const cache = new Map();
  const jsx = (type, props = {}) => typeof type === "function" ? type(props) : { type, props };
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const source = readFileSync(new URL(file, root), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const evaluated = { exports: {} };
    const require = name => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { __esModule: true, default: props => jsx("a", props) };
      if (name === "@/lib/branding") return load("src/lib/branding.ts");
      if (name === "@/lib/mobile-app-info") return load("src/lib/mobile-app-info.ts");
      throw Error("Unexpected public page dependency: " + name);
    };
    new Function("require", "module", "exports", output)(require, evaluated, evaluated.exports);
    cache.set(file, evaluated.exports);
    return evaluated.exports;
  };
  const children = node => Array.isArray(node) ? node.flatMap(children) : node?.props ? [node, ...children(node.props.children)] : [];
  const text = node => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
  const blocks = (node, skipSections = false) => {
    if (Array.isArray(node)) return node.flatMap(child => blocks(child, skipSections));
    if (!node?.props || ["h1", "h2", "button", "nav"].includes(node.type) || (skipSections && node.type === "section")) return [];
    if (node.type === "a") return [{ kind: node.props.href?.startsWith("mailto:") ? "paragraph" : "link", text: text(node), ...(node.props.href?.startsWith("mailto:") ? {} : { href: node.props.href }) }];
    if (["p", "dt", "dd", "li"].includes(node.type)) {
      const links = children(node.props.children).filter(child => child.type === "a");
      const publicLinks = links.filter(link => link.props.href?.startsWith("https://"));
      const onlyLinks = publicLinks.length && text(node).trim() === publicLinks.map(text).join("").trim();
      // Preserve complete sentences, but do not repeat standalone link labels.
      return [...(onlyLinks ? [] : [{ kind: node.type === "dt" ? "label" : "paragraph", text: text(node) }]),
        ...publicLinks.map(link => ({ kind: "link", text: text(link), href: link.props.href }))];
    }
    return blocks(node.props.children, skipSections);
  };
  return Object.fromEntries(["privacy", "support"].map(page => {
    const tree = load("src/app/mobile-app/" + page + "/page.tsx").default();
    const all = children(tree);
    return [page, {
      title: text(all.find(node => node.type === "h1")),
      url: load("src/lib/mobile-app-info.ts").mobileAppInfo[page === "privacy" ? "privacyUrl" : "supportUrl"],
      intro: blocks(tree, true),
      sections: all.filter(node => node.type === "section").map(section => ({
        title: text(children(section).find(node => node.type === "h2")),
        blocks: blocks(section.props.children),
      })),
    }];
  }));
}

export function mobilePublicInformationSource() {
  return "// Generated from the public web pages. Run node scripts/mobile-public-information.mjs after editing them.\n" +
    "export const publicAppInformation = " + JSON.stringify(buildMobilePublicInformation(), null, 2) + " as const;\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(mobilePublicInformationPath, mobilePublicInformationSource());
}
