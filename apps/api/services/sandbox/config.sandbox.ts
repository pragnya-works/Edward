import { getContainer, execCommand } from './docker.sandbox.js';
import { doesFileExist, TIMEOUT_CHECK_MS } from './utils.sandbox.js';
import { logger } from '../../utils/logger.js';

export async function ensureNextJsConfig(containerId: string, workdir: string): Promise<void> {
    const isNextJs = await doesFileExist(containerId, `${workdir}/next.config.js`) ||
        await doesFileExist(containerId, `${workdir}/next.config.mjs`) ||
        await doesFileExist(containerId, `${workdir}/next.config.ts`);

    if (!isNextJs) return;

    const tsConfigExists = await doesFileExist(containerId, `${workdir}/tsconfig.json`);
    const jsConfigExists = await doesFileExist(containerId, `${workdir}/jsconfig.json`);

    if (!tsConfigExists && !jsConfigExists) {
        logger.info({ containerId }, 'Creating default tsconfig.json for Next.js app to support path aliases');
        const defaultTsConfig = {
            compilerOptions: {
                target: 'es5',
                lib: ['dom', 'dom.iterable', 'esnext'],
                allowJs: true,
                skipLibCheck: true,
                strict: false,
                forceConsistentCasingInFileNames: true,
                noEmit: true,
                esModuleInterop: true,
                module: 'esnext',
                moduleResolution: 'node',
                resolveJsonModule: true,
                isolatedModules: true,
                jsx: 'preserve',
                incremental: true,
                plugins: [{ name: 'next' }],
                paths: {
                    '@/*': ['./*']
                }
            },
            include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
            exclude: ['node_modules']
        };

        const container = getContainer(containerId);
        await execCommand(container, ['sh', '-c', `echo '${JSON.stringify(defaultTsConfig)}' > tsconfig.json`], false, TIMEOUT_CHECK_MS, undefined, workdir);
    }
}
