import { nanoid } from 'nanoid';
import { redis } from '../../lib/redis.js';
import { logger } from '../../utils/logger.js';
import {
    WorkflowState,
    WorkflowStateSchema,
    WorkflowStepType,
    WorkflowContext,
    StepResult,
    PhaseConfig,
    Framework,
    PackageInfo,
    IntentAnalysis
} from './schemas.js';
import { analyzeIntent } from './analyzers/intent.analyzer.js';
import { resolvePackages } from '../registry/package.registry.js';
import { runValidationPipeline } from '../validation/pipeline.js';
import { provisionSandbox, cleanupSandbox, getActiveSandbox } from '../sandbox/lifecycle.sandbox.js';
import { getSandboxState } from '../sandbox/state.sandbox.js';
import { buildAndUploadUnified } from '../sandbox/builder/unified.build.js';
import { getDecryptedApiKey } from '../apiKey.service.js';
import { mergeAndInstallDependencies } from '../sandbox/templates/dependency.merger.js';

const WORKFLOW_PREFIX = 'edward:workflow:';
const LOCK_PREFIX = 'edward:lock:';
const WORKFLOW_TTL_SECONDS = 3600;
const LOCK_TTL_SECONDS = 300;

const PHASE_CONFIGS: PhaseConfig[] = [
    { name: 'ANALYZE', executor: 'llm', maxRetries: 2, timeoutMs: 30000 },
    { name: 'RESOLVE_PACKAGES', executor: 'worker', maxRetries: 3, timeoutMs: 60000 },
    { name: 'INSTALL_PACKAGES', executor: 'worker', maxRetries: 3, timeoutMs: 120000 },
    { name: 'GENERATE', executor: 'hybrid', maxRetries: 2, timeoutMs: 120000 },
    { name: 'BUILD', executor: 'worker', maxRetries: 3, timeoutMs: 180000 },
    { name: 'DEPLOY', executor: 'worker', maxRetries: 2, timeoutMs: 60000 },
    { name: 'RECOVER', executor: 'llm', maxRetries: 2, timeoutMs: 60000 }
];

async function getWorkflow(id: string): Promise<WorkflowState | null> {
    const data = await redis.get(`${WORKFLOW_PREFIX}${id}`);
    if (!data) return null;

    try {
        const parsed = WorkflowStateSchema.safeParse(JSON.parse(data));
        if (!parsed.success) {
            logger.warn({ workflowId: id, parseErrors: parsed.error.errors },
                'Invalid workflow schema, deleting corrupted data');
            await redis.del(`${WORKFLOW_PREFIX}${id}`).catch(() => { });
            return null;
        }
        return parsed.data;
    } catch (error) {
        logger.error({ error, workflowId: id },
            'Malformed JSON in Redis, deleting corrupted data');
        await redis.del(`${WORKFLOW_PREFIX}${id}`).catch(() => { });
        return null;
    }
}

async function saveWorkflow(state: WorkflowState): Promise<void> {
    state.updatedAt = Date.now();
    await redis.set(
        `${WORKFLOW_PREFIX}${state.id}`,
        JSON.stringify(state),
        'EX',
        WORKFLOW_TTL_SECONDS
    );
}

async function deleteWorkflow(id: string): Promise<void> {
    await redis.del(`${WORKFLOW_PREFIX}${id}`);
}

async function acquireLock(lockKey: string): Promise<string | null> {
    const lockId = nanoid();
    const acquired = await redis.set(`${LOCK_PREFIX}${lockKey}`, lockId, 'EX', LOCK_TTL_SECONDS, 'NX');
    return acquired ? lockId : null;
}

