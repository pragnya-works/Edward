import {
    getContainer,
    execCommand,
    CONTAINER_WORKDIR,
    readFileContent,
} from '../sandbox-runtime.service.js';
import { logger } from '../../../utils/logger.js';
import { TIMEOUT_DEPENDENCY_INSTALL_MS } from '../utils.service.js';
import { getSandboxState } from '../state.service.js';
import { getFrameworkContract, validateFrameworkContract, type PackageJson } from './framework.contracts.js';
import { Framework } from '../../planning/schemas.js';
import {
    normalizePackageSpecs,
    toPackageName,
} from '../../packages/packageSpec.js';

function isStringRecord(value: unknown): value is Record<string, string> {
    return Boolean(
        value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.values(value).every((entry) => typeof entry === 'string'),
    );
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function parsePackageJsonContent(
    content: string,
    sandboxId: string,
): PackageJson | null {
    const raw = JSON.parse(content) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        logger.warn({ sandboxId }, 'Ignoring malformed package.json content');
        return null;
    }

    const parsed = raw as Record<string, unknown>;

    if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string') {
        logger.warn({ sandboxId }, 'Ignoring malformed package.json metadata');
        return null;
    }

    if (parsed.scripts !== undefined && !isStringRecord(parsed.scripts)) {
        logger.warn({ sandboxId }, 'Ignoring malformed package.json scripts');
        return null;
    }

    if (parsed.dependencies !== undefined && !isStringRecord(parsed.dependencies)) {
        logger.warn({ sandboxId }, 'Ignoring malformed package.json dependencies');
        return null;
    }

    if (
        parsed.devDependencies !== undefined &&
        !isStringRecord(parsed.devDependencies)
    ) {
        logger.warn({ sandboxId }, 'Ignoring malformed package.json devDependencies');
        return null;
    }

    return {
        name: parsed.name,
        version: parsed.version,
        private: typeof parsed.private === 'boolean' ? parsed.private : undefined,
        type: isOptionalString(parsed.type) ? parsed.type : undefined,
        scripts: parsed.scripts,
        dependencies: parsed.dependencies,
        devDependencies: parsed.devDependencies,
    };
}

function uniquePackages(packages: string[]): string[] {
    return normalizePackageSpecs(packages);
}

function hasRuntimeDependency(
    packageJson: PackageJson | null,
    depName: string,
): boolean {
    if (!packageJson) return false;

    return Boolean(packageJson.dependencies?.[depName]);
}

function hasAnyDependency(packageJson: PackageJson | null, depName: string): boolean {
    if (!packageJson) return false;

    return Boolean(packageJson.dependencies?.[depName] || packageJson.devDependencies?.[depName]);
}

function filterMissingDependencies(
    packages: string[],
    packageJson: PackageJson | null,
    alreadyScheduled = new Set<string>(),
    mode: 'runtime' | 'any' = 'any',
): string[] {
    const dependencyExists = mode === 'runtime' ? hasRuntimeDependency : hasAnyDependency;

    return packages.filter((depSpec) => {
        const depName = toPackageName(depSpec);
        if (!depName) return false;

        return !alreadyScheduled.has(depName) && !dependencyExists(packageJson, depName);
    });
}

async function readPackageJson(
    container: ReturnType<typeof getContainer>,
    sandboxId: string,
): Promise<PackageJson | null> {
    const packageJsonContent = await readFileContent(
        container,
        'package.json',
        CONTAINER_WORKDIR,
    );

    if (!packageJsonContent) {
        return null;
    }

    return parsePackageJsonContent(packageJsonContent, sandboxId);
}

