import Docker from "dockerode";
import tar from "tar-stream";
import { Writable } from "stream";
import { ExecResult } from "./types.service.js";
import path from "path";
import { config } from "../../app.config.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("DOCKER_SANDBOX");

const docker = new Docker();
const getPrewarmImage = () => config.docker.prewarmImage;
export const CONTAINER_WORKDIR = "/home/node/edward";
export const SANDBOX_LABEL = "com.edward.sandbox";
const EXEC_TIMEOUT_MS = 10000;
export const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

interface OutputAccumulator {
  chunks: string[];
  totalBytes: number;
  truncated: boolean;
}

function appendOutputChunk(
  accumulator: OutputAccumulator,
  chunk: Buffer | string,
  maxOutputBytes: number | null,
): void {
  const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

  if (maxOutputBytes == null) {
    accumulator.chunks.push(normalizedChunk.toString());
    accumulator.totalBytes += normalizedChunk.byteLength;
    return;
  }

  if (accumulator.totalBytes >= maxOutputBytes) {
    accumulator.truncated = true;
    return;
  }

  const remainingBytes = maxOutputBytes - accumulator.totalBytes;
  const nextChunk =
    normalizedChunk.byteLength > remainingBytes
      ? normalizedChunk.subarray(0, remainingBytes)
      : normalizedChunk;

  accumulator.chunks.push(nextChunk.toString());
  accumulator.totalBytes += nextChunk.byteLength;

  if (nextChunk.byteLength < normalizedChunk.byteLength) {
    accumulator.truncated = true;
  }
}

function finalizeOutput(
  accumulator: OutputAccumulator,
  maxOutputBytes: number | null,
): string {
  const output = accumulator.chunks.join("");
  if (!accumulator.truncated || maxOutputBytes == null) {
    return output;
  }

  return `${output}\n...[truncated after ${maxOutputBytes} bytes]`;
}

export async function pingDocker(): Promise<boolean> {
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

export async function ensureContainerRunning(
  container: Docker.Container,
): Promise<void> {
  const info = await container.inspect();
  if (info.State.Paused) {
    await container.unpause();
  } else if (!info.State.Running) {
    await container.start();
  }
}

export async function execCommand(
  container: Docker.Container,
  cmd: string[],
  throwOnError = true,
  timeoutMs = EXEC_TIMEOUT_MS,
  user?: string,
  workingDir?: string,
  env?: string[],
  signal?: AbortSignal,
  maxOutputBytes: number | null = DEFAULT_MAX_OUTPUT_BYTES,
): Promise<ExecResult> {
  await ensureContainerRunning(container);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    User: user,
    WorkingDir: workingDir,
    Env: env,
  });

  const stream = await exec.start({ hijack: true });

  const stdoutChunks: OutputAccumulator = {
    chunks: [],
    totalBytes: 0,
    truncated: false,
  };
  const stderrChunks: OutputAccumulator = {
    chunks: [],
    totalBytes: 0,
    truncated: false,
  };

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
    let abortHandler: (() => void) | null = null;
    const cleanup = () => {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
    };

    const timeout = setTimeout(() => {
      stream.destroy();
      cleanup();
      rejectOnce(
        new Error(`Command timeout after ${timeoutMs}ms: ${cmd.join(" ")}`),
      );
    }, timeoutMs);
    if (signal?.aborted) {
      clearTimeout(timeout);
      cleanup();
      rejectOnce(new Error(`Command aborted: ${cmd.join(" ")}`));
      return;
    }
    if (signal) {
      abortHandler = () => {
        clearTimeout(timeout);
        stream.destroy(new Error(`Command aborted: ${cmd.join(" ")}`));
        cleanup();
        rejectOnce(new Error(`Command aborted: ${cmd.join(" ")}`));
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    const stdoutStream = new Writable({
      write(
        chunk: Buffer | string,
        _enc: BufferEncoding,
        cb: (error?: Error | null) => void,
      ) {
        appendOutputChunk(stdoutChunks, chunk, maxOutputBytes);
        cb();
      },
    });

    const stderrStream = new Writable({
      write(
        chunk: Buffer | string,
        _enc: BufferEncoding,
        cb: (error?: Error | null) => void,
      ) {
        appendOutputChunk(stderrChunks, chunk, maxOutputBytes);
        cb();
      },
    });

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    stream.on("end", async () => {
      if (settled) {
        return;
      }
      clearTimeout(timeout);
      cleanup();
      stdoutStream.end();
      stderrStream.end();
      try {
        const { ExitCode } = await exec.inspect();
        resolveOnce({
          exitCode: ExitCode ?? -1,
          stdout: finalizeOutput(stdoutChunks, maxOutputBytes),
          stderr: finalizeOutput(stderrChunks, maxOutputBytes),
        });
      } catch (err) {
        rejectOnce(err instanceof Error ? err : new Error(String(err)));
      }
    });

    stream.on("error", (err) => {
      clearTimeout(timeout);
      cleanup();
      rejectOnce(err instanceof Error ? err : new Error(String(err)));
    });
  });

  if (throwOnError && result.exitCode !== 0) {
    throw new Error(
      `Command failed (exit ${result.exitCode}): ${cmd.join(" ")}\nstderr: ${result.stderr}`,
    );
  }

  return result;
}

