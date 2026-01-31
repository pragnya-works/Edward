import { getContainer, execCommand, CONTAINER_WORKDIR } from './sandbox/docker.sandbox.js';
import { logger } from '../utils/logger.js';
import { detectBuildOutput, BuildOutputInfo } from './sandbox/builder/output.detector.js';
import { TIMEOUT_BUILD_MS } from './sandbox/utils.sandbox.js';
import { injectBasePathConfigs, calculateBasePath } from './sandbox/builder/base-path.injector.js';

export interface BuildResult {
    success: boolean;
    outputInfo?: BuildOutputInfo;
    error?: string;
}

export interface BuildOptions {
    userId: string;
    chatId: string;
    framework?: string;
}

export async function runUnifiedBuild(
    containerId: string,
    sandboxId: string,
    options?: BuildOptions
): Promise<BuildResult> {
    const container = getContainer(containerId);

    try {
        if (options?.userId && options?.chatId) {
            const framework = options.framework || 'vanilla';
            await injectBasePathConfigs(
                containerId,
                {
                    userId: options.userId,
                    chatId: options.chatId,
                    framework: framework as 'nextjs' | 'vite-react' | 'vanilla',
                },
                sandboxId
            );
        }

        const basePath = options?.userId && options?.chatId
            ? calculateBasePath(options.userId, options.chatId)
            : '';

        const pkgResult = await execCommand(container, ['cat', 'package.json'], false, undefined, undefined, CONTAINER_WORKDIR);
        const hasPackageJson = pkgResult.exitCode === 0;

        if (!hasPackageJson) {
            logger.warn({ sandboxId }, 'No package.json found');
            const outputInfo = await detectBuildOutput(containerId, sandboxId);
            return { success: true, outputInfo };
        }

        const pkg = JSON.parse(pkgResult.stdout);

        if (!pkg.scripts?.build) {
            logger.warn({ sandboxId }, 'No build script found in package.json');
            const outputInfo = await detectBuildOutput(containerId, sandboxId);
            return { success: true, outputInfo };
        }

        logger.info({ sandboxId, script: pkg.scripts.build, basePath }, 'Running build command');

        const buildResult = await execCommand(
            container,
            ['pnpm', 'run', 'build'],
            false,
            TIMEOUT_BUILD_MS,
            undefined,
            CONTAINER_WORKDIR,
            ['NEXT_TELEMETRY_DISABLED=1', 'CI=true', `EDWARD_BASE_PATH=${basePath}`]
        );

        logger.info({
            sandboxId,
            exitCode: buildResult.exitCode,
            stdoutLength: buildResult.stdout.length,
            stderrLength: buildResult.stderr.length
        }, 'Build command completed');

        if (buildResult.exitCode !== 0) {
            logger.error({ sandboxId, exitCode: buildResult.exitCode }, 'Build failed');
            logger.debug({
                sandboxId,
                stdout: buildResult.stdout.slice(-500),
                stderr: buildResult.stderr.slice(-500)
            }, 'Build failure details');

            return {
                success: false,
                error: `Build failed (exit ${buildResult.exitCode}): ${buildResult.stderr || buildResult.stdout}`.slice(0, 500)
            };
        }

        const outputInfo = await detectBuildOutput(containerId, sandboxId);

        logger.info({ sandboxId, outputInfo }, 'Build completed and output detected');

        return { success: true, outputInfo };
    } catch (error) {
        logger.error({ error, sandboxId }, 'Error during unified build process');
        return {
            success: false,
            error: `Build process error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
