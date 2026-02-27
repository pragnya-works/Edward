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
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx)$/i;
const ZUSTAND_DEFAULT_IMPORT_PATTERN =
  /^(\s*import\s+)([A-Za-z_$][\w$]*)(\s*,\s*\{[^}]*\})?(\s+from\s+)(["'])zustand\5\s*;?/gm;

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

function normalizeNamedImports(rawNamedImport: string): string[] {
  const start = rawNamedImport.indexOf("{");
  const end = rawNamedImport.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  return rawNamedImport
    .slice(start + 1, end)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildCreateSpecifier(defaultIdentifier: string): string {
  return defaultIdentifier === "create"
    ? "create"
    : `create as ${defaultIdentifier}`;
}

function normalizeImportSpecifier(specifier: string): string {
  return specifier
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function rewriteZustandDefaultImports(content: string): { content: string; changed: boolean } {
  let changed = false;

  const rewritten = content.replace(
    ZUSTAND_DEFAULT_IMPORT_PATTERN,
    (_full, importPrefix, defaultIdentifier, namedImportPart, fromPart, quote) => {
      const createSpecifier = buildCreateSpecifier(defaultIdentifier);

      if (!namedImportPart) {
        changed = true;
        return `${importPrefix}{ ${createSpecifier} }${fromPart}${quote}zustand${quote};`;
      }

      const namedImports = normalizeNamedImports(namedImportPart);
      const hasCompatibleCreateImport = namedImports.some((spec) => {
        const normalized = normalizeImportSpecifier(spec);
        if (normalized === "create") {
          return defaultIdentifier === "create";
        }
        return normalized === `create as ${defaultIdentifier}`;
      });
      const mergedImports = hasCompatibleCreateImport
        ? namedImports
        : [createSpecifier, ...namedImports];
      changed = true;
      return `${importPrefix}{ ${mergedImports.join(", ")} }${fromPart}${quote}zustand${quote};`;
    },
  );

  return { content: rewritten, changed };
}

function applyZustandImportAutofix(generatedFiles: Map<string, string>): string[] {
  const applied: string[] = [];

  for (const [path, content] of generatedFiles) {
    if (!SOURCE_FILE_PATTERN.test(path)) {
      continue;
    }

    if (!content.includes("zustand")) {
      continue;
    }

    const rewritten = rewriteZustandDefaultImports(content);
    if (!rewritten.changed) {
      continue;
    }

    generatedFiles.set(path, rewritten.content);
    applied.push(`${path}:zustand-default-import`);
  }

  return applied;
}

export async function applyDeterministicPostgenAutofixes(
  params: ApplyDeterministicPostgenAutofixesParams,
): Promise<string[]> {
  const { mode, framework, generatedFiles } = params;
  const appliedFixes = applyZustandImportAutofix(generatedFiles);

  if (mode === ChatAction.GENERATE && (framework === "vite-react" || framework === "vanilla")) {
    const indexHtml = generatedFiles.get("index.html");
    if (indexHtml) {
      const canonicalAutofix = enforceAbsoluteCanonicalHref(indexHtml);
      if (canonicalAutofix.changed) {
        generatedFiles.set("index.html", canonicalAutofix.html);
        appliedFixes.push("index.html:canonical-href");
      }
    }
  }

  return appliedFixes;
}
