const NUMERIC_PROJECT_ID_REGEX = /^\d+$/;

function extractProjectId(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

export function isValidSentryDsn(rawDsn: string): boolean {
  try {
    const parsed = new URL(rawDsn);
    if (!parsed.username) {
      return false;
    }

    const projectId = extractProjectId(parsed.pathname);
    return NUMERIC_PROJECT_ID_REGEX.test(projectId);
  } catch {
    return false;
  }
}

export function getValidatedSentryDsn(
  rawDsn: string | undefined,
  _runtime: "client" | "server",
): string | undefined {
  if (!rawDsn) {
    return undefined;
  }

  if (isValidSentryDsn(rawDsn)) {
    return rawDsn;
  }

  return undefined;
}
