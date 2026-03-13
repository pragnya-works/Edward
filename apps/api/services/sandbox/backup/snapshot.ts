import tar from "tar-stream";
import { CONTAINER_WORKDIR } from "../docker.service.js";
import {
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

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on("end", () => {
        const content = Buffer.concat(chunks);
        if (hasBinaryNullByte(content)) {
          next();
          return;
        }

        const textContent = content.toString("utf8");
        if (PRIORITY_FILE_SET.has(relativePath)) {
          priorityCandidates.set(relativePath, textContent);
          next();
          return;
        }

        regularCandidates.set(relativePath, textContent);
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
  }

  const remaining = Array.from(regularCandidates.keys())
    .filter((relPath) => !PRIORITY_FILE_SET.has(relPath))
    .sort((a, b) => a.localeCompare(b));
  selected.push(...remaining);

  const files: Record<string, string> = {};
  for (const relPath of selected) {
    const content =
      priorityCandidates.get(relPath) ?? regularCandidates.get(relPath);
    if (!content) continue;

    files[relPath] = content;
  }

  return files;
}
