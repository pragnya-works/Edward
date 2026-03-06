import { randomUUID } from "crypto";
import path from "path";
import { Writable } from "stream";
import { Sandbox } from "@vercel/sandbox";
import { config } from "../../app.config.js";
import { createLogger } from "../../utils/logger.js";
import { SANDBOX_EXEC_MAX_CAPTURE_BYTES } from "../../utils/constants.js";
import { SANDBOX_TTL } from "./lifecycle/state.js";
import { getSandboxStateByContainerId } from "./state.service.js";
import type { SandboxInstance, ExecResult } from "./types.service.js";

const logger = createLogger("SANDBOX_RUNTIME");

export const CONTAINER_WORKDIR = "/vercel/sandbox/edward";
export const SANDBOX_LABEL = "com.edward.sandbox";
const EXEC_TIMEOUT_MS = 10_000;
const SANDBOX_METADATA_PATH = `${CONTAINER_WORKDIR}/.edward/sandbox-metadata.json`;
const RUNNING_SANDBOX_STATES = new Set(["running", "snapshotting"]);
const TERMINAL_SANDBOX_STATES = new Set(["stopped", "failed", "aborted"]);

export interface SandboxHandle {
  id: string;
}

export interface SandboxContainerInfo {
  Id: string;
  State: string;
  Labels?: Record<string, string>;
}

interface SandboxInspectInfo {
  id: string;
  state: string;
  running: boolean;
  paused: boolean;
  dead: boolean;
  labels: Record<string, string>;
}

interface RuntimeMetadataFile {
  labels?: Record<string, string>;
}

function isMissingSandboxError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  return normalizedMessage.includes("404") || normalizedMessage.includes("not found");
}

function assertRuntimeEnabled(): void {
  if (config.sandbox.runtime === "disabled") {
    throw new Error(
      "Sandbox runtime is disabled (SANDBOX_RUNTIME=disabled). Runtime operations are unavailable.",
    );
  }
}

function getVercelCredentials(): {
  token: string;
  teamId: string;
  projectId: string;
} {
  const token = config.vercel.token?.trim();
  const teamId = config.vercel.teamId?.trim();
  const projectId = config.vercel.projectId?.trim();

  if (!token || !teamId || !projectId) {
    throw new Error(
      "Vercel sandbox runtime requires VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID.",
    );
  }

  return { token, teamId, projectId };
}

function getRuntimeLabelMetadata(
  userId: string,
  chatId: string,
  sandboxId: string,
  framework?: string,
): Record<string, string> {
  return {
    [SANDBOX_LABEL]: "true",
    "com.edward.user": userId,
    "com.edward.chat": chatId,
    "com.edward.sandboxId": sandboxId,
    ...(framework ? { "com.edward.framework": framework } : {}),
  };
}

function getLabelsFromState(state: SandboxInstance): Record<string, string> {
  return getRuntimeLabelMetadata(
    state.userId,
    state.chatId,
    state.id,
    state.scaffoldedFramework,
  );
}

function normalizeRelativePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath).replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Security Error: Invalid file path '${filePath}' detected.`);
  }
  return normalized;
}

function resolveRuntimePath(filePath: string): string {
  return path.posix.isAbsolute(filePath)
    ? path.posix.normalize(filePath)
    : path.posix.join(CONTAINER_WORKDIR, normalizeRelativePath(filePath));
}

function resolveSandboxFilePath(
  filePath: string,
  workingDir = CONTAINER_WORKDIR,
): string {
  return path.posix.isAbsolute(filePath)
    ? path.posix.normalize(filePath)
    : path.posix.join(workingDir, normalizeRelativePath(filePath));
}

async function getSandbox(handleId: string): Promise<Sandbox> {
  const credentials = getVercelCredentials();
  return Sandbox.get({
    ...credentials,
    sandboxId: handleId,
  });
}

async function waitForSandboxRunning(
  sandboxId: string,
  timeoutMs = 30_000,
): Promise<Sandbox> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const sandbox = await getSandbox(sandboxId);
    if (RUNNING_SANDBOX_STATES.has(sandbox.status)) {
      return sandbox;
    }
    if (TERMINAL_SANDBOX_STATES.has(sandbox.status)) {
      throw new Error(
        `Sandbox ${sandboxId} is not running (state: ${sandbox.status})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for sandbox ${sandboxId} to become ready`);
}

async function readMetadataLabelsFromSandbox(
  sandboxId: string,
): Promise<Record<string, string>> {
  try {
    const sandbox = await getSandbox(sandboxId);
    const content = await sandbox.readFileToBuffer({
      path: SANDBOX_METADATA_PATH,
    });
    if (!content) {
      return {};
    }

    const parsed = JSON.parse(content.toString("utf8")) as RuntimeMetadataFile;
    if (!parsed.labels || typeof parsed.labels !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed.labels).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

async function getHandleLabels(handleId: string): Promise<Record<string, string>> {
  const state = await getSandboxStateByContainerId(handleId);
  if (state) {
    return getLabelsFromState(state);
  }

  return readMetadataLabelsFromSandbox(handleId);
}

async function inspectVercelHandle(handle: SandboxHandle): Promise<SandboxInspectInfo> {
  const sandbox = await getSandbox(handle.id);
  const state = sandbox.status;
  return {
    id: handle.id,
    state,
    running: RUNNING_SANDBOX_STATES.has(state),
    paused: false,
    dead: TERMINAL_SANDBOX_STATES.has(state),
    labels: await getHandleLabels(handle.id),
  };
}

async function ensureVercelHandleRunning(handle: SandboxHandle): Promise<void> {
  await waitForSandboxRunning(handle.id);
}

function createHandle(id: string): SandboxHandle {
  return { id };
}

function createWritableCollector(params: {
  streamName: "stdout" | "stderr";
  cmd: string[];
  onOverflow: (error: Error) => void;
  bytesRef: { current: number };
  chunks: string[];
}): Writable {
  const { streamName, cmd, onOverflow, bytesRef, chunks } = params;

  return new Writable({
    write(
      chunk: Buffer | string,
      _encoding: BufferEncoding,
      callback: (error?: Error | null) => void,
    ) {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (bytesRef.current + chunkBuffer.length > SANDBOX_EXEC_MAX_CAPTURE_BYTES) {
        onOverflow(
          new Error(
            `Command output exceeded safe capture limit (${SANDBOX_EXEC_MAX_CAPTURE_BYTES} bytes) while reading ${streamName}. Command: ${cmd.join(" ")}`,
          ),
        );
        callback();
        return;
      }

      chunks.push(chunkBuffer.toString());
      bytesRef.current += chunkBuffer.length;
      callback();
    },
  });
}

function envPairsToRecord(env?: string[]): Record<string, string> | undefined {
  if (!env || env.length === 0) {
    return undefined;
  }

  const entries = env
    .map((pair) => {
      const delimiter = pair.indexOf("=");
      if (delimiter <= 0) {
        return null;
      }
      return [pair.slice(0, delimiter), pair.slice(delimiter + 1)] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function closeCollector(stream: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      stream.off("finish", handleFinish);
      reject(error);
    };
    const handleFinish = () => {
      stream.off("error", handleError);
      resolve();
    };

    stream.once("error", handleError);
    stream.once("finish", handleFinish);
    stream.end();
  });
}

async function execVercelCommand(
  handle: SandboxHandle,
  cmd: string[],
  throwOnError = true,
  timeoutMs = EXEC_TIMEOUT_MS,
  user?: string,
  workingDir?: string,
  env?: string[],
): Promise<ExecResult> {
  await ensureVercelHandleRunning(handle);
  const sandbox = await getSandbox(handle.id);

  if (cmd.length === 0) {
    throw new Error("Command cannot be empty");
  }

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const stdoutBytes = { current: 0 };
  const stderrBytes = { current: 0 };
  const controller = new AbortController();
  let timeoutError: Error | null = null;
  let overflowError: Error | null = null;

  const timeout = setTimeout(() => {
    timeoutError = new Error(`Command timeout after ${timeoutMs}ms: ${cmd.join(" ")}`);
    controller.abort();
  }, timeoutMs);

  const overflow = (error: Error) => {
    if (!overflowError) {
      overflowError = error;
      controller.abort();
    }
  };

  const stdoutStream = createWritableCollector({
    streamName: "stdout",
    cmd,
    onOverflow: overflow,
    bytesRef: stdoutBytes,
    chunks: stdoutChunks,
  });
  const stderrStream = createWritableCollector({
    streamName: "stderr",
    cmd,
    onOverflow: overflow,
    bytesRef: stderrBytes,
    chunks: stderrChunks,
  });

  let commandResult: { exitCode: number } | null = null;
  let commandError: unknown = null;

  try {
    commandResult = await sandbox.runCommand({
      cmd: cmd[0]!,
      args: cmd.slice(1),
      cwd: workingDir,
      env: envPairsToRecord(env),
      sudo: user === "root",
      stdout: stdoutStream,
      stderr: stderrStream,
      signal: controller.signal,
    });
  } catch (error) {
    commandError = error;
  }

  clearTimeout(timeout);
  await Promise.all([closeCollector(stdoutStream), closeCollector(stderrStream)]);

  if (overflowError) {
    throw overflowError;
  }
  if (timeoutError) {
    throw timeoutError;
  }
  if (commandError) {
    throw commandError instanceof Error
      ? commandError
      : new Error(String(commandError));
  }

  const result = {
    exitCode: commandResult?.exitCode ?? 1,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
  };

  if (throwOnError && result.exitCode !== 0) {
    throw new Error(
      `Command failed (exit ${result.exitCode}): ${cmd.join(" ")}\nstderr: ${result.stderr}`,
    );
  }

  return result;
}

async function setupWorkspaceMetadata(
  handle: SandboxHandle,
  labels: Record<string, string>,
): Promise<void> {
  const sandbox = await getSandbox(handle.id);
  await sandbox.writeFiles([
    {
      path: SANDBOX_METADATA_PATH,
      content: Buffer.from(JSON.stringify({ labels }), "utf8"),
    },
  ]);
}

async function initializeVercelWorkspaceWithFiles(
  handle: SandboxHandle,
  files: Record<string, string>,
): Promise<void> {
  if (Object.keys(files).length === 0) {
    return;
  }

  await setupWorkspace(handle);
  const sandbox = await getSandbox(handle.id);
  await sandbox.writeFiles(
    Object.entries(files).map(([filePath, content]) => ({
      path: resolveRuntimePath(filePath),
      content: Buffer.from(content, "utf8"),
    })),
  );
}

async function readVercelArchive(
  handle: SandboxHandle,
  archivePath: string,
): Promise<NodeJS.ReadableStream> {
  const resolvedPath = resolveRuntimePath(archivePath);
  const tempArchivePath = `/tmp/${randomUUID()}.tar`;
  await execVercelCommand(handle, [
    "tar",
    "-cf",
    tempArchivePath,
    "-C",
    path.posix.dirname(resolvedPath),
    path.posix.basename(resolvedPath),
  ]);

  const sandbox = await getSandbox(handle.id);
  const stream = await sandbox.readFile({ path: tempArchivePath });
  if (!stream) {
    throw new Error(`Archive not found after creation: ${archivePath}`);
  }

  const cleanup = () => {
    void execVercelCommand(handle, ["rm", "-f", tempArchivePath], false).catch(
      () => undefined,
    );
  };
  stream.once("end", cleanup);
  stream.once("close", cleanup);
  stream.once("error", cleanup);

  return stream;
}

const ARCHIVE_UPLOAD_CHUNK_BYTES = 32 * 1024;

function toBufferChunk(chunk: Buffer | string): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

async function appendBufferToSandboxFile(
  handle: SandboxHandle,
  filePath: string,
  buffer: Buffer,
): Promise<void> {
  if (buffer.length === 0) {
    return;
  }

  const encoded = buffer.toString("base64");
  await execVercelCommand(handle, [
    "sh",
    "-lc",
    `printf '%s' '${encoded}' | base64 -d >> '${filePath}'`,
  ]);
}

async function writeStreamToSandboxFile(
  handle: SandboxHandle,
  filePath: string,
  stream: NodeJS.ReadableStream,
): Promise<void> {
  let pending = Buffer.alloc(0);

  for await (const chunk of stream) {
    pending = Buffer.concat([pending, toBufferChunk(chunk)]);

    while (pending.length >= ARCHIVE_UPLOAD_CHUNK_BYTES) {
      const nextChunk = pending.subarray(0, ARCHIVE_UPLOAD_CHUNK_BYTES);
      pending = pending.subarray(ARCHIVE_UPLOAD_CHUNK_BYTES);
      await appendBufferToSandboxFile(handle, filePath, nextChunk);
    }
  }

  if (pending.length > 0) {
    await appendBufferToSandboxFile(handle, filePath, pending);
  }
}

async function writeVercelArchive(
  handle: SandboxHandle,
  archiveStream: NodeJS.ReadableStream,
  destinationPath: string,
): Promise<void> {
  const tempArchivePath = `/tmp/${randomUUID()}.tar`;
  const resolvedDestination = resolveRuntimePath(destinationPath);
  try {
    await execVercelCommand(handle, ["rm", "-f", tempArchivePath], false);
    await writeStreamToSandboxFile(handle, tempArchivePath, archiveStream);
    await execVercelCommand(handle, ["mkdir", "-p", resolvedDestination], false);
    await execVercelCommand(handle, [
      "tar",
      "-xf",
      tempArchivePath,
      "-C",
      resolvedDestination,
    ]);
  } finally {
    await execVercelCommand(handle, ["rm", "-f", tempArchivePath], false).catch(
      () => undefined,
    );
  }
}

async function appendVercelFile(
  handle: SandboxHandle,
  filePath: string,
  content: string,
): Promise<void> {
  const resolvedPath = resolveRuntimePath(filePath);
  const sandbox = await getSandbox(handle.id);
  await execVercelCommand(
    handle,
    ["mkdir", "-p", path.posix.dirname(resolvedPath)],
    false,
  );

  const existing = await sandbox.readFileToBuffer({ path: resolvedPath });
  const updated = existing
    ? Buffer.concat([existing, Buffer.from(content, "utf8")])
    : Buffer.from(content, "utf8");

  await sandbox.writeFiles([
    {
      path: resolvedPath,
      content: updated,
    },
  ]);
}

async function pingVercelRuntime(): Promise<boolean> {
  try {
    const credentials = getVercelCredentials();
    await Sandbox.list({
      ...credentials,
      limit: 1,
    });
    return true;
  } catch (error: unknown) {
    logger.warn(
      { error: error instanceof Error ? error : new Error(String(error)) },
      "Vercel sandbox ping failed",
    );
    return false;
  }
}

export async function pingDocker(): Promise<boolean> {
  if (config.sandbox.runtime === "disabled") {
    return false;
  }
  return pingVercelRuntime();
}

export async function ensureContainerRunning(container: SandboxHandle): Promise<void> {
  await ensureVercelHandleRunning(container);
}

export async function execCommand(
  container: SandboxHandle,
  cmd: string[],
  throwOnError = true,
  timeoutMs = EXEC_TIMEOUT_MS,
  user?: string,
  workingDir?: string,
  env?: string[],
): Promise<ExecResult> {
  return execVercelCommand(
    container,
    cmd,
    throwOnError,
    timeoutMs,
    user,
    workingDir,
    env,
  );
}

export async function setupWorkspace(container: SandboxHandle): Promise<void> {
  await execCommand(container, ["mkdir", "-p", CONTAINER_WORKDIR]);
  await execCommand(container, ["chmod", "755", CONTAINER_WORKDIR], false);
}

export async function initializeWorkspaceWithFiles(
  container: SandboxHandle,
  files: Record<string, string>,
): Promise<void> {
  return initializeVercelWorkspaceWithFiles(container, files);
}

export async function readArchive(
  container: SandboxHandle,
  archivePath: string,
): Promise<NodeJS.ReadableStream> {
  return readVercelArchive(container, archivePath);
}

export async function writeArchive(
  container: SandboxHandle,
  archiveStream: NodeJS.ReadableStream,
  destinationPath: string,
): Promise<void> {
  return writeVercelArchive(container, archiveStream, destinationPath);
}

export async function appendFileContent(
  container: SandboxHandle,
  filePath: string,
  content: string,
): Promise<void> {
  return appendVercelFile(container, filePath, content);
}

export async function inspectContainer(
  containerId: string,
): Promise<SandboxInspectInfo> {
  return inspectVercelHandle({ id: containerId });
}

export async function createContainer(
  userId: string,
  chatId: string,
  sandboxId: string,
  snapshotId?: string,
  framework?: string,
): Promise<SandboxHandle> {
  assertRuntimeEnabled();
  const credentials = getVercelCredentials();
  const labels = getRuntimeLabelMetadata(userId, chatId, sandboxId, framework);
  const baseCreateParams = {
    ...credentials,
    timeout: Math.min(config.vercel.timeoutMs, SANDBOX_TTL),
    resources: { vcpus: config.vercel.vcpus },
    networkPolicy: "deny-all" as const,
    env: {
      NODE_OPTIONS: "--max-old-space-size=768",
    },
  };
  const sandbox = snapshotId
    ? await Sandbox.create({
        ...baseCreateParams,
        source: {
          type: "snapshot",
          snapshotId,
        },
      })
    : await Sandbox.create({
        ...baseCreateParams,
        runtime: config.vercel.runtime,
      });

  const handle = createHandle(sandbox.sandboxId);
  await waitForSandboxRunning(handle.id);
  await setupWorkspace(handle);
  await setupWorkspaceMetadata(handle, labels);
  return handle;
}

export async function listContainers(): Promise<SandboxContainerInfo[]> {
  assertRuntimeEnabled();
  const credentials = getVercelCredentials();
  const response = await Sandbox.list({
    ...credentials,
    limit: 100,
  });

  return Promise.all(
    response.json.sandboxes.map(async (sandbox) => ({
      Id: sandbox.id,
      State: sandbox.status,
      Labels: await getHandleLabels(sandbox.id),
    })),
  );
}

export function getContainer(id: string): SandboxHandle {
  assertRuntimeEnabled();
  return { id };
}

export async function readFileContent(
  container: SandboxHandle,
  filePath: string,
  workingDir = CONTAINER_WORKDIR,
): Promise<string | null> {
  await ensureVercelHandleRunning(container);
  const sandbox = await getSandbox(container.id);

  try {
    const content = await sandbox.readFileToBuffer({
      path: resolveSandboxFilePath(filePath, workingDir),
    });
    if (!content) {
      return null;
    }

    return content.toString("utf8");
  } catch (error) {
    if (isMissingSandboxError(error)) {
      return null;
    }
    throw error;
  }
}

export async function isContainerAlive(containerId: string): Promise<boolean> {
  try {
    const info = await inspectContainer(containerId);
    return !info.dead;
  } catch (error) {
    logger.warn({ containerId, error }, "Error checking runtime liveness");
    return false;
  }
}

export async function destroyContainer(containerId: string): Promise<void> {
  try {
    const sandbox = await getSandbox(containerId);
    await sandbox.stop({ blocking: true });
  } catch (error) {
    if (isMissingSandboxError(error)) {
      return;
    }
    throw error;
  }
}

export async function connectToNetwork(
  containerId: string,
  _networkName = "bridge",
): Promise<void> {
  const sandbox = await getSandbox(containerId);
  await sandbox.updateNetworkPolicy("allow-all");
}

export async function disconnectFromNetwork(
  containerId: string,
  _networkName = "bridge",
): Promise<void> {
  try {
    const sandbox = await getSandbox(containerId);
    await sandbox.updateNetworkPolicy("deny-all");
  } catch (error) {
    if (isMissingSandboxError(error)) {
      return;
    }
    throw error;
  }
}
