import tar from "tar-stream";
import { CONTAINER_WORKDIR } from "../docker.sandbox.js";
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_NON_PRIORITY_BYTES,
  MAX_NON_PRIORITY_FILES,
  MAX_TOTAL_BYTES,
  PRIORITY_FILES,
  PRIORITY_FILE_SET,
  SANDBOX_EXCLUDED_DIRS,
  SNAPSHOT_EXTRA_EXCLUDED_DIRS,
  TEXT_EXTENSIONS,
} from "../fileSelection.constants.js";
import {
  hasBinaryNullByte,
  hasTextExtension,
  isExcludedRelPath,
} from "../fileSelection.utils.js";

interface DockerContainer {
  getArchive(options: { path: string }): Promise<NodeJS.ReadableStream>;
}

const EXCLUDED_DIR_SET = new Set([
  ...SANDBOX_EXCLUDED_DIRS,
  ...SNAPSHOT_EXTRA_EXCLUDED_DIRS,
]);

export async function createSourceSnapshot(
  container: DockerContainer,
): Promise<Record<string, string>> {
  const tarStream = await container.getArchive({ path: CONTAINER_WORKDIR });
  const extract = tar.extract();
  const priorityCandidates = new Map<string, string>();
  const regularCandidates = new Map<string, string>();
  let regularCandidateBytes = 0;

  await new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      const relativePath = header.name.replace(/^[^/]+\/?/, "");
      if (!relativePath || header.type !== "file") {
        stream.resume();
        next();
        return;
      }

      if (
        isExcludedRelPath(relativePath, EXCLUDED_DIR_SET) ||
        !hasTextExtension(relativePath, TEXT_EXTENSIONS)
      ) {
        stream.resume();
        next();
        return;
      }

      if ((header.size ?? 0) > MAX_FILE_BYTES) {
        stream.resume();
        next();
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on("end", () => {
        const content = Buffer.concat(chunks);
        if (content.length > MAX_FILE_BYTES || hasBinaryNullByte(content)) {
          next();
          return;
        }

        const textContent = content.toString("utf8");
        if (PRIORITY_FILE_SET.has(relativePath)) {
          priorityCandidates.set(relativePath, textContent);
          next();
          return;
        }

        if (regularCandidates.size >= MAX_NON_PRIORITY_FILES) {
          next();
          return;
        }

        const contentBytes = Buffer.byteLength(textContent, "utf8");
        if (regularCandidateBytes + contentBytes > MAX_NON_PRIORITY_BYTES) {
          next();
          return;
        }

        regularCandidates.set(relativePath, textContent);
        regularCandidateBytes += contentBytes;
        next();
      });
      stream.on("error", reject);
    });

    extract.on("finish", resolve);
    extract.on("error", reject);
    tarStream.on("error", reject);
    tarStream.pipe(extract);
  });

  const selected: string[] = [];
  for (const relPath of PRIORITY_FILES) {
    if (priorityCandidates.has(relPath)) {
      selected.push(relPath);
    }
    if (selected.length >= MAX_FILES) break;
  }

  if (selected.length < MAX_FILES) {
    const remaining = Array.from(regularCandidates.keys())
      .filter((relPath) => !PRIORITY_FILE_SET.has(relPath))
      .sort((a, b) => a.localeCompare(b));
    selected.push(...remaining.slice(0, MAX_FILES - selected.length));
  }

  let totalBytes = 0;
  const files: Record<string, string> = {};
  for (const relPath of selected) {
    const content =
      priorityCandidates.get(relPath) ?? regularCandidates.get(relPath);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, "utf8");
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    files[relPath] = content;
    totalBytes += contentBytes;

    if (totalBytes >= MAX_TOTAL_BYTES) break;
  }

  return files;
}
