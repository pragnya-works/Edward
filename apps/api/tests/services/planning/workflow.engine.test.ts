import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nanoid } from 'nanoid';
import { redis } from '../../../lib/redis.js';
import { 
    createWorkflow, 
    advanceWorkflow, 
    getWorkflowStatus
} from '../../../services/planning/workflow.engine.js';
import { WorkflowState } from '../../../services/planning/schemas.js';
import * as buildService from '../../../services/sandbox/builder/unified.build.js';

vi.mock('../../../lib/redis.js', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn()
    }
}));

vi.mock('nanoid', () => ({
    nanoid: vi.fn()
}));

vi.mock('../../../utils/logger.js', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

vi.mock('../../../services/registry/package.registry.js', () => ({
    resolvePackages: vi.fn().mockResolvedValue({ valid: [], invalid: [], conflicts: [] })
}));

vi.mock('../../../services/validation/pipeline.js', () => ({
    runValidationPipeline: vi.fn().mockResolvedValue({ valid: true, errors: [] })
}));

vi.mock('../../../services/sandbox/lifecycle.sandbox.js', () => ({
    provisionSandbox: vi.fn().mockResolvedValue('mock-sandbox-id'),
    cleanupSandbox: vi.fn().mockResolvedValue(undefined),
    getActiveSandbox: vi.fn().mockResolvedValue(null)
}));

vi.mock('../../../services/sandbox/state.sandbox.js', () => ({
    getSandboxState: vi.fn().mockResolvedValue({ containerId: 'mock-container-id' })
}));

vi.mock('../../../services/sandbox/builder/unified.build.js', () => ({
    buildAndUploadUnified: vi.fn().mockResolvedValue({ 
        success: true, 
        previewUrl: 'http://preview.test',
        buildDirectory: 'dist',
        previewUploaded: true
    })
}));

vi.mock('../../../services/planning/analyzers/intent.analyzer.js', () => ({
    analyzeIntent: vi.fn().mockReturnValue({
        type: 'landing',
        complexity: 'simple',
        features: ['test'],
        suggestedFramework: 'vite-react',
        reasoning: 'test'
    })
}));

describe('WorkflowEngine', () => {
    const mockUserId = 'user-1';
    const mockChatId = 'chat-1';
    const mockWorkflowId = 'workflow-123';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(nanoid).mockReturnValue(mockWorkflowId);
    });

    describe('createWorkflow', () => {
        it('should create and persist a new workflow', async () => {
            const workflow = await createWorkflow(mockUserId, mockChatId);

            expect(workflow.id).toBe(mockWorkflowId);
            expect(workflow.userId).toBe(mockUserId);
            expect(workflow.status).toBe('pending');
            expect(redis.set).toHaveBeenCalled();
        });
    });

    describe('advanceWorkflow', () => {
        it('should execute ANALYZE phase and transition to RESOLVE_PACKAGES', async () => {
            const initialState: WorkflowState = {
                id: mockWorkflowId,
                userId: mockUserId,
                chatId: mockChatId,
                status: 'pending',
                currentStep: 'ANALYZE',
                context: { errors: [] },
                history: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const result = await advanceWorkflow(initialState, 'Create a landing page');

            expect(result.success).toBe(true);
            expect(result.step).toBe('ANALYZE');
            expect(initialState.currentStep).toBe('RESOLVE_PACKAGES');
        });

        it('should use locking to prevent parallel execution', async () => {
            const state: WorkflowState = {
                id: mockWorkflowId,
                userId: mockUserId,
                chatId: mockChatId,
                currentStep: 'RESOLVE_PACKAGES',
                status: 'pending',
                context: { errors: [] },
                history: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            vi.mocked(redis.set).mockResolvedValue(null);

            const result = await advanceWorkflow(state, ['react']);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Resolution already in progress');
        });

        it('should handle failures and transition to RECOVER', async () => {
            const state: WorkflowState = {
                id: mockWorkflowId,
                userId: mockUserId,
                chatId: mockChatId,
                currentStep: 'BUILD',
                status: 'running',
                sandboxId: 'sb-1',
                context: { errors: [] },
                history: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            vi.mocked(redis.set)
                .mockResolvedValue('OK');

            vi.mocked(buildService.buildAndUploadUnified).mockResolvedValue({ 
                success: false, 
                error: 'Build timeout',
                buildDirectory: null,
                previewUploaded: false,
                previewUrl: null
            });

            const result = await advanceWorkflow(state);

            expect(result.success).toBe(false);
            expect(state.currentStep).toBe('RECOVER');
        });
    });

    describe('persistence', () => {
        it('should retrieve workflow status from redis', async () => {
            const mockState: WorkflowState = { 
                id: mockWorkflowId, 
                userId: mockUserId,
                chatId: mockChatId,
                status: 'completed',
                currentStep: 'DEPLOY',
                context: { errors: [] },
                history: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(mockState));

            const status = await getWorkflowStatus(mockWorkflowId);

            expect(status?.id).toEqual(mockState.id);
            expect(status?.status).toEqual(mockState.status);
        });

        it('should return null if workflow not found', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            const status = await getWorkflowStatus('invalid');
            expect(status).toBeNull();
        });
    });
});
