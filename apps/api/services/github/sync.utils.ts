import { type GithubFile } from '@edward/octokit';
import path from 'path';
import tar from 'tar-stream';
import zlib from 'zlib';
import { CONTAINER_WORKDIR } from '../sandbox/docker.sandbox.js';

const WORKDIR_PARTS = CONTAINER_WORKDIR.split('/').filter(Boolean);
const WORKDIR_BASENAME = WORKDIR_PARTS[WORKDIR_PARTS.length - 1] ?? '';
const ENV_ALLOWLIST = new Set(['.env.example', '.env.sample', '.env.template', '.env.dist']);
const IGNORE_PATHS: RegExp[] = [
    /^node_modules\//,
    /^dist\//,
    /^build\//,
    /^out\//,
    /^\.next\//,
    /^\.output\//,
    /^preview\//,
    /^previews\//,
    /^\.turbo\//,
    /^\.cache\//,
    /^coverage\//,
];

function stripWorkdirPrefix(parts: string[]): string[] {
    if (WORKDIR_PARTS.length > 0) {
        for (let i = 0; i <= parts.length - WORKDIR_PARTS.length; i++) {
            let matches = true;
            for (let j = 0; j < WORKDIR_PARTS.length; j++) {
                if (parts[i + j] !== WORKDIR_PARTS[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return parts.slice(i + WORKDIR_PARTS.length);
            }
        }
    }

    if (WORKDIR_BASENAME && parts[0] === WORKDIR_BASENAME) {
        return parts.slice(1);
    }

    return parts;
}

function normalizeTarPath(rawPath: string): string | null {
    const unixPath = rawPath.replace(/\\/g, '/');
    if (/(^|\/)\.\.(\/|$)/.test(unixPath)) return null;

    const normalized = path.posix
        .normalize(unixPath)
        .replace(/^(\.\/)+/, '');

    if (!normalized || normalized === '.') return null;

    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    const stripped = stripWorkdirPrefix(parts);
    if (stripped.length === 0) return null;

    const cleaned = stripped.join('/');
    if (cleaned.startsWith('..') || cleaned.includes('../')) return null;
    if (path.posix.isAbsolute(cleaned)) return null;

    return cleaned;
}

function isSensitivePath(relativePath: string): boolean {
    const lowerPath = relativePath.toLowerCase();
    const parts = lowerPath.split('/');
    const baseName = parts[parts.length - 1] ?? '';

    if (parts.includes('.git') || parts.includes('.ssh')) return true;

    if (
        baseName === '.npmrc' ||
        baseName === '.yarnrc' ||
        baseName === '.yarnrc.yml' ||
        baseName === '.pypirc' ||
        baseName === '.netrc' ||
        baseName === '.dockercfg' ||
        baseName === '.dockerconfigjson'
    ) {
        return true;
    }

    if (baseName.startsWith('.env') && !ENV_ALLOWLIST.has(baseName)) return true;

    if (
        baseName === 'id_rsa' ||
        baseName === 'id_rsa.pub' ||
        baseName === 'id_ed25519' ||
        baseName === 'id_ed25519.pub' ||
        baseName === 'id_ecdsa' ||
        baseName === 'id_ecdsa.pub' ||
        baseName === 'id_dsa' ||
        baseName === 'id_dsa.pub'
    ) {
        return true;
    }

    if (
        baseName.endsWith('.pem') ||
        baseName.endsWith('.key') ||
        baseName.endsWith('.p12') ||
        baseName.endsWith('.pfx')
    ) {
        return true;
    }

    if (parts.length >= 2 && parts[parts.length - 2] === '.aws' && baseName === 'credentials') {
        return true;
    }

    return false;
}

function isIgnoredPath(relativePath: string): boolean {
    return IGNORE_PATHS.some((pattern) => pattern.test(relativePath));
}

function isBinary(buffer: Buffer): boolean {
    const checkLen = Math.min(buffer.length, 1024);
    for (let i = 0; i < checkLen; i++) {
        if (buffer[i] === 0) return true;
    }
    return false;
}

export async function extractFilesFromStream(stream: NodeJS.ReadableStream): Promise<GithubFile[]> {
    const files: GithubFile[] = [];
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();

    return new Promise((resolve, reject) => {
        extract.on('entry', (header, entryStream, next) => {
            if (header.type !== 'file') {
                entryStream.resume();
                return next();
            }

            const normalizedPath = normalizeTarPath(header.name);
            if (!normalizedPath || isSensitivePath(normalizedPath) || isIgnoredPath(normalizedPath)) {
                entryStream.resume();
                return next();
            }

            const chunks: Buffer[] = [];
            entryStream.on('data', (chunk) => chunks.push(chunk));
            entryStream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const binary = isBinary(buffer);

                files.push({
                    path: normalizedPath,
                    content: binary ? buffer.toString('base64') : buffer.toString('utf-8'),
                    encoding: binary ? 'base64' : 'utf-8',
                });
                next();
            });
            entryStream.on('error', reject);
        });

        extract.on('finish', () => resolve(files));
        extract.on('error', reject);
        gunzip.on('error', reject);
        stream.on('error', reject);

        stream.pipe(gunzip).pipe(extract);
    });
}
