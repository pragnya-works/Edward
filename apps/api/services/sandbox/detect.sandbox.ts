import { CONTAINER_WORKDIR, getContainer, execCommand } from './docker.sandbox.js';
import { doesFileExist, doesDirectoryExist, TIMEOUT_CHECK_MS } from './utils.sandbox.js';
import { logger } from '../../utils/logger.js';
import { ensureError } from '../../utils/error.js';

export type PackageManager = 'pnpm' | 'npm' | 'yarn';

const BUILD_OUTPUT_DIRECTORIES = ['dist', 'build', '.next/standalone', 'out', '.output'];

export async function detectPackageManager(containerId: string): Promise<PackageManager | null> {
    const pnpmLockExists = await doesFileExist(containerId, `${CONTAINER_WORKDIR}/pnpm-lock.yaml`);
    if (pnpmLockExists) {
        return 'pnpm';
    }

    const yarnLockExists = await doesFileExist(containerId, `${CONTAINER_WORKDIR}/yarn.lock`);
    if (yarnLockExists) {
        return 'yarn';
    }

    const npmLockExists = await doesFileExist(containerId, `${CONTAINER_WORKDIR}/package-lock.json`);
    if (npmLockExists) {
        return 'npm';
    }

    const packageJsonExists = await doesFileExist(containerId, `${CONTAINER_WORKDIR}/package.json`);
    if (packageJsonExists) {
        return 'npm';
    }

    return null;
}

export async function isPackageManagerInstalled(containerId: string, packageManager: string): Promise<boolean> {
    try {
        const container = getContainer(containerId);
        const result = await execCommand(container, ['which', packageManager], false, TIMEOUT_CHECK_MS);
        return result.exitCode === 0;
    } catch (error) {
        logger.debug({ error: ensureError(error), packageManager }, 'Error checking if package manager is installed');
        return false;
    }
}

export async function isStaticSite(containerId: string): Promise<boolean> {
    return await doesFileExist(containerId, `${CONTAINER_WORKDIR}/index.html`);
}

export async function findBuildOutputDirectory(containerId: string): Promise<string | null> {
    for (const directory of BUILD_OUTPUT_DIRECTORIES) {
        const fullPath = `${CONTAINER_WORKDIR}/${directory}`;
        const exists = await doesDirectoryExist(containerId, fullPath);
        if (exists) {
            return directory;
        }
    }

    if (await isStaticSite(containerId)) {
        return '.';
    }

    return null;
}

export async function predictBuildDirectory(containerId: string): Promise<string> {
    try {
        const container = getContainer(containerId);
        const result = await execCommand(container, ['cat', `${CONTAINER_WORKDIR}/package.json`], false, TIMEOUT_CHECK_MS);

        if (result.exitCode === 0) {
            const pkg = JSON.parse(result.stdout);
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

            if (deps.next) return '.next';
            if (deps.vite) return 'dist';
            if (deps.nuxt) return '.output';
            if (deps['react-scripts']) return 'build';
        }
    } catch (error) {
        logger.debug({ error: ensureError(error) }, 'Could not predict build directory from package.json');
    }

    if (await isStaticSite(containerId)) {
        return '.';
    }

    return 'dist';
}
