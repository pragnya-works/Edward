import Docker from "dockerode";
import tar from "tar-stream";
import { Readable, Writable } from "stream";
import path from "path";
import { randomUUID } from "crypto";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { config } from "../../app.config.js";
import { createLogger } from "../../utils/logger.js";
import { SANDBOX_EXEC_MAX_CAPTURE_BYTES } from "../../utils/constants.js";
import { getSandboxStateByContainerId } from "./state.service.js";
import { ExecResult } from "./types.service.js";

const logger = createLogger("SANDBOX_RUNTIME");
const docker = new Docker();

export const CONTAINER_WORKDIR = "/home/node/edward";
export const SANDBOX_LABEL = "com.edward.sandbox";
const EXEC_TIMEOUT_MS = 10_000;
const FLY_AGENT_PORT = 4281;
const FLY_AGENT_PATH = `${CONTAINER_WORKDIR}/.edward/fly-agent/server.mjs`;

export interface SandboxHandle {
  id: string;
  runtimeToken?: string;
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

interface FlyMachine {
  id: string;
  state?: string;
  instance_id?: string;
  config?: {
    metadata?: Record<string, string>;
  };
}

function assertRuntimeEnabled(): void {
  if (config.sandbox.runtime === "disabled") {
    throw new Error(
      "Sandbox runtime is disabled (SANDBOX_RUNTIME=disabled). Runtime operations are unavailable.",
    );
  }
}

function usingFlyRuntime(): boolean {
  return config.sandbox.runtime === "fly";
}

function getPrewarmImage(): string {
  return config.docker.prewarmImage;
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

async function inspectDockerHandle(handle: SandboxHandle): Promise<SandboxInspectInfo> {
  const container = docker.getContainer(handle.id);
  const info = await container.inspect();
  return {
    id: handle.id,
    state: info.State.Status ?? "unknown",
    running: Boolean(info.State.Running),
    paused: Boolean(info.State.Paused),
    dead: Boolean(info.State.Dead),
    labels: info.Config?.Labels ?? {},
  };
}

async function ensureDockerHandleRunning(handle: SandboxHandle): Promise<void> {
  const container = docker.getContainer(handle.id);
  const info = await container.inspect();
  if (info.State.Paused) {
    await container.unpause();
  } else if (!info.State.Running) {
    await container.start();
  }
}

function createDockerHandle(id: string): SandboxHandle {
  return { id };
}

function createWritableCollector(params: {
  streamName: "stdout" | "stderr";
  cmd: string[];
  rejectOnce: (error: Error) => void;
  timeout: NodeJS.Timeout;
  bytesRef: { current: number };
  chunks: string[];
}): Writable {
  const { streamName, cmd, rejectOnce, timeout, bytesRef, chunks } = params;

  return new Writable({
    write(
      chunk: Buffer | string,
      _encoding: BufferEncoding,
      callback: (error?: Error | null) => void,
    ) {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (bytesRef.current + chunkBuffer.length > SANDBOX_EXEC_MAX_CAPTURE_BYTES) {
        const error = new Error(
          `Command output exceeded safe capture limit (${SANDBOX_EXEC_MAX_CAPTURE_BYTES} bytes) while reading ${streamName}. ` +
            `Command: ${cmd.join(" ")}`,
        );
        clearTimeout(timeout);
        rejectOnce(error);
        callback();
        return;
      }

      chunks.push(chunkBuffer.toString());
      bytesRef.current += chunkBuffer.length;
      callback();
    },
  });
}

async function execDockerCommand(
  handle: SandboxHandle,
  cmd: string[],
  throwOnError = true,
  timeoutMs = EXEC_TIMEOUT_MS,
  user?: string,
  workingDir?: string,
  env?: string[],
): Promise<ExecResult> {
  await ensureDockerHandleRunning(handle);
  const container = docker.getContainer(handle.id);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    User: user,
    WorkingDir: workingDir,
    Env: env,
  });

  const stream = await exec.start({ hijack: true });
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const stdoutBytes = { current: 0 };
  const stderrBytes = { current: 0 };

