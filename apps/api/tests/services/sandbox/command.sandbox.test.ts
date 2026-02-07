import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSandboxCommand } from '../../../services/sandbox/command.sandbox.js';
import * as stateSandbox from '../../../services/sandbox/state.sandbox.js';
import * as dockerSandbox from '../../../services/sandbox/docker.sandbox.js';

import type { SandboxInstance } from '../../../services/sandbox/types.sandbox.js';

vi.mock('../../../services/sandbox/state.sandbox.js');
vi.mock('../../../services/sandbox/docker.sandbox.js');
vi.mock('../../../utils/logger.js', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));

describe('executeSandboxCommand', () => {
    const sandboxId = 'test-sandbox';
    const containerId = 'test-container';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(stateSandbox.getSandboxState).mockResolvedValue({
            id: sandboxId,
            containerId,
            userId: 'user-1',
            chatId: 'chat-1',
            expiresAt: Date.now() + 3600_000,
        } satisfies Omit<SandboxInstance, 'scaffoldedFramework' | 'requestedPackages'> as SandboxInstance);
        
        vi.mocked(dockerSandbox.getContainer).mockReturnValue({
            id: containerId,
            exec: vi.fn(),
        } as unknown as ReturnType<typeof dockerSandbox.getContainer>);
    });

    it('should allow whitelisted commands', async () => {
        vi.mocked(dockerSandbox.execCommand).mockResolvedValue({
            exitCode: 0,
            stdout: 'file1.ts\nfile2.ts',
            stderr: '',
        });

        const result = await executeSandboxCommand(sandboxId, { command: 'ls', args: ['-la'] });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('file1.ts');
        expect(dockerSandbox.execCommand).toHaveBeenCalledWith(
            expect.anything(),
            ['ls', '-la'],
            false,
            expect.any(Number),
            'node',
            expect.any(String)
        );
    });

    it('should throw error for non-whitelisted commands', async () => {
        await expect(executeSandboxCommand(sandboxId, { command: 'rmdoor', args: ['-rf', '/'] }))
            .rejects.toThrow(/is not allowed/);
    });

    it('should block dangerous patterns (root deletion)', async () => {
        await expect(executeSandboxCommand(sandboxId, { command: 'rm', args: ['-rf', '/'] }))
            .rejects.toThrow(/disallowed patterns/);
    });

    it('should block paths outside allowed directory', async () => {
        await expect(executeSandboxCommand(sandboxId, { command: 'ls', args: ['../../etc'] }))
            .rejects.toThrow(/Path outside allowed directory/);
    });

    it('should block absolute paths outside workspace', async () => {
        await expect(executeSandboxCommand(sandboxId, { command: 'cat', args: ['/etc/passwd'] }))
            .rejects.toThrow(/Path outside allowed directory/);
    });

    it('should allow paths within home/node', async () => {
        vi.mocked(dockerSandbox.execCommand).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
        
        await expect(executeSandboxCommand(sandboxId, { command: 'ls', args: ['/home/node/edward'] }))
            .resolves.toBeDefined();
    });
});
