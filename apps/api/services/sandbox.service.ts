import Docker from 'dockerode';
import path from 'path';
import { Writable } from 'stream';
import { logger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

const docker = new Docker();

interface SandboxInstance {
  id: string;
  containerId: string;
  expiresAt: number;
}

const POOL_SIZE = 3;
const PREWARM_IMAGE = 'node:20-slim';
const SANDBOX_TTL = 30 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 100;
const CONTAINER_WORKDIR = '/home/node/edward';
const SANDBOX_LABEL = 'com.edward.sandbox';
const EXEC_TIMEOUT_MS = 10000;

const activeSandboxes = new Map<string, SandboxInstance>();
const freeSlots: string[] = [];

let refillPromise: Promise<void> | null = null;

const writeBuffers = new Map<string, Map<string, string>>();
const writeTimers = new Map<string, NodeJS.Timeout>();
const pendingFlushes = new Map<string, Promise<void>>();

function sanitizePath(filePath: string): string {
  return path.posix.normalize(filePath).replace(/^(\.\.{1,2}(\/|\\|$))+/, '');
}

function shEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

async function resetWorkspace(container: Docker.Container): Promise<void> {
  await execCommand(container, ['sh', '-c', `rm -rf ${shEscape(CONTAINER_WORKDIR)} && mkdir -p ${shEscape(CONTAINER_WORKDIR)}`]);
}

async function createBaseContainer(): Promise<Docker.Container> {
  const container = await docker.createContainer({
    Image: PREWARM_IMAGE,
    Cmd: ['sleep', 'infinity'],
    Labels: { [SANDBOX_LABEL]: 'true' },
    HostConfig: {
      Memory: 1024 * 1024 * 1024,
      MemorySwap: 1024 * 1024 * 1024,
      NanoCpus: 1000000000,
      PidsLimit: 100,
    },
    User: 'node',
    WorkingDir: CONTAINER_WORKDIR,
  });

  await container.start();
  return container;
}

async function execCommand(container: Docker.Container, cmd: string[]): Promise<void> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const stream = await exec.start({});

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stream.destroy();
      reject(new Error(`Command timed out after ${EXEC_TIMEOUT_MS}ms: ${cmd.join(' ')}`));
    }, EXEC_TIMEOUT_MS);

    const stdout = new Writable({
      write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        callback();
      }
    });
    const stderr = new Writable({
      write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        callback();
      }
    });

    container.modem.demuxStream(stream, stdout, stderr);

    stream.on('end', () => {
      clearTimeout(timeout);
      resolve();
    });

    stream.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const inspect = await exec.inspect();
  if (inspect.ExitCode !== 0) {
    throw new Error(`Command failed with exit code ${inspect.ExitCode}: ${cmd.join(' ')}`);
  }
}

export async function initSandboxService(): Promise<void> {
  try {
    await reconcileContainers();
    await refillPool();

    setInterval(async () => {
      const now = Date.now();
      const expired = Array.from(activeSandboxes.keys()).filter((id) => activeSandboxes.get(id)!.expiresAt < now);
      for (const id of expired) {
        await cleanupSandbox(id).catch(() => {});
      }
    }, 60 * 1000);

    logger.info(`[Sandbox] Ready. Pool: ${freeSlots.length}, Active: ${activeSandboxes.size}`);
  } catch (error) {
    logger.error(error, '[Sandbox] Initialization failed');
  }
}

async function reconcileContainers(): Promise<void> {
  try {
    const containers = await docker.listContainers({ all: true });

    for (const info of containers) {
      const hasLabel = info.Labels?.[SANDBOX_LABEL] === 'true';
      const isOurImage = info.Image === PREWARM_IMAGE;
      const isOurCommand = info.Command && info.Command.includes('sleep infinity');

      if (hasLabel || (isOurImage && isOurCommand)) {
        const container = docker.getContainer(info.Id);

        if (freeSlots.length < POOL_SIZE) {
          try {
            if (info.State === 'paused') {
              await container.unpause().catch(() => {});
            } else if (info.State === 'exited' || info.State === 'created') {
              await container.start().catch(() => {});
            }

            await resetWorkspace(container);
            await container.pause();
            freeSlots.push(info.Id);
          } catch {
            await container.remove({ force: true }).catch(() => {});
          }
        } else {
          await container.remove({ force: true }).catch(() => {});
        }
      }
    }
  } catch (error) {
    logger.error(error, '[Sandbox] Reconcile failed');
  }
}