  const result = await new Promise<ExecResult>((resolve, reject) => {
    let settled = false;

    const resolveOnce = (value: ExecResult) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timeout = setTimeout(() => {
      stream.destroy();
      rejectOnce(
        new Error(`Command timeout after ${timeoutMs}ms: ${cmd.join(" ")}`),
      );
    }, timeoutMs);

    const stdoutStream = createWritableCollector({
      streamName: "stdout",
      cmd,
      rejectOnce,
      timeout,
      bytesRef: stdoutBytes,
      chunks: stdoutChunks,
    });
    const stderrStream = createWritableCollector({
      streamName: "stderr",
      cmd,
      rejectOnce,
      timeout,
      bytesRef: stderrBytes,
      chunks: stderrChunks,
    });

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    stream.on("end", async () => {
      if (settled) return;
      clearTimeout(timeout);
      stdoutStream.end();
      stderrStream.end();
      try {
        const execInfo = await exec.inspect();
        resolveOnce({
          exitCode: execInfo.ExitCode ?? -1,
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
        });
      } catch (error) {
        rejectOnce(error instanceof Error ? error : new Error(String(error)));
      }
    });

    stream.on("error", (error) => {
      clearTimeout(timeout);
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    });
  });

  if (throwOnError && result.exitCode !== 0) {
    throw new Error(
      `Command failed (exit ${result.exitCode}): ${cmd.join(" ")}\nstderr: ${result.stderr}`,
    );
  }

  return result;
}

function packFiles(files: Record<string, string>): NodeJS.ReadableStream {
  const pack = tar.pack();

  for (const [filePath, content] of Object.entries(files)) {
    const normalizedPath = path.posix.normalize(filePath);
    if (normalizedPath.startsWith("..") || path.posix.isAbsolute(normalizedPath)) {
      throw new Error(`Security Error: Invalid file path '${filePath}' detected.`);
    }
    pack.entry({ name: normalizedPath }, content);
  }

  pack.finalize();
  return pack;
}

async function initializeDockerWorkspaceWithFiles(
  handle: SandboxHandle,
  files: Record<string, string>,
): Promise<void> {
  if (Object.keys(files).length === 0) return;

  await setupWorkspace(handle);
  const container = docker.getContainer(handle.id);
  const tarStream = packFiles(files);
  await container.putArchive(tarStream, { path: CONTAINER_WORKDIR });
}

async function readDockerArchive(
  handle: SandboxHandle,
  archivePath: string,
): Promise<NodeJS.ReadableStream> {
  const container = docker.getContainer(handle.id);
  return container.getArchive({ path: archivePath });
}

async function writeDockerArchive(
  handle: SandboxHandle,
  archiveStream: NodeJS.ReadableStream,
  destinationPath: string,
): Promise<void> {
  const container = docker.getContainer(handle.id);
  await container.putArchive(archiveStream, { path: destinationPath });
}

async function appendDockerFile(
  handle: SandboxHandle,
  filePath: string,
  content: string,
): Promise<void> {
  const container = docker.getContainer(handle.id);
  await ensureDockerHandleRunning(handle);
  const exec = await container.exec({
    Cmd: ["sh", "-c", `cat >> '${filePath.replace(/'/g, "'\"'\"'")}'`],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true });
  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    stream.write(content);
    stream.end();
  });
  const execInfo = await exec.inspect();
  if ((execInfo.ExitCode ?? 0) !== 0) {
    throw new Error(`Append failed for ${filePath} (exit ${execInfo.ExitCode ?? -1})`);
  }
}

async function pingDockerRuntime(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch (error: unknown) {
    logger.warn(
      { error: error instanceof Error ? error : new Error(String(error)) },
      "Docker ping failed",
    );
    return false;
  }
}

