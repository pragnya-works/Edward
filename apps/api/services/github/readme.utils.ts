import type { GithubFile } from "@edward/octokit";
import {
  buildReadmeContent,
  getUtf8Content,
  normalizePath,
  parsePackageJson,
  shouldUpgradeExistingReadme,
  type PrepareGithubFilesOptions,
} from "./readme.helpers.js";
import { ROOT_README_PATH } from "./readme.constants.js";

export type ReadmeSyncAction = "kept" | "created" | "upgraded";

export interface PrepareGithubFilesResult {
  files: GithubFile[];
  readmeAction: ReadmeSyncAction;
}

export function prepareGithubFilesWithReadme(
  files: GithubFile[],
  options: PrepareGithubFilesOptions = {},
): PrepareGithubFilesResult {
  const dedupedByPath = new Map<string, GithubFile>();
  for (const file of files) {
    const normalized = normalizePath(file.path);
    dedupedByPath.set(normalized, { ...file, path: normalized });
  }

  const uniqueFiles = Array.from(dedupedByPath.values());
  const packageJson = parsePackageJson(uniqueFiles);
  const existingReadme = dedupedByPath.get(ROOT_README_PATH);
  const generatedReadme = buildReadmeContent(uniqueFiles, packageJson, options);

  if (!existingReadme) {
    dedupedByPath.set(ROOT_README_PATH, {
      path: ROOT_README_PATH,
      content: generatedReadme,
      encoding: "utf-8",
    });
    return { files: Array.from(dedupedByPath.values()), readmeAction: "created" };
  }

  const existingContent = getUtf8Content(existingReadme);
  if (!shouldUpgradeExistingReadme(existingContent)) {
    return { files: Array.from(dedupedByPath.values()), readmeAction: "kept" };
  }

  dedupedByPath.set(ROOT_README_PATH, {
    path: ROOT_README_PATH,
    content: generatedReadme,
    encoding: "utf-8",
  });

  return { files: Array.from(dedupedByPath.values()), readmeAction: "upgraded" };
}
