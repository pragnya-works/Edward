import { describe, it, expect, beforeEach } from 'vitest';
import {
    calculateBasePath,
    generateRuntimeConfig,
    generateNextConfig,
    generateViteConfig,
    detectDeploymentType
} from '../../../../services/sandbox/builder/basePathInjector.js';

describe('BasePathInjector', () => {
    describe('calculateBasePath', () => {
        it('should return empty string for subdomain deployment', () => {
            expect(calculateBasePath('user', 'chat', 'subdomain')).toBe('');
        });

        it('should return hierarchical path for path deployment', () => {
            expect(calculateBasePath('user123', 'chat456', 'path'))
                .toBe('/user123/chat456/preview');
        });

        it('should sanitize path components', () => {
            expect(calculateBasePath('user..name', 'chat/id', 'path'))
                .toBe('/user..name/chat_id/preview');
        });
    });

    describe('generateRuntimeConfig', () => {
        it('should generate correct config for path deployment', () => {
            const config = { userId: 'u', chatId: 'c', framework: 'nextjs' as any, deploymentType: 'path' as any };
            const result = generateRuntimeConfig(config);
            expect(result.basePath).toBe('/u/c/preview');
            expect(result.assetPrefix).toBe('/u/c/preview/');
        });

        it('should generate correct config for subdomain deployment', () => {
            const config = { userId: 'u', chatId: 'c', framework: 'nextjs' as any, deploymentType: 'subdomain' as any };
            const result = generateRuntimeConfig(config);
            expect(result.basePath).toBe('');
            expect(result.assetPrefix).toBe('');
        });
    });

    describe('generateNextConfig', () => {
        it('should contain output export and basePath', () => {
            const runtimeConfig = { basePath: '/u/c/preview', assetPrefix: '/u/c/preview' };
            const config = generateNextConfig(runtimeConfig);
            expect(config).toContain("output: 'export'");
            expect(config).toContain("basePath: '/u/c/preview'");
            expect(config).toContain("assetPrefix: '/u/c/preview'");
        });

        it('should handle empty basePath', () => {
            const runtimeConfig = { basePath: '', assetPrefix: '' };
            const config = generateNextConfig(runtimeConfig);
            expect(config).not.toContain("basePath:");
        });
    });

    describe('generateViteConfig', () => {
        it('should contain base and react plugin', () => {
            const runtimeConfig = { basePath: '/u/c/preview', assetPrefix: '/u/c/preview/' };
            const config = generateViteConfig(runtimeConfig);
            expect(config).toContain("base: '/u/c/preview/'");
            expect(config).toContain("react()");
        });

        it('should use / as default base', () => {
            const runtimeConfig = { basePath: '', assetPrefix: '' };
            const config = generateViteConfig(runtimeConfig);
            expect(config).toContain("base: '/'");
        });
    });

    describe('detectDeploymentType', () => {
        beforeEach(() => {
            delete process.env.EDWARD_DEPLOYMENT_TYPE;
        });

        it('should use config value if provided', () => {
            expect(detectDeploymentType({ deploymentType: 'subdomain' } as any)).toBe('subdomain');
        });

        it('should use env variable if config is missing', () => {
            process.env.EDWARD_DEPLOYMENT_TYPE = 'subdomain';
            expect(detectDeploymentType({} as any)).toBe('subdomain');
        });

        it('should default to path', () => {
            expect(detectDeploymentType({} as any)).toBe('path');
        });
    });
});