function getFlyConfig() {
  const apiToken = config.fly.apiToken?.trim();
  const appName = config.fly.appName?.trim();
  const publicHost = config.fly.publicHost?.trim();

  if (!apiToken || !appName || !publicHost) {
    throw new Error(
      "Fly runtime requires FLY_API_TOKEN, FLY_APP_NAME, and FLY_PUBLIC_HOSTNAME (or inferable FLY_APP_NAME).",
    );
  }

  return { apiToken, appName, publicHost };
}

async function flyApiRequest<T>(params: {
  path: string;
  method?: string;
  body?: unknown;
  parseAs?: "json" | "text" | "none";
}): Promise<T> {
  const { apiToken } = getFlyConfig();
  const response = await fetch(`https://api.machines.dev${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...(params.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Fly Machines API ${params.method ?? "GET"} ${params.path} failed (${response.status} ${response.statusText}): ${details.slice(0, 400)}`,
    );
  }

  if (params.parseAs === "none") {
    return undefined as T;
  }
  if (params.parseAs === "text") {
    return (await response.text()) as T;
  }
  return (await response.json()) as T;
}

function getFlyMachineLabels(machine: FlyMachine): Record<string, string> {
  return machine.config?.metadata ?? {};
}

async function getFlyMachine(machineId: string): Promise<FlyMachine> {
  const { appName } = getFlyConfig();
  return await flyApiRequest<FlyMachine>({
    path: `/v1/apps/${appName}/machines/${machineId}`,
  });
}

