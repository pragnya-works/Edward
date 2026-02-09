import { describe, it, expect } from 'vitest';
import {
    calculateBasePath,
    generateRuntimeConfig,
    BasePathConfig
} from '../../../../services/sandbox/builder/basePathInjector.js';
import { Framework } from '../../../../services/planning/schemas.js';

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
            const config: BasePathConfig = { userId: 'u', chatId: 'c', framework: 'nextjs' as Framework, deploymentType: 'path' };
            const result = generateRuntimeConfig(config);
            expect(result.basePath).toBe('/u/c/preview');
            expect(result.assetPrefix).toBe('/u/c/preview/');
        });

        it('should generate correct config for subdomain deployment', () => {
            const config: BasePathConfig = { userId: 'u', chatId: 'c', framework: 'nextjs' as Framework, deploymentType: 'subdomain' };
            const result = generateRuntimeConfig(config);
            expect(result.basePath).toBe('');
            expect(result.assetPrefix).toBe('');
        });
    });
});
