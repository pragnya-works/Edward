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

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const PREWARM_IMAGE = 'node:20-slim';
const SANDBOX_TTL = 30 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 100;
const CONTAINER_WORKDIR = '/home/node/edward';
const SANDBOX_LABEL = 'com.edward.sandbox';
const EXEC_TIMEOUT_MS = 10000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_EXEC_OUTPUT = 10 * 1024 * 1024; // 10MB
const MAX_WRITE_BUFFER = 5 * 1024 * 1024; // 5MB

const activeSandboxes = new Map<string, SandboxInstance>();
const writeBuffers = new Map<string, Map<string, string>>();
const writeTimers = new Map<string, NodeJS.Timeout>();
const pendingFlushes = new Map<string, Promise<void>>();

let cleanupInterval: NodeJS.Timeout | null = null;

function sanitizePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath);
  if (normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid path: ${filePath}`);
  }
  return normalized;
}

function shEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

async function ensureContainerRunning(container: Docker.Container): Promise<void> {
  const info = await container.inspect();

  if (info.State.Paused) {
    await container.unpause();
  } else if (!info.State.Running) {
    await container.start();
  }
}

async function execCommand(
  container: Docker.Container,
  cmd: string[],
  throwOnError = true
): Promise<ExecResult> {
  await ensureContainerRunning(container);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true });

  let stdout = '';
  let stderr = '';

  const result = await new Promise<ExecResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stream.destroy();
      reject(new Error(`Command timeout: ${cmd.join(' ')}`));
    }, EXEC_TIMEOUT_MS);

    const stdoutStream = new Writable({
      write(chunk: Buffer | string, _enc: BufferEncoding, cb: (error?: Error | null) => void) {
        if (stdout.length < MAX_EXEC_OUTPUT) stdout += chunk.toString();
        cb();
      },
    });

    const stderrStream = new Writable({
      write(chunk: Buffer | string, _enc: BufferEncoding, cb: (error?: Error | null) => void) {
        if (stderr.length < MAX_EXEC_OUTPUT) stderr += chunk.toString();
        cb();
      },
    });

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    stream.on('end', async () => {
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

    stream.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  if (throwOnError && result.exitCode !== 0) {
    const error = new Error(
      `Command failed (exit ${result.exitCode}): ${cmd.join(' ')}\nstderr: ${result.stderr}`
    );
    throw error;
  }

  return result;
}

async function setupWorkspace(container: Docker.Container): Promise<void> {
  await execCommand(container, ['mkdir', '-p', CONTAINER_WORKDIR]);
  await execCommand(container, ['chmod', '755', CONTAINER_WORKDIR]);
}

async function createContainer(): Promise<Docker.Container> {
  const container = await docker.createContainer({
    Image: PREWARM_IMAGE,
    Cmd: ['sleep', 'infinity'],
    Labels: { [SANDBOX_LABEL]: 'true' },
    HostConfig: {
      Memory: 1024 * 1024 * 1024,
      MemorySwap: 1024 * 1024 * 1024,
      NanoCpus: 1000000000,
      PidsLimit: 100,
      NetworkMode: 'none',
    },
    User: 'node',
    WorkingDir: '/home/node',
  });

  await container.start();
  await setupWorkspace(container);

  return container;
}

async function destroyContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.remove({ force: true });
}

async function reconcileContainers(): Promise<void> {
  const containers = await docker.listContainers({ all: true });
  const orphans = containers
    .filter((info) => info.Labels?.[SANDBOX_LABEL] === 'true')
    .filter((info) => !Array.from(activeSandboxes.values()).some(s => s.containerId === info.Id))
    .map((info) => info.Id);

  if (orphans.length > 0) {
    logger.info({ count: orphans.length }, 'Cleaning up execution orphans');
    await Promise.allSettled(orphans.map(destroyContainer));
  }
}

export async function initSandboxService(): Promise<void> {
  await reconcileContainers();

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const expired = Array.from(activeSandboxes.entries())
      .filter(([_, sandbox]) => sandbox.expiresAt < now)
      .map(([id]) => id);

    Promise.allSettled(expired.map(cleanupSandbox));
  }, CLEANUP_INTERVAL_MS);

  logger.info('Sandbox service initialized (On-Demand Mode)');
}

export async function provisionSandbox(): Promise<string> {
  const container = await createContainer();
  const sandboxId = nanoid(12);

  activeSandboxes.set(sandboxId, {
    id: sandboxId,
    containerId: container.id,
    expiresAt: Date.now() + SANDBOX_TTL,
  });

  return sandboxId;
}

export async function prepareSandboxFile(
  sandboxId: string,
  filePath: string
): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) throw new Error(`Sandbox not found: ${sandboxId}`);

  const normalizedPath = sanitizePath(filePath);
  const fullPath = path.posix.join(CONTAINER_WORKDIR, normalizedPath);
  const dirPath = path.posix.dirname(fullPath);

  const buffer = writeBuffers.get(sandboxId);
  buffer?.delete(normalizedPath);

  const container = docker.getContainer(sandbox.containerId);
  const cmd = `mkdir -p ${shEscape(dirPath)} && : > ${shEscape(fullPath)}`;

  await execCommand(container, ['sh', '-c', cmd]);
}

export async function writeSandboxFile(
  sandboxId: string,
  filePath: string,
  content: string
): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) return;

  const normalizedPath = sanitizePath(filePath);
  
  let buffer = writeBuffers.get(sandboxId);
  if (!buffer) {
    buffer = new Map();
    writeBuffers.set(sandboxId, buffer);
  }

  buffer.set(normalizedPath, (buffer.get(normalizedPath) || '') + content);
  let totalSize = 0;
  for (const content of buffer.values()) {
    totalSize += content.length;
  }

  const timer = writeTimers.get(sandboxId);
  if (timer) clearTimeout(timer);

  if (totalSize > MAX_WRITE_BUFFER) {
    writeTimers.delete(sandboxId);
    flushSandbox(sandboxId);
    return;
  }

  writeTimers.set(
    sandboxId,
    setTimeout(() => {
      writeTimers.delete(sandboxId);
      flushSandbox(sandboxId);
    }, WRITE_DEBOUNCE_MS)
  );
}

export async function flushSandbox(sandboxId: string): Promise<void> {
  const currentFlushPromise = pendingFlushes.get(sandboxId);

  if (currentFlushPromise) {
    await currentFlushPromise;

    const buffer = writeBuffers.get(sandboxId);
    if (buffer && buffer.size > 0) {
      return flushSandbox(sandboxId);
    }
    
    return;
  }

  const executeFlush = async () => {
    const sandbox = activeSandboxes.get(sandboxId);
    const buffer = writeBuffers.get(sandboxId);

    if (!sandbox || !buffer || buffer.size === 0) {
      return;
    }

    const entriesToWrite = new Map(buffer);
    buffer.clear();

    const container = docker.getContainer(sandbox.containerId);
    
    await ensureContainerRunning(container);

    for (const [filePath, content] of entriesToWrite) {
      if (typeof content !== 'string') {
        continue;
      }

      const fullPath = path.posix.join(CONTAINER_WORKDIR, filePath);
      
      const exec = await container.exec({
        Cmd: ['sh', '-c', `cat >> ${shEscape(fullPath)}`],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
        
        stream.write(content);
        stream.end();
      });
    }
  };

  const flushPromise = executeFlush();
  
  pendingFlushes.set(sandboxId, flushPromise);

  try {
    await flushPromise;
  } finally {
    pendingFlushes.delete(sandboxId);
  }
}

export async function cleanupSandbox(sandboxId: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) return;

  const timer = writeTimers.get(sandboxId);
  if (timer) {
    clearTimeout(timer);
    writeTimers.delete(sandboxId);
  }

  await flushSandbox(sandboxId).catch((err) =>
    logger.warn({ err, sandboxId }, 'Flush failed during cleanup')
  );

  await destroyContainer(sandbox.containerId).catch((err) =>
    logger.error({ err, containerId: sandbox.containerId }, 'Failed to destroy container')
  );

  activeSandboxes.delete(sandboxId);
  writeBuffers.delete(sandboxId);
  pendingFlushes.delete(sandboxId);
}

export async function shutdownSandboxService(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  await Promise.allSettled(
    Array.from(activeSandboxes.keys()).map(cleanupSandbox)
  );
  
  await reconcileContainers();

  logger.info('Sandbox service shutdown complete');
}