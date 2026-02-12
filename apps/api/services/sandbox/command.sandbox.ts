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
import { SANDBOX_ALLOWED_COMMANDS } from "../../utils/sandboxCommands.js";

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

  if (command === "find") {
    for (const arg of args) {
      if (
        arg === "-exec" ||
        arg === "-execdir" ||
        arg === "-ok" ||
        arg === "-okdir"
      ) {
        throw new Error(`Disallowed find flag: ${arg}`);
      }
    }
  }

  for (const arg of args) {
    if (arg.startsWith("-")) {
      const equalIndex = arg.indexOf("=");
      if (equalIndex !== -1) {
        const value = arg.slice(equalIndex + 1);
        if (value) {
          const resolved = value.startsWith("/")
            ? path.posix.normalize(value)
            : path.posix.normalize(path.posix.join(CONTAINER_WORKDIR, value));

          if (resolved === "/") {
            throw new Error(`Refusing dangerous path in flag: ${arg}`);
          }

          if (!resolved.startsWith(CONTAINER_WORKDIR)) {
            throw new Error(
              `Path outside allowed directory in flag: ${arg} -> ${resolved}`,
            );
          }

          if (command === "rm" && resolved === CONTAINER_WORKDIR) {
            throw new Error("Refusing to rm workdir root");
          }
        }
      }
      continue;
    }

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

  if (!SANDBOX_ALLOWED_COMMANDS.includes(params.command as (typeof SANDBOX_ALLOWED_COMMANDS)[number])) {
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
