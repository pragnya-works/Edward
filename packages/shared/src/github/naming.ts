export interface GithubNameValidationResult {
  valid: boolean;
  message: string | null;
}

const MAX_NAME_SUGGESTIONS = 2;
export const GITHUB_REPO_NAME_MAX_LENGTH = 100;
export const GITHUB_REPO_NAME_REGEX = /^[A-Za-z0-9._-]+$/;
export const GITHUB_OWNER_SEGMENT_REGEX = /^[^/\s]+$/;
export const GITHUB_OBJECT_ID_LIKE_REGEX = /^[0-9a-fA-F]{40}$/;

const GIT_BRANCH_FORBIDDEN_PUNCTUATION = new Set([
  "~",
  "^",
  ":",
  "?",
  "*",
  "[",
  "\\",
]);
const GIT_REFS_PREFIX = "refs/";
const GIT_BRANCH_LOCK_SUFFIX = ".lock";

function createValidResult(): GithubNameValidationResult {
  return { valid: true, message: null };
}

function createInvalidResult(message: string): GithubNameValidationResult {
  return { valid: false, message };
}

function isAsciiLetterOrNumber(character: string): boolean {
  return /[A-Za-z0-9]/.test(character);
}

function isWhitespace(character: string): boolean {
  return character.trim().length === 0;
}

function collapseRepeatedCharacter(value: string, character: string): string {
  const repeated = character + character;
  let result = value;
  while (result.includes(repeated)) {
    result = result.replace(repeated, character);
  }
  return result;
}

function toRepoSlug(rawValue: string, separator: "-" | "_"): string {
  const lowered = rawValue.trim().toLowerCase();
  let nextValue = "";

  for (const character of lowered) {
    if (isAsciiLetterOrNumber(character) || character === ".") {
      nextValue += character;
      continue;
    }

    if (character === "-" || character === "_" || isWhitespace(character)) {
      nextValue += separator;
      continue;
    }

    nextValue += separator;
  }

  nextValue = collapseRepeatedCharacter(nextValue, separator);
  nextValue = nextValue.replace(/^[-_.]+|[-_.]+$/g, "");

  if (nextValue.toLowerCase().endsWith(".git")) {
    nextValue = nextValue.slice(0, -4);
  }

  if (!nextValue) {
    return "repo";
  }

  return nextValue.slice(0, GITHUB_REPO_NAME_MAX_LENGTH);
}

function toOwnerSlug(rawValue: string): string {
  const lowered = rawValue.trim().toLowerCase();
  let nextValue = "";

  for (const character of lowered) {
    if (isAsciiLetterOrNumber(character) || character === "-" || character === "_") {
      nextValue += character;
      continue;
    }

    if (isWhitespace(character) || character === "/" || character === ".") {
      nextValue += "-";
      continue;
    }
  }

  nextValue = collapseRepeatedCharacter(nextValue, "-");
  nextValue = nextValue.replace(/^-+|-+$/g, "");
  return nextValue || "owner";
}

function sanitizeBranchComponent(component: string): string {
  let nextValue = component.replace(/^\.+/, "").replace(/\.+$/, "");
  while (nextValue.endsWith(".lock")) {
    nextValue = `${nextValue.slice(0, -5)}-lock`;
  }
  nextValue = collapseRepeatedCharacter(nextValue, "-");
  return nextValue;
}

function toBranchSlug(rawValue: string): string {
  const lowered = rawValue.trim().toLowerCase();
  let nextValue = "";

  for (const character of lowered) {
    if (
      isAsciiLetterOrNumber(character) ||
      character === "/" ||
      character === "-" ||
      character === "_" ||
      character === "."
    ) {
      nextValue += character;
      continue;
    }

    if (isWhitespace(character)) {
      nextValue += "-";
      continue;
    }

    nextValue += "-";
  }

  nextValue = collapseRepeatedCharacter(nextValue, "-");
  nextValue = nextValue.replace(/\/+/g, "/");
  while (nextValue.includes("..")) {
    nextValue = nextValue.replace("..", ".");
  }

  nextValue = nextValue.replace(/^\/+|\/+$/g, "").replace(/^-+/, "");

  const parts = nextValue
    .split("/")
    .map(sanitizeBranchComponent)
    .filter(Boolean);

  let finalValue = parts.join("/");
  if (!finalValue) {
    finalValue = "main-update";
  }

  if (finalValue === "@") {
    finalValue = "main-update";
  }

  if (finalValue.startsWith(GIT_REFS_PREFIX)) {
    finalValue = finalValue.slice(GIT_REFS_PREFIX.length);
  }

  if (GITHUB_OBJECT_ID_LIKE_REGEX.test(finalValue)) {
    finalValue = `branch-${finalValue.slice(0, 8)}`;
  }

  return finalValue || "main-update";
}

function pushValidSuggestion(
  suggestions: string[],
  candidate: string,
  input: string,
  validator: (value: string) => GithubNameValidationResult,
): void {
  const normalizedCandidate = candidate.trim();
  if (!normalizedCandidate) {
    return;
  }
  if (normalizedCandidate === input.trim()) {
    return;
  }
  if (suggestions.includes(normalizedCandidate)) {
    return;
  }
  if (!validator(normalizedCandidate).valid) {
    return;
  }
  suggestions.push(normalizedCandidate);
}