async function releaseLock(lockKey: string, lockId: string): Promise<void> {
    const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
    `;

    await redis.eval(
        luaScript,
        1,
        `${LOCK_PREFIX}${lockKey}`,
        lockId
    );
}

export async function createWorkflow(
    userId: string,
    chatId: string,
    initialContext: Partial<WorkflowContext> = {}
): Promise<WorkflowState> {
    const state: WorkflowState = {
        id: nanoid(16),
        userId,
        chatId,
        status: 'pending',
        currentStep: 'ANALYZE',
        context: { errors: [], ...initialContext },
        history: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    await saveWorkflow(state);
    logger.info({ workflowId: state.id, userId, chatId, intent: state.context.intent?.type }, 'Workflow created');
    return state;
}

export async function executePackageResolution(
    state: WorkflowState,
    packages: string[]
): Promise<StepResult> {
    const startTime = Date.now();

    try {
        const { valid, invalid, conflicts } = await resolvePackages(packages);

        if (invalid.length > 0) {
            const errorMsg = `Invalid packages: ${invalid.map(p => `${p.name} (${p.error})`).join(', ')}`;
            state.context.errors.push(errorMsg);
            return {
                step: 'RESOLVE_PACKAGES',
                success: false,
                error: errorMsg,
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
        }

        if (conflicts.length > 0) {
            logger.warn({ conflicts }, 'Peer dependency conflicts detected');
        }

        state.context.resolvedPackages = valid.map(v => ({
            name: v.name,
            version: v.version || 'latest',
            valid: v.valid,
            error: v.error,
            peerDependencies: v.peerDependencies
        })) as PackageInfo[];

        return {
            step: 'RESOLVE_PACKAGES',
            success: true,
            data: { resolved: valid.length, conflicts },
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    } catch (error) {
        return {
            step: 'RESOLVE_PACKAGES',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    }
}

export async function ensureSandbox(
    state: WorkflowState,
    framework?: Framework
): Promise<string> {
    let sandboxId = await getActiveSandbox(state.chatId);

    if (!sandboxId) {
        sandboxId = await provisionSandbox(state.userId, state.chatId, framework || state.context.framework, false);
    }

    state.sandboxId = sandboxId;
    await saveWorkflow(state);
    logger.info({ workflowId: state.id, sandboxId }, 'Sandbox ensured');
    return sandboxId;
}

export async function executeInstallPhase(state: WorkflowState): Promise<StepResult> {
    const startTime = Date.now();

    if (!state.sandboxId) {
        return {
            step: 'INSTALL_PACKAGES',
            success: false,
            error: 'No sandbox available for installation',
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    }

    try {
        const sandbox = await getSandboxState(state.sandboxId);
        if (!sandbox) {
            return {
                step: 'INSTALL_PACKAGES',
                success: false,
                error: 'Sandbox state not found',
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
        }

        const packageNames = (state.context.resolvedPackages || [])
            .filter(pkg => pkg.valid)
            .map(pkg => pkg.name);

        logger.info({ 
            workflowId: state.id, 
            sandboxId: state.sandboxId, 
            packageCount: packageNames.length 
        }, 'Installing packages in container');

        const result = await mergeAndInstallDependencies(
            sandbox.containerId,
            packageNames,
            state.sandboxId
        );

        if (!result.success) {
            return {
                step: 'INSTALL_PACKAGES',
                success: false,
                error: result.error,
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
        }

        logger.info({ 
            workflowId: state.id, 
            sandboxId: state.sandboxId,
            warnings: result.warnings 
        }, 'Package installation completed');

        return {
            step: 'INSTALL_PACKAGES',
            success: true,
            data: { installed: packageNames.length, warnings: result.warnings },
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    } catch (error) {
        return {
            step: 'INSTALL_PACKAGES',
            success: false,
            error: error instanceof Error ? error.message : 'Installation failed',
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    }
}

export async function executeBuildPhase(state: WorkflowState): Promise<StepResult> {
    const startTime = Date.now();

    if (!state.sandboxId) {
        return {
            step: 'BUILD',
            success: false,
            error: 'No sandbox available for build',
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    }

    try {
        const sandbox = await getSandboxState(state.sandboxId);
        if (!sandbox) {
            return {
                step: 'BUILD',
                success: false,
                error: 'Sandbox state not found',
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
        }

        const validationResult = await runValidationPipeline(
            sandbox.containerId,
            state.sandboxId
        );

        if (!validationResult.valid) {
            state.context.errors.push(...validationResult.errors.map(e => e.message));
            return {
                step: 'BUILD',
                success: false,
                error: `Validation failed at ${validationResult.stage}`,
                data: { errors: validationResult.errors, retryPrompt: validationResult.retryPrompt },
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
        }

        const lockId = await acquireLock(`build:${state.sandboxId}`);
        if (!lockId) {
            return {
                step: 'BUILD',
                success: false,
                error: 'Build already in progress',
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
        }

        try {
            const buildResult = await buildAndUploadUnified(state.sandboxId);

            if (!buildResult.success) {
                return {
                    step: 'BUILD',
                    success: false,
                    error: buildResult.error,
                    durationMs: Date.now() - startTime,
                    retryCount: 0
                };
            }

            state.context.buildDirectory = buildResult.buildDirectory || undefined;
            state.context.previewUrl = buildResult.previewUrl || undefined;

            return {
                step: 'BUILD',
                success: true,
                data: { previewUrl: buildResult.previewUrl },
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
        } finally {
            await releaseLock(`build:${state.sandboxId}`, lockId);
        }
    } catch (error) {
        return {
            step: 'BUILD',
            success: false,
            error: error instanceof Error ? error.message : 'Build failed',
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    }
}

export async function executeAnalyzePhase(state: WorkflowState, userRequest: string): Promise<StepResult> {
    const startTime = Date.now();
    try {
        const apiKey = await getDecryptedApiKey(state.userId);
        const analysis = await analyzeIntent(userRequest, apiKey);
        state.context.intent = analysis as IntentAnalysis;
        state.context.framework = (analysis as IntentAnalysis).suggestedFramework;

        return {
            step: 'ANALYZE',
            success: true,
            data: analysis,
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    } catch (error) {
        return {
            step: 'ANALYZE',
            success: false,
            error: error instanceof Error ? error.message : 'Analysis failed',
            durationMs: Date.now() - startTime,
            retryCount: 0
        };
    }
}

async function executeStep(
    state: WorkflowState,
    step: WorkflowStepType,
    input?: unknown
): Promise<StepResult> {
    const config = PHASE_CONFIGS.find(p => p.name === step);
    if (!config) {
        return { step, success: false, error: 'Unknown step', durationMs: 0, retryCount: 0 };
    }

    const startTime = Date.now();

    switch (step) {
        case 'RESOLVE_PACKAGES': {
            const lockId = await acquireLock(`resolve:${state.id}`);
            if (!lockId) return { step, success: false, error: 'Resolution already in progress', durationMs: 0, retryCount: 0 };
            try {
                return await executePackageResolution(state, input as string[] || []);
            } finally {
                await releaseLock(`resolve:${state.id}`, lockId);
            }
        }

        case 'ANALYZE':
            return executeAnalyzePhase(state, input as string || '');

        case 'INSTALL_PACKAGES':
            return executeInstallPhase(state);

        case 'BUILD':
            return executeBuildPhase(state);

        case 'DEPLOY':
            return {
                step: 'DEPLOY',
                success: !!state.context.previewUrl,
                data: { previewUrl: state.context.previewUrl },
                durationMs: Date.now() - startTime,
                retryCount: 0
            };

        default:
            return {
                step,
                success: true,
                data: { message: `Step ${step} executed` },
                durationMs: Date.now() - startTime,
                retryCount: 0
            };
    }
}

async function withRetry(
    fn: () => Promise<StepResult>,
    maxRetries: number,
    step: WorkflowStepType
): Promise<StepResult> {
    let result: StepResult = { step: 'ANALYZE', success: false, error: 'No attempts made', durationMs: 0, retryCount: 0 };
    let retryCount = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        result = await fn();
        result.retryCount = retryCount;

        if (result.success) return result;

        retryCount++;
        if (attempt < maxRetries) {
            const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await new Promise(resolve => setTimeout(resolve, backoff));
            logger.info({ step, attempt, maxRetries }, 'Retrying step');
        }
    }

    return result;
}

export async function advanceWorkflow(
    state: WorkflowState,
    stepInput?: unknown
): Promise<StepResult> {
    if (state.status === 'completed' || state.status === 'failed') {
        return {
            step: state.currentStep,
            success: false,
            error: `Workflow already ${state.status}`,
            durationMs: 0,
            retryCount: 0
        };
    }

    state.status = 'running';
    await saveWorkflow(state);

    const config = PHASE_CONFIGS.find(p => p.name === state.currentStep);
    const maxRetries = config?.maxRetries || 3;

    const result = await withRetry(
        () => executeStep(state, state.currentStep, stepInput),
        maxRetries,
        state.currentStep
    );

    state.history.push(result);

    if (!result.success) {
        const isRecoverable = state.currentStep !== 'RECOVER' && result.retryCount < maxRetries;
        if (isRecoverable) {
            state.currentStep = 'RECOVER';
        } else {
            state.status = 'failed';
        }
    } else {
        const stepOrder: WorkflowStepType[] = ['ANALYZE', 'RESOLVE_PACKAGES', 'INSTALL_PACKAGES', 'GENERATE', 'BUILD', 'DEPLOY'];
        let currentIndex = stepOrder.indexOf(state.currentStep);

        if (currentIndex === -1 && state.currentStep === 'RECOVER') {
            const lastSuccess = state.history.findLast(h => h.success && h.step !== 'RECOVER');
            currentIndex = lastSuccess ? stepOrder.indexOf(lastSuccess.step) : -1;
        }

        if (currentIndex === stepOrder.length - 1 || state.currentStep === 'DEPLOY') {
            state.status = 'completed';
        } else if (currentIndex >= 0 && currentIndex + 1 < stepOrder.length) {
            state.currentStep = stepOrder[currentIndex + 1]!;
        } else if (currentIndex === -1 && stepOrder.length > 0) {
            state.currentStep = stepOrder[0]!;
        } else {
            state.status = 'failed';
            logger.error({
                workflowId: state.id,
                currentStep: state.currentStep,
                currentIndex
            }, 'Workflow in unexpected state during advancement');
        }
    }

    await saveWorkflow(state);
    const logMethod = result.success ? 'info' : 'error';
    logger[logMethod]({
        workflowId: state.id,
        step: result.step,
        success: result.success,
        error: result.success ? undefined : result.error,
        nextStep: state.currentStep,
        status: state.status
    }, `Workflow step ${result.success ? 'completed' : 'failed'}`);

    return result;
}

export async function getWorkflowStatus(id: string): Promise<WorkflowState | null> {
    return getWorkflow(id);
}

export async function cancelWorkflow(id: string): Promise<boolean> {
    const state = await getWorkflow(id);
    if (!state) return false;

    if (state.sandboxId) {
        await cleanupSandbox(state.sandboxId).catch(err =>
            logger.error({ err, workflowId: id }, 'Failed to cleanup sandbox on cancel')
        );
    }

    await deleteWorkflow(id);
    logger.info({ workflowId: id }, 'Workflow cancelled');
    return true;
}
