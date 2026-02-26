import { ChatAction, type ChatAction as ChatActionType } from "../../../../services/planning/schemas.js";

interface ApplyDeterministicPostgenAutofixesParams {
  framework: string | undefined;
  mode: ChatActionType;
  generatedFiles: Map<string, string>;
  sandboxId?: string;
  chatId: string;
  runId: string;
}

const DEFAULT_CANONICAL_ORIGIN = "https://edwardd.app";
const CANONICAL_LINK_TAG_REGEX = /<link\b[^>]*rel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/gi;
const HREF_ATTR_REGEX = /\bhref=["']([^"']*)["']/i;

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function buildAbsoluteCanonicalHref(value: string): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "." || trimmed === "./" || trimmed === "#") {
    return `${DEFAULT_CANONICAL_ORIGIN}/`;
  }

  if (/^\/\//.test(trimmed)) {
    return `https:${trimmed}`;
  }

  if (/^[?#]/.test(trimmed)) {
    return `${DEFAULT_CANONICAL_ORIGIN}/${trimmed}`;
  }

  let pathPart = trimmed
    .replace(/^(\.\/|\.\.\/)+/, "")
    .replace(/^\/+/, "/");

  if (!pathPart.startsWith("/")) {
    pathPart = `/${pathPart}`;
  }

  return `${DEFAULT_CANONICAL_ORIGIN}${pathPart}`;
}

function enforceAbsoluteCanonicalHref(html: string): { html: string; changed: boolean } {
  let changed = false;

  const updatedHtml = html.replace(CANONICAL_LINK_TAG_REGEX, (tag) => {
    const hrefMatch = tag.match(HREF_ATTR_REGEX);
    if (!hrefMatch || !hrefMatch[1]) {
      return tag;
    }

    const hrefValue = hrefMatch[1];
    if (isAbsoluteHttpUrl(hrefValue)) {
      return tag;
    }

    const absoluteHref = buildAbsoluteCanonicalHref(hrefValue);
    changed = true;
    return tag.replace(HREF_ATTR_REGEX, `href="${absoluteHref}"`);
  });

  return { html: updatedHtml, changed };
}

export async function applyDeterministicPostgenAutofixes(
  params: ApplyDeterministicPostgenAutofixesParams,
): Promise<string[]> {
  const { mode, framework, generatedFiles } = params;

  if (mode !== ChatAction.GENERATE) {
    return [];
  }

  if (framework !== "vite-react" && framework !== "vanilla") {
    return [];
  }

  const indexHtml = generatedFiles.get("index.html");
  if (!indexHtml) {
    return [];
  }

  const canonicalAutofix = enforceAbsoluteCanonicalHref(indexHtml);
  if (canonicalAutofix.changed) {
    generatedFiles.set("index.html", canonicalAutofix.html);
    return ["index.html:canonical-href"];
  }

  return [];
}