async function waitForFlyMachine(machineId: string, timeoutMs = 60_000): Promise<FlyMachine> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const machine = await getFlyMachine(machineId);
    const state = machine.state?.toLowerCase();
    if (state === "started" || state === "running") {
      return machine;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for Fly machine ${machineId} to start`);
}

async function resolveFlyRuntimeToken(machineId: string, handle?: SandboxHandle): Promise<string> {
  if (handle?.runtimeToken) {
    return handle.runtimeToken;
  }

  const sandbox = await getSandboxStateByContainerId(machineId);
  if (!sandbox?.runtimeToken) {
    throw new Error(`Missing Fly runtime token for sandbox machine ${machineId}`);
  }

  return sandbox.runtimeToken;
}

async function flyAgentRequest(params: {
  handle: SandboxHandle;
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  duplex?: "half";
}): Promise<Response> {
  const { publicHost } = getFlyConfig();
  const machine = await getFlyMachine(params.handle.id);
  const token = await resolveFlyRuntimeToken(params.handle.id, params.handle);
  const requestInit: RequestInit & { duplex?: "half" } = {
    method: params.method ?? "GET",
    duplex: params.duplex,
    headers: {
      Authorization: `Bearer ${token}`,
      "Fly-Force-Instance-Id": machine.instance_id ?? machine.id,
      ...params.headers,
    },
    body: params.body,
  };

  const response = await fetch(
    `https://${publicHost}${params.path}`,
    requestInit as RequestInit,
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Fly sandbox agent ${params.method ?? "GET"} ${params.path} failed (${response.status} ${response.statusText}): ${details.slice(0, 400)}`,
    );
  }

  return response;
}

async function pingFlyRuntime(): Promise<boolean> {
  try {
    const { appName } = getFlyConfig();
    await flyApiRequest({
      path: `/v1/apps/${appName}`,
      parseAs: "json",
    });
    return true;
  } catch (error) {
    logger.warn({ error }, "Fly runtime ping failed");
    return false;
  }
}

function createFlyHandle(id: string, runtimeToken: string): SandboxHandle {
  return { id, runtimeToken };
}

async function createFlyMachine(
  userId: string,
  chatId: string,
  sandboxId: string,
  image: string,
): Promise<SandboxHandle> {
  const { appName } = getFlyConfig();
  const runtimeToken = randomUUID();
  const labels = {
    ...getRuntimeLabelMetadata(userId, chatId, sandboxId),
    "com.edward.runtimeToken": runtimeToken,
  };

  const machine = await flyApiRequest<FlyMachine>({
    path: `/v1/apps/${appName}/machines`,
    method: "POST",
    body: {
      config: {
        image,
        auto_destroy: true,
        restart: { policy: "no" },
        init: {
          exec: ["node", FLY_AGENT_PATH],
        },
        env: {
          EDWARD_AGENT_PORT: String(FLY_AGENT_PORT),
          EDWARD_AGENT_TOKEN: runtimeToken,
          EDWARD_WORKDIR: CONTAINER_WORKDIR,
          EDWARD_EXEC_MAX_CAPTURE_BYTES: String(SANDBOX_EXEC_MAX_CAPTURE_BYTES),
        },
        metadata: labels,
        files: [
          {
            guest_path: FLY_AGENT_PATH,
            raw_value: FLY_SANDBOX_AGENT_SOURCE,
            mode: 0o644,
          },
        ],
        services: [
          {
            protocol: "tcp",
            internal_port: FLY_AGENT_PORT,
            ports: [
              { port: 80, handlers: ["http"] },
              { port: 443, handlers: ["tls", "http"] },
            ],
          },
        ],
      },
    },
  });

  const handle = createFlyHandle(machine.id, runtimeToken);
  await waitForFlyMachine(machine.id);

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await flyAgentRequest({ handle, path: "/health" });
      return handle;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error(`Fly sandbox agent failed health check for machine ${machine.id}`);
}

async function inspectFlyHandle(handle: SandboxHandle): Promise<SandboxInspectInfo> {
  const machine = await getFlyMachine(handle.id);
  const state = machine.state?.toLowerCase() ?? "unknown";
  return {
    id: handle.id,
    state,
    running: state === "started" || state === "running",
    paused: false,
    dead: state === "destroyed" || state === "stopped",
    labels: getFlyMachineLabels(machine),
  };
}

async function ensureFlyHandleRunning(handle: SandboxHandle): Promise<void> {
  const info = await inspectFlyHandle(handle);
  if (!info.running) {
    throw new Error(`Fly machine ${handle.id} is not running (state: ${info.state})`);
  }
}

async function execFlyCommand(
  handle: SandboxHandle,
  cmd: string[],
  throwOnError = true,
  timeoutMs = EXEC_TIMEOUT_MS,
  user?: string,
  workingDir?: string,
  env?: string[],
): Promise<ExecResult> {
  await ensureFlyHandleRunning(handle);
  const response = await flyAgentRequest({
    handle,
    method: "POST",
    path: "/exec",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cmd,
      timeoutMs,
      user,
      workingDir,
      env,
      throwOnError,
    }),
  });
  const result = (await response.json()) as ExecResult;
  if (throwOnError && result.exitCode !== 0) {
    throw new Error(
      `Command failed (exit ${result.exitCode}): ${cmd.join(" ")}\nstderr: ${result.stderr}`,
    );
  }
  return result;
}

async function initializeFlyWorkspaceWithFiles(
  handle: SandboxHandle,
  files: Record<string, string>,
): Promise<void> {
  if (Object.keys(files).length === 0) return;
  await setupWorkspace(handle);
  await flyAgentRequest({
    handle,
    method: "POST",
    path: "/write-files",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: Object.fromEntries(
        Object.entries(files).map(([filePath, content]) => [
          filePath,
          Buffer.from(content, "utf8").toString("base64"),
        ]),
      ),
    }),
  });
}

async function readFlyArchive(
  handle: SandboxHandle,
  archivePath: string,
): Promise<NodeJS.ReadableStream> {
  const response = await flyAgentRequest({
    handle,
    path: `/archive?path=${encodeURIComponent(archivePath)}`,
  });
  return Readable.fromWeb(
    response.body as unknown as WebReadableStream<Uint8Array>,
  );
}

async function writeFlyArchive(
  handle: SandboxHandle,
  archiveStream: NodeJS.ReadableStream,
  destinationPath: string,
): Promise<void> {
  const bodyStream = Readable.toWeb(archiveStream as Readable) as BodyInit;
  await flyAgentRequest({
    handle,
    method: "POST",
    path: `/extract-archive?path=${encodeURIComponent(destinationPath)}`,
    duplex: "half",
    headers: { "Content-Type": "application/x-tar" },
    body: bodyStream,
  });
}

async function appendFlyFile(
  handle: SandboxHandle,
  filePath: string,
  content: string,
): Promise<void> {
  await flyAgentRequest({
    handle,
    method: "POST",
    path: "/append-file",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: filePath,
      content: Buffer.from(content, "utf8").toString("base64"),
    }),
  });
}

async function createFlyContainer(
  userId: string,
  chatId: string,
  sandboxId: string,
  image: string,
): Promise<SandboxHandle> {
  return await createFlyMachine(userId, chatId, sandboxId, image);
}

async function listFlyContainers(): Promise<SandboxContainerInfo[]> {
  const { appName } = getFlyConfig();
  const machines = await flyApiRequest<FlyMachine[]>({
    path: `/v1/apps/${appName}/machines`,
  });

  return machines.map((machine) => ({
    Id: machine.id,
    State: machine.state?.toLowerCase() ?? "unknown",
    Labels: getFlyMachineLabels(machine),
  }));
}

async function destroyFlyContainer(containerId: string): Promise<void> {
  const { appName } = getFlyConfig();
  await flyApiRequest({
    path: `/v1/apps/${appName}/machines/${containerId}`,
    method: "DELETE",
    parseAs: "none",
  });
}

export async function pingDocker(): Promise<boolean> {
  if (config.sandbox.runtime === "disabled") {
    return false;
  }
  return usingFlyRuntime() ? pingFlyRuntime() : pingDockerRuntime();
}

export async function ensureContainerRunning(container: SandboxHandle): Promise<void> {
  if (usingFlyRuntime()) {
    await ensureFlyHandleRunning(container);
    return;
  }
  await ensureDockerHandleRunning(container);
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
  return usingFlyRuntime()
    ? execFlyCommand(container, cmd, throwOnError, timeoutMs, user, workingDir, env)
    : execDockerCommand(container, cmd, throwOnError, timeoutMs, user, workingDir, env);
}

export async function setupWorkspace(container: SandboxHandle): Promise<void> {
  await execCommand(container, ["mkdir", "-p", CONTAINER_WORKDIR]);
  await execCommand(container, ["chmod", "755", CONTAINER_WORKDIR]);
}

export async function initializeWorkspaceWithFiles(
  container: SandboxHandle,
  files: Record<string, string>,
): Promise<void> {
  return usingFlyRuntime()
    ? initializeFlyWorkspaceWithFiles(container, files)
    : initializeDockerWorkspaceWithFiles(container, files);
}

export async function readArchive(
  container: SandboxHandle,
  archivePath: string,
): Promise<NodeJS.ReadableStream> {
  return usingFlyRuntime()
    ? readFlyArchive(container, archivePath)
    : readDockerArchive(container, archivePath);
}

export async function writeArchive(
  container: SandboxHandle,
  archiveStream: NodeJS.ReadableStream,
  destinationPath: string,
): Promise<void> {
  return usingFlyRuntime()
    ? writeFlyArchive(container, archiveStream, destinationPath)
    : writeDockerArchive(container, archiveStream, destinationPath);
}

export async function appendFileContent(
  container: SandboxHandle,
  filePath: string,
  content: string,
): Promise<void> {
  return usingFlyRuntime()
    ? appendFlyFile(container, filePath, content)
    : appendDockerFile(container, filePath, content);
}

export async function inspectContainer(containerId: string): Promise<SandboxInspectInfo> {
  return usingFlyRuntime()
    ? inspectFlyHandle({ id: containerId })
    : inspectDockerHandle({ id: containerId });
}

export async function createContainer(
  userId: string,
  chatId: string,
  sandboxId: string,
  image: string = getPrewarmImage(),
): Promise<SandboxHandle> {
  assertRuntimeEnabled();
  return usingFlyRuntime()
    ? createFlyContainer(userId, chatId, sandboxId, image)
    : createDockerContainer(userId, chatId, sandboxId, image);
}

async function createDockerContainer(
  userId: string,
  chatId: string,
  sandboxId: string,
  image: string,
): Promise<SandboxHandle> {
  const container = await docker.createContainer({
    Image: image,
    Cmd: ["sleep", "infinity"],
    Labels: getRuntimeLabelMetadata(userId, chatId, sandboxId),
    HostConfig: {
      Memory: 1024 * 1024 * 1024,
      MemorySwap: 3 * 1024 * 1024 * 1024,
      NanoCpus: 500000000,
      CpuShares: 512,
      PidsLimit: 2048,
    },
    User: "node",
    WorkingDir: "/home/node",
    Env: ["NODE_OPTIONS=--max-old-space-size=768"],
  });

  await container.start();

  try {
    await disconnectFromNetwork(container.id);
    const inspect = await inspectDockerHandle({ id: container.id });
    const connectedLabels = inspect.labels;
    void connectedLabels;
  } catch (error) {
    await container.remove({ force: true }).catch(() => {});
    throw new Error(
      `Failed to isolate sandbox container from network: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const handle = createDockerHandle(container.id);
  await setupWorkspace(handle);
  return handle;
}