async function refillPool(): Promise<void> {
  if (refillPromise) return refillPromise;

  refillPromise = (async () => {
    try {
      const currentCount = freeSlots.length + activeSandboxes.size;
      if (currentCount >= POOL_SIZE) return;

      const needed = POOL_SIZE - currentCount;

      for (let i = 0; i < needed; i++) {
        const container = await createBaseContainer();
        await execCommand(container, ['mkdir', '-p', CONTAINER_WORKDIR]);
        await container.pause();

        freeSlots.push(container.id);
      }
    } catch (error) {
      logger.error(error, `[Sandbox] Refill failed`);
    } finally {
      refillPromise = null;
    }
  })();

  return refillPromise;
}

export async function provisionSandbox(): Promise<string> {
  let containerId = freeSlots.shift();

  if (containerId) {
    try {
      const container = docker.getContainer(containerId);
      await container.unpause();
    } catch {
      containerId = undefined;
    }
  }

  if (!containerId) {
    const container = await createBaseContainer();
    await execCommand(container, ['mkdir', '-p', CONTAINER_WORKDIR]);
    containerId = container.id;
  }

  const sandboxId = nanoid(12);
  activeSandboxes.set(sandboxId, {
    id: sandboxId,
    containerId,
    expiresAt: Date.now() + SANDBOX_TTL,
  });

  refillPool().catch(() => {});

  return sandboxId;
}

export async function prepareSandboxFile(sandboxId: string, filePath: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) return;

  const normalizedPath = sanitizePath(filePath);
  const buffer = writeBuffers.get(sandboxId);
  if (buffer) buffer.delete(normalizedPath);

  try {
    const container = docker.getContainer(sandbox.containerId);
    const fullPath = path.posix.join(CONTAINER_WORKDIR, normalizedPath);
    const dirPath = path.posix.dirname(fullPath);

    const cmd = `mkdir -p ${shEscape(dirPath)} && truncate -s 0 ${shEscape(fullPath)}`;

    await execCommand(container, ['sh', '-c', cmd]);
  } catch (error) {
    logger.error(error, `[Sandbox] File preparation failed: ${normalizedPath}`);
  }
}

export async function writeSandboxFile(sandboxId: string, filePath: string, content: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) return;

  const normalizedPath = sanitizePath(filePath);
  if (!normalizedPath) return;

  let buffer = writeBuffers.get(sandboxId);
  if (!buffer) {
    buffer = new Map();
    writeBuffers.set(sandboxId, buffer);
  }
  buffer.set(normalizedPath, (buffer.get(normalizedPath) || '') + content);

  const existingTimer = writeTimers.get(sandboxId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    writeTimers.delete(sandboxId);
    flushSandbox(sandboxId).catch(() => {});
  }, WRITE_DEBOUNCE_MS);

  writeTimers.set(sandboxId, timer);
}

export async function flushSandbox(sandboxId: string): Promise<void> {
  const existingFlush = pendingFlushes.get(sandboxId);
  if (existingFlush) {
    await existingFlush;
    return;
  }

  const flushPromise = (async () => {
    const sandbox = activeSandboxes.get(sandboxId);
    const buffer = writeBuffers.get(sandboxId);

    if (!sandbox || !buffer || buffer.size === 0) return;

    const currentBuffer = new Map(buffer);
    buffer.clear();

    try {
      const container = docker.getContainer(sandbox.containerId);

      for (const [filePath, content] of currentBuffer.entries()) {
        if (!content) continue;

        const fullPath = path.posix.join(CONTAINER_WORKDIR, filePath);
        const dirPath = path.posix.dirname(fullPath);

        const base64Content = Buffer.from(content).toString('base64');
        const cmd = `mkdir -p ${shEscape(dirPath)} && echo "${base64Content}" | base64 -d >> ${shEscape(fullPath)}`;

        await execCommand(container, ['sh', '-c', cmd]);
      }
    } catch (error) {
      logger.error(error, `[Sandbox] Flush failed for ${sandboxId}`);
      throw error;
    }
  })();

  pendingFlushes.set(sandboxId, flushPromise);
  try {
    await flushPromise;
  } finally {
    pendingFlushes.delete(sandboxId);
  }
}

export async function cleanupSandbox(sandboxId: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    return;
  }

  const timer = writeTimers.get(sandboxId);
  if (timer) {
    clearTimeout(timer);
    writeTimers.delete(sandboxId);
  }

  await flushSandbox(sandboxId).catch(() => {});

  const container = docker.getContainer(sandbox.containerId);
  await container.stop({ t: 5 }).catch(() => {});
  await container.remove({ force: true }).catch(() => {});

  activeSandboxes.delete(sandboxId);
  writeBuffers.delete(sandboxId);
  writeTimers.delete(sandboxId);
  pendingFlushes.delete(sandboxId);

  refillPool().catch(() => {});
}

