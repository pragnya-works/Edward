import { logger } from '../../../utils/logger.js';
import { resolvePackages } from '../../registry/package.registry.js';
import { PackageInfo, Framework } from '../schemas.js';

const FRAMEWORK_CORE_DEPS: Record<Framework, string[]> = {
    nextjs: ['react', 'react-dom', 'next'],
    'vite-react': ['react', 'react-dom'],
    vanilla: []
};

const COMMON_OPTIONAL_DEPS: Record<string, string[]> = {
    ui: ['lucide-react', 'clsx', 'tailwind-merge'],
    forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
    state: ['zustand'],
    animation: ['framer-motion'],
    charts: ['recharts'],
    tables: ['@tanstack/react-table'],
    theme: ['next-themes']
};

function deduplicatePackages(packages: string[]): string[] {
    return [...new Set(packages.map(p => p.trim().toLowerCase()).filter(Boolean))];
}

function isBlockedPackage(name: string): boolean {
    const blocked = ['node-gyp', 'fsevents', 'esbuild', 'sharp'];
    return blocked.some(b => name.includes(b));
}

export async function resolveDependencies(
    requestedPackages: string[],
    framework: Framework
): Promise<{ resolved: PackageInfo[]; failed: PackageInfo[]; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        const coreDeps = FRAMEWORK_CORE_DEPS[framework] || [];
        const allPackages = deduplicatePackages([...coreDeps, ...requestedPackages]);

        const filtered = allPackages.filter(pkg => {
            if (isBlockedPackage(pkg)) {
                warnings.push(`Skipped blocked package: ${pkg}`);
                return false;
            }
            return true;
        });

        logger.debug({ framework, count: filtered.length }, 'Resolving dependencies');

        const { valid, invalid, conflicts } = await resolvePackages(filtered);

        if (conflicts.length > 0) {
            warnings.push(...conflicts.map(c => `Peer conflict: ${c}`));
        }

        const resolved: PackageInfo[] = valid.map(v => ({
            name: v.name,
            version: v.version || 'latest',
            valid: true,
            peerDependencies: v.peerDependencies
        }));

        const failed: PackageInfo[] = invalid.map(i => ({
            name: i.name,
            version: '',
            valid: false,
            error: i.error
        }));

        logger.info({
            framework,
            resolved: resolved.length,
            failed: failed.length,
            warnings: warnings.length
        }, 'Dependency resolution complete');

        return { resolved, failed, warnings };
    } catch (error) {
        logger.error({ error, framework }, 'Dependency resolution failed');
        return {
            resolved: [],
            failed: requestedPackages.map(name => ({ name, version: '', valid: false, error: 'Resolution failed' })),
            warnings: ['Resolution failed: ' + (error instanceof Error ? error.message : 'Unknown error')]
        };
    }
}

export function suggestAlternatives(failedPackage: string): string[] {
    const alternatives: Record<string, string[]> = {
        'moment': ['dayjs', 'date-fns'],
        'axios': ['ky', 'got'],
        'lodash': ['lodash-es', 'radash'],
        'styled-components': ['emotion', '@emotion/react'],
        'redux': ['zustand', 'jotai', 'valtio']
    };

    return alternatives[failedPackage] || [];
}

export function getCommonPackagesForFeature(feature: string): string[] {
    return COMMON_OPTIONAL_DEPS[feature] || [];
}