export async function listContainers(): Promise<SandboxContainerInfo[]> {
  assertRuntimeEnabled();
  if (usingFlyRuntime()) {
    return await listFlyContainers();
  }
  const containers = await docker.listContainers({ all: true });
  return containers.map((info) => ({
    Id: info.Id,
    State: info.State,
    Labels: info.Labels,
  }));
}

export function getContainer(id: string): SandboxHandle {
  assertRuntimeEnabled();
  return { id };
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
    if (usingFlyRuntime()) {
      await destroyFlyContainer(containerId);
      return;
    }

    const container = docker.getContainer(containerId);
    await container.remove({ force: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return;
    }
    throw error;
  }
}

export async function connectToNetwork(
  containerId: string,
  networkName = "bridge",
): Promise<void> {
  if (usingFlyRuntime()) {
    return;
  }

  try {
    const container = docker.getContainer(containerId);
    const network = docker.getNetwork(networkName);
    await network.connect({ Container: container.id });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      return;
    }
    throw error;
  }
}

export async function disconnectFromNetwork(
  containerId: string,
  networkName = "bridge",
): Promise<void> {
  if (usingFlyRuntime()) {
    return;
  }

  try {
    const container = docker.getContainer(containerId);
    const network = docker.getNetwork(networkName);
    await network.disconnect({ Container: container.id, Force: true });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("not connected") || error.message.includes("404"))
    ) {
      return;
    }
    throw error;
  }
}

