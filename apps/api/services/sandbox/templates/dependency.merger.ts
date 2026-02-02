import { getContainer, execCommand, CONTAINER_WORKDIR, connectToNetwork } from '../docker.sandbox.js';
import { logger } from '../../../utils/logger.js';
import { TIMEOUT_DEPENDENCY_INSTALL_MS, disconnectContainerFromNetwork } from '../utils.sandbox.js';
import { getSandboxState } from '../state.sandbox.js';
import { getFrameworkContract, validateFrameworkContract, type PackageJson } from './framework.contracts.js';
import { Framework } from '../../planning/schemas.js';

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
        
        const allRuntimeDeps = [...new Set([
            ...contract.runtimeDependencies,
            ...userPackages.filter(pkg => pkg.trim())
        ])];
        const allDevDeps = [...new Set(contract.developmentDependencies)];

        if (allRuntimeDeps.length === 0 && allDevDeps.length === 0) {
            return { success: true };
        }

        await connectToNetwork(containerId);

        if (allRuntimeDeps.length > 0) {
            const depsResult = await execCommand(
                container,
                ['pnpm', 'add', ...allRuntimeDeps],
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

                await disconnectContainerFromNetwork(containerId, sandboxId);

                return {
                    success: false,
                    error: `Failed to install runtime dependencies: ${depsResult.stderr || depsResult.stdout}`.slice(0, 300)
                };
            }
            
        }

        if (allDevDeps.length > 0) {
            
            const devResult = await execCommand(
                container,
                ['pnpm', 'add', '-D', ...allDevDeps],
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

                await disconnectContainerFromNetwork(containerId, sandboxId);

                return {
                    success: false,
                    error: `Failed to install dev dependencies: ${devResult.stderr || devResult.stdout}`.slice(0, 300)
                };
            }
            
        }

        await disconnectContainerFromNetwork(containerId, sandboxId);

        try {
            const packageJsonResult = await execCommand(
                container,
                ['cat', 'package.json'],
                false,
                5000,
                undefined,
                CONTAINER_WORKDIR
            );
            
            if (packageJsonResult.exitCode === 0) {
                const packageJson = JSON.parse(packageJsonResult.stdout) as PackageJson;
                const validation = validateFrameworkContract(framework, packageJson);
                
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
        await disconnectContainerFromNetwork(containerId, sandboxId).catch(() => { });
        logger.error({ error, sandboxId }, 'Dependency merger error');
        return {
            success: false,
            error: `Dependency installation failed: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}