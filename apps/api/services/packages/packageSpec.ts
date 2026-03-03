const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

export interface ParsedPackageSpec {
  name: string;
  version?: string;
}

function splitPackageSpec(spec: string): ParsedPackageSpec | null {
  if (spec.startsWith("@")) {
    const scopeSlash = spec.indexOf("/");
    if (scopeSlash <= 1) {
      return null;
    }
  }

  const versionSeparator = spec.indexOf("@");
  const scopedVersionSeparator = spec.startsWith("@")
    ? spec.indexOf("@", spec.indexOf("/") + 1)
    : versionSeparator;
  const name =
    scopedVersionSeparator === -1 ? spec : spec.slice(0, scopedVersionSeparator);
  const version =
    scopedVersionSeparator === -1
      ? undefined
      : spec.slice(scopedVersionSeparator + 1);

  if (!PACKAGE_NAME_PATTERN.test(name)) return null;
  if (version !== undefined && version.length === 0) return null;
  return { name, version };
}

export function parsePackageSpec(input: string): ParsedPackageSpec | null {
  const spec = input.trim();
  if (!spec) return null;

  return splitPackageSpec(spec);
}

export function toPackageName(input: string): string | null {
  return parsePackageSpec(input)?.name ?? null;
}

export function formatPackageSpec(name: string, version?: string): string {
  return version ? `${name}@${version}` : name;
}

export function normalizePackageSpecs(specs: string[]): string[] {
  const byName = new Map<string, ParsedPackageSpec>();

  for (const raw of specs) {
    const parsed = parsePackageSpec(raw);
    if (!parsed) continue;

    const existing = byName.get(parsed.name);
    if (!existing) {
      byName.set(parsed.name, parsed);
      continue;
    }

    if (!existing.version && parsed.version) {
      byName.set(parsed.name, parsed);
    }
  }

  return [...byName.values()].map((item) =>
    formatPackageSpec(item.name, item.version),
  );
}

export function packageNamesFromSpecs(specs: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const spec of specs) {
    const name = toPackageName(spec);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}