const FLY_SANDBOX_AGENT_SOURCE = String.raw`import http from "http";
import fs from "fs";
import { mkdir, writeFile, appendFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { pipeline } from "stream/promises";

const PORT = Number(process.env.EDWARD_AGENT_PORT || "4281");
const TOKEN = process.env.EDWARD_AGENT_TOKEN || "";
const WORKDIR = process.env.EDWARD_WORKDIR || "/home/node/edward";
const MAX_CAPTURE = Number(process.env.EDWARD_EXEC_MAX_CAPTURE_BYTES || "67108864");

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  const auth = req.headers.authorization || "";
  return auth === \`Bearer \${TOKEN}\`;
}

function normalizeRelativePath(filePath) {
  const normalized = path.posix.normalize(filePath).replace(/^\.\/+/, "");
  if (!normalized || normalized === "." || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    throw new Error(\`Invalid path: \${filePath}\`);
  }
  return normalized;
}

function resolveSafePath(filePath) {
  const normalized = normalizeRelativePath(filePath);
  return path.posix.join(WORKDIR, normalized);
}

function resolveArchivePath(rawPath) {
  const target = rawPath || ".";
  if (target === WORKDIR) return WORKDIR;
  if (target.startsWith(WORKDIR)) return target;
  return resolveSafePath(target);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleExec(req, res) {
  const body = await readJsonBody(req);
  const cmd = Array.isArray(body.cmd) ? body.cmd.filter((part) => typeof part === "string") : [];
  if (cmd.length === 0) {
    sendJson(res, 400, { error: "cmd is required" });
    return;
  }

  const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : 10000;
  const cwd = typeof body.workingDir === "string" && body.workingDir ? body.workingDir : WORKDIR;
  const envPairs = Array.isArray(body.env) ? body.env.filter((entry) => typeof entry === "string") : [];
  const env = { ...process.env };
  for (const pair of envPairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0) continue;
    env[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
  }

  const child = spawn(cmd[0], cmd.slice(1), { cwd, env });
  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let killedForOverflow = false;

  const collect = (bucket, streamName) => (chunk) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const nextBytes = streamName === "stdout" ? stdoutBytes + buf.length : stderrBytes + buf.length;
    if (nextBytes > MAX_CAPTURE) {
      killedForOverflow = true;
      child.kill("SIGKILL");
      return;
    }
    bucket.push(buf);
    if (streamName === "stdout") stdoutBytes += buf.length;
    else stderrBytes += buf.length;
  };

  child.stdout.on("data", collect(stdoutChunks, "stdout"));
  child.stderr.on("data", collect(stderrChunks, "stderr"));

  const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const exitCode = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? -1));
    child.on("error", () => resolve(-1));
  });
  clearTimeout(timeout);

  sendJson(res, 200, {
    exitCode,
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: killedForOverflow
      ? "Command output exceeded safe capture limit"
      : Buffer.concat(stderrChunks).toString("utf8"),
  });
}

async function handleWriteFiles(req, res) {
  const body = await readJsonBody(req);
  const files = body.files && typeof body.files === "object" ? body.files : {};
  for (const [filePath, base64Content] of Object.entries(files)) {
    if (typeof base64Content !== "string") continue;
    const absolutePath = resolveSafePath(filePath);
    await mkdir(path.posix.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(base64Content, "base64"));
  }
  sendJson(res, 200, { ok: true });
}

async function handleAppendFile(req, res) {
  const body = await readJsonBody(req);
  if (typeof body.path !== "string" || typeof body.content !== "string") {
    sendJson(res, 400, { error: "path and content are required" });
    return;
  }
  const absolutePath = resolveSafePath(body.path);
  await mkdir(path.posix.dirname(absolutePath), { recursive: true });
  await appendFile(absolutePath, Buffer.from(body.content, "base64"));
  sendJson(res, 200, { ok: true });
}

async function handleArchive(req, res) {
  const targetPath = resolveArchivePath(new URL(req.url, "http://localhost").searchParams.get("path") || ".");
  const parent = path.posix.dirname(targetPath);
  const base = path.posix.basename(targetPath);
  const tar = spawn("tar", ["-cf", "-", "-C", parent, base], { cwd: WORKDIR });
  res.writeHead(200, { "Content-Type": "application/x-tar" });
  tar.stdout.pipe(res);
  tar.stderr.on("data", () => {});
}

async function handleExtractArchive(req, res) {
  const targetPath = resolveArchivePath(new URL(req.url, "http://localhost").searchParams.get("path") || ".");
  await mkdir(targetPath, { recursive: true });
  const tar = spawn("tar", ["-xf", "-", "-C", targetPath], { cwd: WORKDIR });
  await pipeline(req, tar.stdin);
  const exitCode = await new Promise((resolve) => tar.on("close", (code) => resolve(code ?? -1)));
  if (exitCode !== 0) {
    sendJson(res, 500, { error: \`tar extract failed with exit \${exitCode}\` });
    return;
  }
  sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!TOKEN || !isAuthorized(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && req.url === "/exec") {
      await handleExec(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/write-files") {
      await handleWriteFiles(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/append-file") {
      await handleAppendFile(req, res);
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/archive")) {
      await handleArchive(req, res);
      return;
    }
    if (req.method === "POST" && req.url.startsWith("/extract-archive")) {
      await handleExtractArchive(req, res);
      return;
    }

    sendJson(res, 404, { error: "Not Found" });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

mkdir(WORKDIR, { recursive: true }).then(() => {
  server.listen(PORT, "0.0.0.0");
});`;