export async function packFiles(
  files: Record<string, string>,
): Promise<NodeJS.ReadableStream> {
  try {
    const pack = tar.pack();

    for (const [filePath, content] of Object.entries(files)) {
      const normalizedPath = path.posix.normalize(filePath);
      if (
        normalizedPath.startsWith("..") ||
        path.posix.isAbsolute(normalizedPath)
      ) {
        throw new Error(
          `Security Error: Invalid file path '${filePath}' detected.`,
        );
      }
      pack.entry({ name: normalizedPath }, content);
    }

    pack.finalize();
    return pack;
  } catch (error) {
    throw new Error(
      `Failed to pack files: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function setupWorkspace(
  container: Docker.Container,
): Promise<void> {
  await execCommand(container, ["mkdir", "-p", CONTAINER_WORKDIR]);
  await execCommand(container, ["chmod", "755", CONTAINER_WORKDIR]);
}

export async function initializeWorkspaceWithFiles(
  container: Docker.Container,
  files: Record<string, string>,
): Promise<void> {
  if (Object.keys(files).length === 0) return;

  try {
    await setupWorkspace(container);

    const tarStream = await packFiles(files);

    await container.putArchive(tarStream, {
      path: CONTAINER_WORKDIR,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize workspace: ${msg}`);
  }
}

async function verifyNetworkIsolation(containerId: string): Promise<void> {
  const container = getContainer(containerId);
  const info = await container.inspect();
  const networks = info.NetworkSettings?.Networks ?? {};
  const connectedNetworks = Object.keys(networks);

  if (connectedNetworks.length > 0) {
    throw new Error(
      `Container still connected to networks: ${connectedNetworks.join(", ")}`,
    );
  }
}

export async function createContainer(
  userId: string,
  chatId: string,
  sandboxId: string,
  image: string = getPrewarmImage(),
): Promise<Docker.Container> {
  const container = await docker.createContainer({
    Image: image,
    Cmd: ["sleep", "infinity"],
    Labels: {
      [SANDBOX_LABEL]: "true",
      "com.edward.user": userId,
      "com.edward.chat": chatId,
      "com.edward.sandboxId": sandboxId,
    },
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
    await verifyNetworkIsolation(container.id);
  } catch (error) {
    await container.remove({ force: true }).catch(() => {});
    throw new Error(
      `Failed to isolate sandbox container from network: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await setupWorkspace(container);
  return container;
}

export async function listContainers(): Promise<Docker.ContainerInfo[]> {
  return docker.listContainers({ all: true });
}

export function getContainer(id: string): Docker.Container {
  const containerId = id.trim();
  if (!containerId) {
    throw new Error("Container ID is required");
  }

  return docker.getContainer(containerId);
}

export async function isContainerAlive(containerId: string): Promise<boolean> {
  try {
    const container = getContainer(containerId);
    const info = await container.inspect();
    return info.State.Status !== "removing" && !info.State.Dead;
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return false;
    }
    logger.warn({ containerId, error }, "Error checking container liveness");
    return false;
  }
}

export async function destroyContainer(containerId: string): Promise<void> {
  try {
    const container = getContainer(containerId);
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
  try {
    const container = getContainer(containerId);
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
  try {
    const container = getContainer(containerId);
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
