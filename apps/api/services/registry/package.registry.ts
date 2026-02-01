import { z } from 'zod';
import { redis } from '../../lib/redis.js';
import { logger } from '../../utils/logger.js';

const CACHE_TTL_SECONDS = 86400;
const CACHE_PREFIX = 'edward:pkg:';
const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS = 5000;

const NpmPackageSchema = z.object({
    name: z.string(),
    'dist-tags': z.object({ latest: z.string() }).passthrough(),
    versions: z.record(z.object({
        peerDependencies: z.record(z.string()).optional()
    }).passthrough())
});

const ValidationResultSchema = z.object({
    name: z.string(),
    valid: z.boolean(),
    version: z.string().optional(),
    error: z.string().optional(),
    peerDependencies: z.record(z.string()).optional()
});

type ValidationResult = z.infer<typeof ValidationResultSchema>;

const NpmSearchSchema = z.object({
    objects: z.array(z.object({
        package: z.object({
            name: z.string(),
            version: z.string()
        })
    }))
});

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function getCachedResult(name: string): Promise<ValidationResult | null> {
    try {
        const cached = await redis.get(`${CACHE_PREFIX}${name}`);
        if (!cached) return null;
        return ValidationResultSchema.parse(JSON.parse(cached));
    } catch {
        return null;
    }
}

async function setCachedResult(name: string, result: ValidationResult): Promise<void> {
    try {
        await redis.set(
            `${CACHE_PREFIX}${name}`,
            JSON.stringify(result),
            'EX',
            CACHE_TTL_SECONDS
        );
    } catch (error) {
        logger.warn({ error, package: name }, 'Failed to cache validation result');
    }
}

async function fuzzySearchPackage(query: string): Promise<string | null> {
    try {
        const searchUrl = `${NPM_REGISTRY_URL}/-/v1/search?text=${encodeURIComponent(query)}&size=1`;
        const response = await fetchWithTimeout(searchUrl, FETCH_TIMEOUT_MS);
        if (!response.ok) return null;

        const data = await response.json();
        const parsed = NpmSearchSchema.safeParse(data);
        if (parsed.success && parsed.data.objects.length > 0) {
            return parsed.data.objects[0]!.package.name;
        }
        return null;
    } catch (error) {
        logger.warn({ error, query }, 'Fuzzy search failed');
        return null;
    }
}

async function validatePackage(name: string): Promise<ValidationResult> {
    const cached = await getCachedResult(name);
    if (cached) return cached;

    try {
        let response = await fetchWithTimeout(`${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`, FETCH_TIMEOUT_MS);

        if (response.status === 404) {
            logger.info({ name }, 'Package not found, attempting fuzzy search');
            const alternative = await fuzzySearchPackage(name);
            if (alternative && alternative !== name) {
                logger.info({ name, alternative }, 'Found fuzzy match');
                return validatePackage(alternative);
            }
        }

        if (!response.ok) {
            const result: ValidationResult = { name, valid: false, error: response.status === 404 ? 'Package not found' : `HTTP ${response.status}` };
            await setCachedResult(name, result);
            return result;
        }

        const data = await response.json();
        const parsed = NpmPackageSchema.safeParse(data);
        if (!parsed.success) {
            const result: ValidationResult = { name, valid: false, error: 'Invalid registry response' };
            await setCachedResult(name, result);
            return result;
        }

        const latestVersion = parsed.data['dist-tags'].latest;
        const versionData = parsed.data.versions[latestVersion];

        const result: ValidationResult = {
            name: parsed.data.name,
            valid: true,
            version: latestVersion,
            peerDependencies: versionData?.peerDependencies
        };

        await setCachedResult(name, result);
        return result;
    } catch (error) {
        logger.warn({ error, package: name }, 'Package validation failed');
        return { name, valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

async function resolveRecursivePeers(
    initialPackages: string[],
    maxDepth = 3
): Promise<ValidationResult[]> {
    const resolved = new Map<string, ValidationResult>();
    const pending = new Set<string>(initialPackages);
    let depth = 0;

    while (pending.size > 0 && depth < maxDepth) {
        const currentBatch = Array.from(pending);
        pending.clear();

        const results = await Promise.all(currentBatch.map(validatePackage));

        for (const res of results) {
            if (!resolved.has(res.name)) {
                resolved.set(res.name, res);
                if (res.valid && res.peerDependencies) {
                    for (const peer of Object.keys(res.peerDependencies)) {
                        if (!resolved.has(peer)) {
                            pending.add(peer);
                        }
                    }
                }
            }
        }
        depth++;
    }

    return Array.from(resolved.values());
}

export async function resolvePackages(
    requestedPackages: string[]
): Promise<{ valid: ValidationResult[]; invalid: ValidationResult[]; conflicts: string[] }> {
    const results = await resolveRecursivePeers(requestedPackages);
    const valid = results.filter(r => r.valid);
    const invalid = results.filter(r => !r.valid);

    const filteredInvalid = invalid.filter(inv =>
        requestedPackages.includes(inv.name) ||
        !valid.some(v => v.name === inv.name)
    );

    return { valid, invalid: filteredInvalid, conflicts: [] };
}
