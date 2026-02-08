import path from "path";
import { getSandboxState } from "./state.sandbox.js";
import {
  getContainer,
  ensureContainerRunning,
  CONTAINER_WORKDIR,
  execCommand,
} from "./docker.sandbox.js";
import { logger } from "../../utils/logger.js";
import { ExecResult } from "./types.sandbox.js";

const ALLOWED_COMMANDS = [
  "ls",
  "find",
  "grep",
  "mv",
  "cp",
  "mkdir",
  "rm",
  "cat",
  "pnpm",
  "npm",
  "git",
  "pwd",
  "date",
  "echo",
  "touch",
  "head",
  "tail",
  "wc",
  "sed",
  "awk",
  "tsc",
  "node",
];

const DISALLOWED_PATTERNS = [
  /rm\s+-rf\s+\//,
  />\s*\/etc\//,
  /chmod\s+/,
  /chown\s+/,
];

const MAX_ARG_COUNT = 20;
const MAX_OUTPUT_CAT = 512 * 1024;
const MAX_OUTPUT_DEFAULT = 1024 * 1024;

function validateCommandArgs(command: string, args: string[]): void {
  if (args.length > MAX_ARG_COUNT) {
    throw new Error(
      `Too many arguments (${args.length}), max ${MAX_ARG_COUNT}`,
    );
  }

  for (const arg of args) {
    if (arg.startsWith("-")) continue;

    const resolved = arg.startsWith("/")
      ? path.posix.normalize(arg)
      : path.posix.normalize(path.posix.join(CONTAINER_WORKDIR, arg));

    if (resolved === "/") {
      throw new Error(`Refusing dangerous path: ${arg}`);
    }

    if (!resolved.startsWith(CONTAINER_WORKDIR)) {
      throw new Error(`Path outside allowed directory: ${arg} -> ${resolved}`);
    }

    if (command === "rm" && resolved === CONTAINER_WORKDIR) {
      throw new Error("Refusing to rm workdir root");
    }
  }
}

function truncateOutput(output: string | undefined, maxBytes: number): string {
  if (!output) return "";
  if (Buffer.byteLength(output, "utf8") <= maxBytes) return output;
  return output.slice(0, maxBytes) + "\n...[truncated]";
}

export async function executeSandboxCommand(
  sandboxId: string,
  params: { command: string; args: string[] },
  options?: { timeout?: number },
): Promise<ExecResult> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  if (!ALLOWED_COMMANDS.includes(params.command)) {
    throw new Error(`Command '${params.command}' is not allowed.`);
  }

  const fullCommand = `${params.command} ${params.args.join(" ")}`;
  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(fullCommand)) {
      throw new Error(`Command contains disallowed patterns: ${fullCommand}`);
    }
  }

  validateCommandArgs(params.command, params.args);

  const container = getContainer(sandbox.containerId);
  await ensureContainerRunning(container);

  logger.info(
    { sandboxId, command: params.command, args: params.args },
    "Executing sandbox command",
  );

  try {
    const result = await execCommand(
      container,
      [params.command, ...params.args],
      false,
      options?.timeout ?? 15000,
      "node",
      CONTAINER_WORKDIR,
    );

    const maxOut =
      params.command === "cat" ? MAX_OUTPUT_CAT : MAX_OUTPUT_DEFAULT;
    result.stdout = truncateOutput(result.stdout, maxOut);
    result.stderr = truncateOutput(result.stderr, maxOut);

    return result;
  } catch (error) {
    logger.error(
      { error, sandboxId, command: params.command, args: params.args },
      "Sandbox command execution failed",
    );
    throw error;
  }
}
