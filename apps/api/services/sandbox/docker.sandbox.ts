import Docker from "dockerode";
import tar from "tar-stream";
import { Writable } from "stream";
import { ExecResult } from "./types.sandbox.js";
import path from "path";
import { config } from "../../config.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger('DOCKER_SANDBOX');

const docker = new Docker();
const getPrewarmImage = () => config.docker.prewarmImage;
export const CONTAINER_WORKDIR = "/home/node/edward";
export const SANDBOX_LABEL = "com.edward.sandbox";
const EXEC_TIMEOUT_MS = 10000;
const MAX_EXEC_OUTPUT = 10 * 1024 * 1024;

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

  let stdout = "";
  let stderr = "";

  const result = await new Promise<ExecResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stream.destroy();
      reject(
        new Error(`Command timeout after ${timeoutMs}ms: ${cmd.join(" ")}`),
      );
    }, timeoutMs);

    const stdoutStream = new Writable({
      write(
        chunk: Buffer | string,
        _enc: BufferEncoding,
        cb: (error?: Error | null) => void,
      ) {
        if (stdout.length < MAX_EXEC_OUTPUT) stdout += chunk.toString();
        cb();
      },
    });

    const stderrStream = new Writable({
      write(
        chunk: Buffer | string,
        _enc: BufferEncoding,
        cb: (error?: Error | null) => void,
      ) {
        if (stderr.length < MAX_EXEC_OUTPUT) stderr += chunk.toString();
        cb();
      },
    });

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    stream.on("end", async () => {
      clearTimeout(timeout);
      stdoutStream.end();
      stderrStream.end();
      try {
        const { ExitCode } = await exec.inspect();
        resolve({ exitCode: ExitCode ?? -1, stdout, stderr });
      } catch (err) {
        reject(err);
      }
    });

    stream.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
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
  const container = docker.getContainer(containerId);
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
    await container.remove({ force: true }).catch(() => { });
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
  return docker.getContainer(id);
}

export async function isContainerAlive(containerId: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
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
  try {
    const network = docker.getNetwork(networkName);
    await network.connect({ Container: containerId });
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
    const network = docker.getNetwork(networkName);
    await network.disconnect({ Container: containerId, Force: true });
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
