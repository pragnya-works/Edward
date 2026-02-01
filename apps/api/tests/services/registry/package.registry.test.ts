import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePackages } from '../../../services/registry/package.registry.js';
import { redis } from '../../../lib/redis.js';

vi.mock('../../../lib/redis.js', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
    }
}));

global.fetch = vi.fn();

describe('PackageRegistry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should resolve direct dependencies', async () => {
        const mockResponse = new Response(JSON.stringify({
            name: 'react',
            'dist-tags': { latest: '18.2.0' },
            versions: {
                '18.2.0': { peerDependencies: {} }
            }
        }), { status: 200 });

        vi.mocked(fetch).mockResolvedValue(mockResponse);

        const result = await resolvePackages(['react']);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0]!.name).toBe('react');
        expect(result.valid[0]!.version).toBe('18.2.0');
    });

    it('should resolve deep peer dependencies', async () => {
        const mockDomResponse = new Response(JSON.stringify({
            name: 'react-dom',
            'dist-tags': { latest: '18.2.0' },
            versions: {
                '18.2.0': { peerDependencies: { 'react': '18.2.0' } }
            }
        }), { status: 200 });

        const mockReactResponse = new Response(JSON.stringify({
            name: 'react',
            'dist-tags': { latest: '18.2.0' },
            versions: {
                '18.2.0': { peerDependencies: {} }
            }
        }), { status: 200 });

        vi.mocked(fetch)
            .mockResolvedValueOnce(mockDomResponse)
            .mockResolvedValueOnce(mockReactResponse);

        const result = await resolvePackages(['react-dom']);

        expect(result.valid).toHaveLength(2);
        const names = result.valid.map(p => p.name);
        expect(names).toContain('react-dom');
        expect(names).toContain('react');
    });

    it('should handle invalid packages', async () => {
        const mock404Response = new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
        vi.mocked(fetch).mockResolvedValue(mock404Response);

        const result = await resolvePackages(['non-existent-pkg']);

        expect(result.invalid).toHaveLength(1);
        expect(result.invalid[0]!.name).toBe('non-existent-pkg');
    });

    it('should use cache for repeated lookups', async () => {
        const cachedPkg = { name: 'lodash', version: '4.17.21', valid: true };
        vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cachedPkg));

        const result = await resolvePackages(['lodash']);

        expect(result.valid[0]!.name).toBe('lodash');
        expect(fetch).not.toHaveBeenCalled();
    });
});
