import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runValidationPipeline } from '../../../services/validation/pipeline.js';
import { getContainer, execCommand } from '../../../services/sandbox/docker.sandbox.js';

vi.mock('../../../services/sandbox/docker.sandbox.js', () => ({
    getContainer: vi.fn(),
    execCommand: vi.fn(),
    CONTAINER_WORKDIR: '/home/node/edward'
}));

vi.mock('../../../utils/logger.js', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('ValidationPipeline', () => {
    const mockContainerId = 'c123';
    const mockSandboxId = 's456';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getContainer).mockReturnValue({} as any);
    });

    it('should pass if all stages succeed', async () => {
        vi.mocked(execCommand).mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
        vi.mocked(execCommand).mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

        const result = await runValidationPipeline(mockContainerId, mockSandboxId);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should fail and return retry prompt on syntax error', async () => {
        const syntaxError = 'src/App.tsx:5: SyntaxError: Unexpected token';
        vi.mocked(execCommand).mockResolvedValueOnce({ exitCode: 1, stdout: syntaxError, stderr: '' });

        const result = await runValidationPipeline(mockContainerId, mockSandboxId, 'Original user request');

        expect(result.valid).toBe(false);
        expect(result.stage).toBe('syntax');
        expect(result.errors[0]?.message).toContain('Unexpected token');
        expect(result.retryPrompt).toContain('Original user request');
        expect(result.retryPrompt).toContain('syntax errors');
    });

    it('should fail and return retry prompt on type error', async () => {
        vi.mocked(execCommand).mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
        const typeError = "src/main.ts(1,1): error TS2304: Cannot find name 'foo'.";
        vi.mocked(execCommand).mockResolvedValueOnce({ exitCode: 1, stdout: typeError, stderr: '' });

        const result = await runValidationPipeline(mockContainerId, mockSandboxId);

        expect(result.valid).toBe(false);
        expect(result.stage).toBe('types');
        expect(result.errors[0]?.message).toContain('Cannot find name');
        expect(result.errors[0]?.ruleId).toBe('TS2304');
    });

    it('should skip type checking if tsconfig.json is missing', async () => {
        vi.mocked(execCommand).mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
        vi.mocked(execCommand).mockResolvedValueOnce({ exitCode: 0, stdout: 'no-ts', stderr: '' });

        const result = await runValidationPipeline(mockContainerId, mockSandboxId);

        expect(result.valid).toBe(true);
        expect(vi.mocked(execCommand)).toHaveBeenCalledTimes(2);
    });

    it('should handle pipe failures in validation commands', async () => {
        vi.mocked(execCommand).mockRejectedValue(new Error('Pipe failed'));

        const result = await runValidationPipeline(mockContainerId, mockSandboxId);

        expect(result.valid).toBe(false);
        expect(result.errors[0]?.message).toBe('Pipe failed');
    });
});
