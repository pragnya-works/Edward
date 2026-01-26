import Docker from 'dockerode';
import tar from 'tar-stream';
import { Writable } from 'stream';
import { ExecResult, FileInfo } from './types.sandbox.js';

const docker = new Docker();
const PREWARM_IMAGE = 'node:20-slim';
export const CONTAINER_WORKDIR = '/home/node/edward';
export const SANDBOX_LABEL = 'com.edward.sandbox';
const EXEC_TIMEOUT_MS = 10000;
const MAX_EXEC_OUTPUT = 10 * 1024 * 1024;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function ensureContainerRunning(container: Docker.Container): Promise<void> {
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
        throw new Error(
            `Command failed (exit ${result.exitCode}): ${cmd.join(' ')}\nstderr: ${result.stderr}`
        );
    }

    return result;
}

export async function packFiles(files: Record<string, string>): Promise<NodeJS.ReadableStream> {
    try {
        const pack = tar.pack();

        for (const [path, content] of Object.entries(files)) {
            pack.entry({ name: path }, content);
        }

        pack.finalize();
        return pack;
    } catch (error) {
        throw new Error(`Failed to pack files: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function setupWorkspace(container: Docker.Container): Promise<void> {
    await execCommand(container, ['mkdir', '-p', CONTAINER_WORKDIR]);
    await execCommand(container, ['chmod', '755', CONTAINER_WORKDIR]);
}

export async function initializeWorkspaceWithFiles(
    container: Docker.Container,
    files: Record<string, string>
): Promise<void> {
    if (Object.keys(files).length === 0) return;

    try {
        await setupWorkspace(container);

        const tarStream = await packFiles(files);

        await container.putArchive(tarStream, {
            path: CONTAINER_WORKDIR
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to initialize workspace: ${msg}`);
    }
}

export async function createContainer(userId: string, chatId: string, sandboxId: string): Promise<Docker.Container> {
    const container = await docker.createContainer({
        Image: PREWARM_IMAGE,
        Cmd: ['sleep', 'infinity'],
        Labels: {
            [SANDBOX_LABEL]: 'true',
            'com.edward.user': userId,
            'com.edward.chat': chatId,
            'com.edward.sandboxId': sandboxId,
        },
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

export async function listContainers(): Promise<Docker.ContainerInfo[]> {
    return docker.listContainers({ all: true });
}

export function getContainer(id: string): Docker.Container {
    return docker.getContainer(id);
}

export async function destroyContainer(containerId: string): Promise<void> {
    try {
        const container = docker.getContainer(containerId);
        await container.remove({ force: true });
    } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
            return;
        }
        throw error;
    }
}

export async function listFilesInContainer(container: Docker.Container): Promise<FileInfo[]> {
    const result = await execCommand(
        container,
        [
            'sh',
            '-c',
            `find ${CONTAINER_WORKDIR} -type f ! -path '*/.*' -exec sh -c 'echo "{}|$(stat -f%z "{}" 2>/dev/null || stat -c%s "{}")"' \\;`
        ],
        false
    );

    if (result.exitCode !== 0 || !result.stdout.trim()) {
        return [];
    }

    const files: FileInfo[] = [];
    const lines = result.stdout.trim().split('\n');

    for (const line of lines) {
        const [fullPath, sizeStr] = line.split('|');
        if (!fullPath || !sizeStr) continue;

        const size = parseInt(sizeStr, 10);
        if (isNaN(size) || size > MAX_FILE_SIZE) continue;

        const relativePath = fullPath.replace(`${CONTAINER_WORKDIR}/`, '');
        if (relativePath && relativePath !== fullPath) {
            files.push({ path: relativePath, size });
        }
    }

    return files;
}
