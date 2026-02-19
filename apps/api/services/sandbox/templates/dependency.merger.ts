import { getContainer, execCommand, CONTAINER_WORKDIR } from '../docker.sandbox.js';
import { logger } from '../../../utils/logger.js';
import { TIMEOUT_DEPENDENCY_INSTALL_MS } from '../utils.sandbox.js';
import { getSandboxState } from '../state.sandbox.js';
import { getFrameworkContract, validateFrameworkContract, type PackageJson } from './framework.contracts.js';
import { Framework } from '../../planning/schemas.js';

function uniquePackages(packages: string[]): string[] {
    return [...new Set(packages.map((pkg) => pkg.trim()).filter(Boolean))];
}

function hasDependency(packageJson: PackageJson | null, dep: string): boolean {
    if (!packageJson) return false;

    return Boolean(
        packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep],
    );
}

function filterMissingDependencies(
    packages: string[],
    packageJson: PackageJson | null,
    alreadyScheduled = new Set<string>(),
): string[] {
    return packages.filter(
        (dep) => !alreadyScheduled.has(dep) && !hasDependency(packageJson, dep),
    );
}

async function readPackageJson(
    container: ReturnType<typeof getContainer>,
): Promise<PackageJson | null> {
    const packageJsonResult = await execCommand(
        container,
        ['cat', 'package.json'],
        false,
        5000,
        undefined,
        CONTAINER_WORKDIR,
    );

    if (packageJsonResult.exitCode !== 0) {
        return null;
    }

    return JSON.parse(packageJsonResult.stdout) as PackageJson;
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
            packageJsonBeforeInstall = await readPackageJson(container);
        } catch (error) {
            logger.warn(
                { error, sandboxId },
                'Failed to read package.json before dependency install; proceeding with full install',
            );
        }

        const runtimeDepsToInstall = filterMissingDependencies(
            allRuntimeDeps,
            packageJsonBeforeInstall,
        );
        const runtimeInstallSet = new Set(runtimeDepsToInstall);
        const devDepsToInstall = filterMissingDependencies(
            allDevDeps,
            packageJsonBeforeInstall,
            runtimeInstallSet,
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
                ['NEXT_TELEMETRY_DISABLED=1', 'CI=true']
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
                ['NEXT_TELEMETRY_DISABLED=1', 'CI=true']
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
                    ? await readPackageJson(container)
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
