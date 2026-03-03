import path from "path";
import { getSandboxState } from "./state.service.js";
import {
  getContainer,
  ensureContainerRunning,
  CONTAINER_WORKDIR,
  execCommand,
} from "./docker.service.js";
import { logger } from "../../utils/logger.js";
import { SANDBOX_COMMAND_TIMEOUT_MS } from "../../utils/constants.js";
import { ExecResult } from "./types.service.js";
import { SANDBOX_ALLOWED_COMMANDS } from "./command/allowedCommands.js";

const DISALLOWED_PATTERNS = [
  /rm\s+-rf\s+\//,
  />\s*\/etc\//,
  /chmod\s+/,
  /chown\s+/,
];

const MAX_ARG_COUNT = 60;
const MAX_ARG_LENGTH = 1024;
const MAX_TOTAL_ARGS_CHARS = 8 * 1024;
const NORMALIZED_WORKDIR = path.posix.normalize(CONTAINER_WORKDIR);
const LOW_NOISE_COMMANDS = new Set([
  "cat",
  "find",
  "ls",
  "head",
  "tail",
  "wc",
  "pwd",
  "date",
]);

function isWithinWorkdir(resolvedPath: string): boolean {
  return (
    resolvedPath === NORMALIZED_WORKDIR ||
    resolvedPath.startsWith(`${NORMALIZED_WORKDIR}/`)
  );
}

function hasDisallowedControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      return true;
    }
  }

  return false;
}

function looksLikePathArg(arg: string): boolean {
  if (arg === "." || arg === "..") {
    return true;
  }

  return (
    arg.startsWith("/") ||
    arg.startsWith("./") ||
    arg.startsWith("../") ||
    arg.includes("/")
  );
}

function validatePathArg(command: string, arg: string): void {
  const resolved = arg.startsWith("/")
    ? path.posix.normalize(arg)
    : path.posix.normalize(path.posix.join(NORMALIZED_WORKDIR, arg));

  if (resolved === "/") {
    throw new Error(`Refusing dangerous path: ${arg}`);
  }

  if (!isWithinWorkdir(resolved)) {
    throw new Error(`Path outside allowed directory: ${arg} -> ${resolved}`);
  }

  if (command === "rm" && resolved === NORMALIZED_WORKDIR) {
    throw new Error("Refusing to rm workdir root");
  }
}

function validateCommandArgs(command: string, args: string[]): void {
  if (args.length > MAX_ARG_COUNT) {
    throw new Error(
      `Too many arguments (${args.length}), max ${MAX_ARG_COUNT}`,
    );
  }

  if (hasDisallowedControlChars(command)) {
    throw new Error("Command contains disallowed control characters");
  }

  let totalArgChars = 0;

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
    if (arg.length > MAX_ARG_LENGTH) {
      throw new Error(`Argument exceeds max length (${MAX_ARG_LENGTH})`);
    }

    if (hasDisallowedControlChars(arg)) {
      throw new Error("Argument contains disallowed control characters");
    }

    totalArgChars += arg.length;
    if (totalArgChars > MAX_TOTAL_ARGS_CHARS) {
      throw new Error(
        `Combined argument length exceeds ${MAX_TOTAL_ARGS_CHARS} characters`,
      );
    }

    if (arg.startsWith("-")) {
      const equalIndex = arg.indexOf("=");
      if (equalIndex !== -1) {
        const value = arg.slice(equalIndex + 1);
        if (value && looksLikePathArg(value)) {
          validatePathArg(command, value);
        }
      }
      continue;
    }

    if (looksLikePathArg(arg)) {
      validatePathArg(command, arg);
    }
  }
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

  const commandLogContext = {
    sandboxId,
    command: params.command,
    args: params.args,
  };
  if (LOW_NOISE_COMMANDS.has(params.command)) {
    logger.debug(commandLogContext, "Executing sandbox command");
  } else {
    logger.info(commandLogContext, "Executing sandbox command");
  }

  try {
    return await execCommand(
      container,
      [params.command, ...params.args],
      false,
      options?.timeout ?? SANDBOX_COMMAND_TIMEOUT_MS,
      "node",
      CONTAINER_WORKDIR,
    );
  } catch (error) {
    logger.error(
      { error, sandboxId, command: params.command, args: params.args },
      "Sandbox command execution failed",
    );
    throw error;
  }
}