export function validateGithubRepositoryName(
  value: string,
): GithubNameValidationResult {
  const normalized = value.trim();
  if (!normalized) {
    return createInvalidResult("Repository name is required.");
  }

  if (normalized.length > GITHUB_REPO_NAME_MAX_LENGTH) {
    return createInvalidResult("Repository name must be 100 characters or fewer.");
  }

  if (normalized.toLowerCase().endsWith(".git")) {
    return createInvalidResult("Repository name must not include the .git suffix.");
  }

  if (!GITHUB_REPO_NAME_REGEX.test(normalized)) {
    return createInvalidResult(
      "Repository name may only contain letters, numbers, '.', '-', and '_'.",
    );
  }

  return createValidResult();
}

export function validateGithubRepositoryOwner(
  value: string,
): GithubNameValidationResult {
  const normalized = value.trim();
  if (!normalized) {
    return createInvalidResult("Repository owner is required.");
  }

  if (!GITHUB_OWNER_SEGMENT_REGEX.test(normalized)) {
    return createInvalidResult("Repository owner cannot contain spaces or '/'.");
  }

  return createValidResult();
}

export function validateGithubRepositoryInput(
  value: string,
): GithubNameValidationResult {
  const normalized = value.trim();
  if (!normalized) {
    return createInvalidResult("Repository is required.");
  }

  const parts = normalized.split("/");
  if (parts.length === 1) {
    return validateGithubRepositoryName(parts[0] || "");
  }

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return createInvalidResult("Repository must be either 'repo' or 'owner/repo'.");
  }

  const ownerValidation = validateGithubRepositoryOwner(parts[0]);
  if (!ownerValidation.valid) {
    return ownerValidation;
  }

  return validateGithubRepositoryName(parts[1]);
}

export function suggestGithubRepositoryInputs(value: string): string[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const suggestions: string[] = [];
  const parts = normalized.split("/");

  if (parts.length === 2 && parts[0] && parts[1]) {
    const owner = toOwnerSlug(parts[0]);
    const repoDash = toRepoSlug(parts[1], "-");
    const repoUnderscore = toRepoSlug(parts[1], "_");
    pushValidSuggestion(
      suggestions,
      `${owner}/${repoDash}`,
      normalized,
      validateGithubRepositoryInput,
    );
    pushValidSuggestion(
      suggestions,
      `${owner}/${repoUnderscore}`,
      normalized,
      validateGithubRepositoryInput,
    );
  } else {
    pushValidSuggestion(
      suggestions,
      toRepoSlug(normalized, "-"),
      normalized,
      validateGithubRepositoryInput,
    );
    pushValidSuggestion(
      suggestions,
      toRepoSlug(normalized, "_"),
      normalized,
      validateGithubRepositoryInput,
    );
  }

  return suggestions.slice(0, MAX_NAME_SUGGESTIONS);
}

function hasInvalidGitBranchComponent(component: string): boolean {
  if (!component) {
    return true;
  }
  if (component.startsWith(".")) {
    return true;
  }
  if (component.endsWith(GIT_BRANCH_LOCK_SUFFIX)) {
    return true;
  }
  return false;
}

function hasForbiddenGitRefCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 32 || codePoint === 127) {
      return true;
    }
    if (GIT_BRANCH_FORBIDDEN_PUNCTUATION.has(character)) {
      return true;
    }
  }
  return false;
}

export function validateGithubBranchName(
  value: string,
): GithubNameValidationResult {
  const normalized = value.trim();
  if (!normalized) {
    return createInvalidResult("Branch name is required.");
  }

  if (normalized.startsWith("-")) {
    return createInvalidResult("Branch name must not start with '-'.");
  }

  if (
    normalized.startsWith("/") ||
    normalized.endsWith("/") ||
    normalized.includes("//")
  ) {
    return createInvalidResult(
      "Branch name must not start/end with '/' or contain consecutive '/'.",
    );
  }

  if (normalized.endsWith(".")) {
    return createInvalidResult("Branch name must not end with '.'.");
  }

  if (normalized.includes("..")) {
    return createInvalidResult("Branch name must not contain '..'.");
  }

  if (hasForbiddenGitRefCharacters(normalized)) {
    return createInvalidResult(
      "Branch name contains forbidden characters (space, ~, ^, :, ?, *, [, or control chars).",
    );
  }

  if (normalized.includes("@{")) {
    return createInvalidResult("Branch name must not contain '@{'.");
  }

  if (normalized === "@") {
    return createInvalidResult("Branch name must not be '@'.");
  }

  if (normalized.startsWith(GIT_REFS_PREFIX)) {
    return createInvalidResult("Branch name must not start with 'refs/'.");
  }

  if (GITHUB_OBJECT_ID_LIKE_REGEX.test(normalized)) {
    return createInvalidResult(
      "Branch name must not look like a 40-character Git object ID.",
    );
  }

  const components = normalized.split("/");
  for (const component of components) {
    if (hasInvalidGitBranchComponent(component)) {
      return createInvalidResult(
        "Each branch path component must not start with '.' or end with '.lock'.",
      );
    }
  }

  return createValidResult();
}

export function suggestGithubBranchNames(value: string): string[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const suggestions: string[] = [];
  const baseBranch = toBranchSlug(normalized);
  const featureBranch = `feature/${baseBranch.replace(/^feature\//, "")}`;

  pushValidSuggestion(
    suggestions,
    baseBranch,
    normalized,
    validateGithubBranchName,
  );
  pushValidSuggestion(
    suggestions,
    featureBranch,
    normalized,
    validateGithubBranchName,
  );

  return suggestions.slice(0, MAX_NAME_SUGGESTIONS);
}