export async function mergeAndInstallDependencies(
    containerId: string,
    userPackages: string[],
    sandboxId: string
): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
    const warnings: string[] = [];
    
    try {
        const container = getContainer(containerId);
        const state = await getSandboxState(sandboxId);
        const framework = (state?.scaffoldedFramework || 'vanilla') as Framework;
        
        const contract = getFrameworkContract(framework);
        
        const allRuntimeDeps = uniquePackages([
            ...contract.runtimeDependencies,
            ...userPackages
        ]);
        const allDevDeps = uniquePackages(contract.developmentDependencies);

        if (allRuntimeDeps.length === 0 && allDevDeps.length === 0) {
            return { success: true };
        }

        let packageJsonBeforeInstall: PackageJson | null = null;
        try {
            packageJsonBeforeInstall = await readPackageJson(container, sandboxId);
        } catch (error) {
            logger.warn(
                { error, sandboxId },
                'Failed to read package.json before dependency install; proceeding with full install',
            );
        }

        const runtimeDepsToInstall = filterMissingDependencies(
            allRuntimeDeps,
            packageJsonBeforeInstall,
            new Set<string>(),
            'runtime',
        );
        const runtimeInstallSet = new Set(
            runtimeDepsToInstall
                .map((dep) => toPackageName(dep))
                .filter((name): name is string => Boolean(name)),
        );
        const devDepsToInstall = filterMissingDependencies(
            allDevDeps,
            packageJsonBeforeInstall,
            runtimeInstallSet,
            'any',
        );

        logger.debug(
            {
                sandboxId,
                framework,
                requestedRuntime: allRuntimeDeps.length,
                requestedDev: allDevDeps.length,
                runtimeToInstall: runtimeDepsToInstall.length,
                devToInstall: devDepsToInstall.length,
            },
            'Dependency install plan computed',
        );

        if (runtimeDepsToInstall.length > 0) {
            const depsResult = await execCommand(
                container,
                ['pnpm', 'add', ...runtimeDepsToInstall],
                false,
                TIMEOUT_DEPENDENCY_INSTALL_MS,
                undefined,
                CONTAINER_WORKDIR,
                [
                    'NEXT_TELEMETRY_DISABLED=1',
                    'CI=true',
                    'NPM_CONFIG_ENGINE_STRICT=true',
                ]
            );

            if (depsResult.exitCode !== 0) {
                logger.error({
                    sandboxId,
                    exitCode: depsResult.exitCode,
                    stdout: depsResult.stdout.slice(0, 500),
                    stderr: depsResult.stderr.slice(0, 500)
                }, 'Runtime dependency installation failed');

                return {
                    success: false,
                    error: `Failed to install runtime dependencies: ${depsResult.stderr || depsResult.stdout}`
                };
            }
            
        }

        if (devDepsToInstall.length > 0) {
            
            const devResult = await execCommand(
                container,
                ['pnpm', 'add', '-D', ...devDepsToInstall],
                false,
                TIMEOUT_DEPENDENCY_INSTALL_MS,
                undefined,
                CONTAINER_WORKDIR,
                [
                    'NEXT_TELEMETRY_DISABLED=1',
                    'CI=true',
                    'NPM_CONFIG_ENGINE_STRICT=true',
                ]
            );

            if (devResult.exitCode !== 0) {
                logger.error({
                    sandboxId,
                    exitCode: devResult.exitCode,
                    stdout: devResult.stdout.slice(0, 500),
                    stderr: devResult.stderr.slice(0, 500)
                }, 'Development dependency installation failed');

                return {
                    success: false,
                    error: `Failed to install dev dependencies: ${devResult.stderr || devResult.stdout}`
                };
            }
            
        }

        try {
            const packageJsonForValidation =
                runtimeDepsToInstall.length > 0 || devDepsToInstall.length > 0
                    ? await readPackageJson(container, sandboxId)
                    : packageJsonBeforeInstall;
            
            if (packageJsonForValidation) {
                const validation = validateFrameworkContract(
                    framework,
                    packageJsonForValidation,
                );

                if (!validation.valid) {
                    logger.warn({
                        sandboxId,
                        framework,
                        validationErrors: validation.errors
                    }, 'Framework contract validation failed');
                    
                    warnings.push(...validation.errors);
                    
                    return {
                        success: true,
                        warnings: [
                            'Dependencies installed but validation warnings exist:',
                            ...validation.errors
                        ]
                    };
                }
            } else {
                warnings.push('package.json not found; skipped dependency contract validation');
            }
        } catch (validationError) {
            logger.warn({ 
                error: validationError, 
                sandboxId 
            }, 'Could not validate framework contract (non-fatal)');
            warnings.push('Contract validation skipped due to error');
        }
        
        return { 
            success: true,
            warnings: warnings.length > 0 ? warnings : undefined
        };
        
    } catch (error) {
        logger.error({ error, sandboxId }, 'Dependency merger error');
        return {
            success: false,
            error: `Dependency installation failed: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
