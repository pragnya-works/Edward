import { getContainer, execCommand, CONTAINER_WORKDIR } from '../docker.sandbox.js';
import { logger } from '../../../utils/logger.js';
import type Docker from 'dockerode';

export interface BuildOutputInfo {
    directory: string;
    type: 'static' | 'ssr' | 'hybrid' | 'vanilla';
}

type Framework = 'nextjs' | 'vite' | 'vanilla';

const FRAMEWORK_OUTPUT_DIRS: Record<Framework, string[]> = {
    nextjs: ['dist', 'out', '.next'],
    vite: ['dist'],
    vanilla: ['dist', 'build', 'out', '.next', '.output'],
};

const COMMON_OUTPUT_DIRS = ['dist', 'build', 'out', '.next', '.output'];

async function directoryExists(container: Docker.Container, path: string): Promise<boolean> {
    const result = await execCommand(container, ['test', '-d', path], false, undefined, undefined, CONTAINER_WORKDIR);
    return result.exitCode === 0;
}

function detectFramework(pkg: Record<string, unknown>): Framework {
    const dependencies = (pkg.dependencies as Record<string, string>) || {};
    const devDependencies = (pkg.devDependencies as Record<string, string>) || {};

    if (dependencies.next) return 'nextjs';
    if (devDependencies.vite || dependencies.vite) return 'vite';
    return 'vanilla';
}

async function findFirstExistingDirectory(
    container: Docker.Container,
    directories: string[]
): Promise<string | null> {
    for (const dir of directories) {
        if (await directoryExists(container, dir)) {
            return dir;
        }
    }
    return null;
}

export async function detectBuildOutput(
    containerId: string,
    sandboxId: string
): Promise<BuildOutputInfo> {
    const container = getContainer(containerId);

    try {
        const pkgResult = await execCommand(container, ['cat', 'package.json'], false, undefined, undefined, CONTAINER_WORKDIR);

        if (pkgResult.exitCode !== 0) {
            logger.warn({ sandboxId, stderr: pkgResult.stderr }, 'Failed to read package.json');
            return { directory: '.', type: 'vanilla' };
        }

        const pkg = JSON.parse(pkgResult.stdout);
        const framework = detectFramework(pkg);

        logger.info({ sandboxId, framework }, 'Framework detected from package.json');

        if (framework === 'nextjs') {
            const foundDir = await findFirstExistingDirectory(container, FRAMEWORK_OUTPUT_DIRS.nextjs);

            if (foundDir === 'dist' || foundDir === 'out') {
                logger.info({ sandboxId, directory: foundDir }, 'Found Next.js static export');
                return { directory: foundDir, type: 'static' };
            }

            if (foundDir === '.next') {
                logger.info({ sandboxId }, 'Found Next.js build output (.next/)');
                return { directory: '.next', type: 'hybrid' };
            }

            throw new Error('Next.js build artifacts (dist, out, or .next) not found. Build likely failed.');
        }

        if (framework === 'vite') {
            const foundDir = await findFirstExistingDirectory(container, FRAMEWORK_OUTPUT_DIRS.vite);

            if (foundDir) {
                return { directory: foundDir, type: 'static' };
            }

            throw new Error('Vite build artifacts (dist) not found. Build likely failed.');
        }

        const foundDir = await findFirstExistingDirectory(container, COMMON_OUTPUT_DIRS);

        if (foundDir) {
            return { directory: foundDir, type: foundDir === '.next' ? 'hybrid' : 'static' };
        }

        return { directory: '.', type: 'vanilla' };
    } catch (error) {
        logger.error({ error, sandboxId }, 'Build output detection failed');
        throw error;
    }
}
