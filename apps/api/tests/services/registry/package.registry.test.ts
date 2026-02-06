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

    it('should handle network timeouts', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('The operation was aborted'));

        const result = await resolvePackages(['react']);

        expect(result.invalid).toHaveLength(1);
        expect(result.invalid[0]!.error).toBe('The operation was aborted');
    });

    it('should use fuzzy search when package is not found', async () => {
        const mock404Response = new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
        const mockFuzzySearchResponse = new Response(JSON.stringify({
            objects: [{ package: { name: 'react', version: '18.2.0' } }]
        }), { status: 200 });
        const mockPackageResponse = new Response(JSON.stringify({
            name: 'react',
            'dist-tags': { latest: '18.2.0' },
            versions: { '18.2.0': { peerDependencies: {} } }
        }), { status: 200 });

        vi.mocked(fetch)
            .mockResolvedValueOnce(mock404Response)
            .mockResolvedValueOnce(mockFuzzySearchResponse)
            .mockResolvedValueOnce(mockPackageResponse);

        const result = await resolvePackages(['react-misspelled']);

        expect(result.valid).toHaveLength(1);
        expect(result.valid[0]!.name).toBe('react');
    });

    it('should respect recursion depth limits', async () => {
        const createPkgResponse = (name: string, peer: string) => new Response(JSON.stringify({
            name,
            'dist-tags': { latest: '1.0.0' },
            versions: { '1.0.0': { peerDependencies: { [peer]: '1.0.0' } } }
        }), { status: 200 });

        vi.mocked(fetch)
            .mockResolvedValueOnce(createPkgResponse('p1', 'p2'))
            .mockResolvedValueOnce(createPkgResponse('p2', 'p3'))
            .mockResolvedValueOnce(createPkgResponse('p3', 'p4'))
            .mockResolvedValueOnce(createPkgResponse('p4', 'p5'));

        const result = await resolvePackages(['p1']);
        
        expect(result.valid.map(p => p.name)).toEqual(['p1', 'p2', 'p3']);
    });

    it('should handle malformed registry responses', async () => {
        const mockMalformedResponse = new Response('Invalid JSON', { status: 200 });
        vi.mocked(fetch).mockResolvedValue(mockMalformedResponse);

        const result = await resolvePackages(['react']);

        expect(result.invalid).toHaveLength(1);
        expect(result.invalid[0]!.error).toContain('is not valid JSON');
    });

    it('should use cache for repeated lookups', async () => {
        const cachedPkg = { name: 'lodash', version: '4.17.21', valid: true };
        vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cachedPkg));

        const result = await resolvePackages(['lodash']);

        expect(result.valid[0]!.name).toBe('lodash');
        expect(fetch).not.toHaveBeenCalled();
    });
});
