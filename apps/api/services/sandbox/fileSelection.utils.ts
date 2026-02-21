export function isExcludedRelPath(
  relPath: string,
  excludedDirSet: ReadonlySet<string>,
): boolean {
  return relPath
    .split("/")
    .some((segment) => segment.length > 0 && excludedDirSet.has(segment));
}

export function hasTextExtension(
  relPath: string,
  allowedExtensions: ReadonlySet<string>,
): boolean {
  const dotIdx = relPath.lastIndexOf(".");
  if (dotIdx === -1) return false;
  return allowedExtensions.has(relPath.slice(dotIdx));
}

export function hasBinaryNullByte(content: Buffer): boolean {
  const checkLen = Math.min(content.length, 2048);
  for (let i = 0; i < checkLen; i++) {
    if (content[i] === 0) return true;
  }
  return false;
}

export function normalizeArchiveRelPath(entryName: string): string {
  return entryName.replace(/^[^/]+\//, "").replace(/^\/+/, "");
}

export async function readUtf8Stream(
  stream: NodeJS.ReadableStream,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readBufferStream(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
