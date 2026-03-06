import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTemplateConfig } from "./template.registry.js";

let templateRootPromise: Promise<string> | null = null;
const templateFileCache = new Map<string, Promise<Readonly<Record<string, string>>>>();

function ancestorDirs(startDir: string): string[] {
  const ancestors: string[] = [];
  let current = path.resolve(startDir);

  while (true) {
    ancestors.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      return ancestors;
    }
    current = parent;
  }
}

function candidateTemplateRoots(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateBases = new Set<string>([
    ...ancestorDirs(process.cwd()),
    ...ancestorDirs(moduleDir),
  ]);

  return Array.from(candidateBases, (baseDir) =>
    path.join(baseDir, "docker", "templates"),
  );
}

async function resolveTemplateRoot(): Promise<string> {
  if (templateRootPromise) {
    return templateRootPromise;
  }

  templateRootPromise = (async () => {
    for (const candidate of candidateTemplateRoots()) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          return candidate;
        }
      } catch {
        continue;
      }
    }

    throw new Error("Unable to locate docker/templates directory for sandbox scaffolding.");
  })();

  return templateRootPromise;
}

async function collectTemplateFiles(
  rootDir: string,
  relativeDir = "",
): Promise<Record<string, string>> {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = (await fs.readdir(absoluteDir, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: Record<string, string> = {};

  for (const entry of entries) {
    const relativePath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;
    const absolutePath = path.join(absoluteDir, entry.name);

    if (entry.isDirectory()) {
      Object.assign(files, await collectTemplateFiles(rootDir, relativePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files[relativePath] = await fs.readFile(absolutePath, "utf8");
  }

  return files;
}

export async function loadTemplateFiles(
  framework: string,
): Promise<Record<string, string>> {
  const templateConfig = getTemplateConfig(framework);
  if (!templateConfig) {
    throw new Error(`No template configuration found for framework: ${framework}`);
  }

  const normalizedFramework = templateConfig.templateDir;
  let templateFilesPromise = templateFileCache.get(normalizedFramework);

  if (!templateFilesPromise) {
    templateFilesPromise = (async () => {
      const templateRoot = await resolveTemplateRoot();
      const frameworkTemplateDir = path.join(templateRoot, normalizedFramework);
      const files = await collectTemplateFiles(frameworkTemplateDir);
      return Object.freeze({ ...files });
    })();
    templateFileCache.set(normalizedFramework, templateFilesPromise);
  }

  const files = await templateFilesPromise;
  return { ...files };
}
