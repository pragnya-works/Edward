import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/sandbox/command.sandbox.js', () => ({
  executeSandboxCommand: vi.fn(),
  CONTAINER_WORKDIR: '/home/node/app',
}));

import { executeSandboxCommand } from '../../../services/sandbox/command.sandbox.js';
import { createStreamParser } from '../../../lib/llm/parser.js';

import type { ExecResult } from '../../../services/sandbox/types.sandbox.js';

const mockExec = vi.mocked(executeSandboxCommand);

async function* mockStream(text: string): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += 40) {
    yield text.slice(i, i + 40);
  }
}

describe('Agent Loop helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processLLMStream collects commands without executing', async () => {
    const { processLLMStream } = await import('../../../controllers/chat/streamSession.js');
    const parser = createStreamParser();
    const events: unknown[] = [];

    const result = await processLLMStream(
      mockStream('Checking...\n<edward_command command="cat" args=\'["src/App.tsx"]\'>'),
      parser,
      (e: unknown) => events.push(e),
    );

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({ command: 'cat', args: ['src/App.tsx'] });
    expect(result.rawResponse).toContain('Checking');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('executeCommands returns results and handles failures', async () => {
    const { executeCommands } = await import('../../../controllers/chat/streamSession.js');

    mockExec
      .mockResolvedValueOnce({ stdout: 'file content', stderr: '', exitCode: 0 } satisfies ExecResult)
      .mockRejectedValueOnce(new Error('not found'));

    const results = await executeCommands('sb-1', [
      { command: 'cat', args: ['a.ts'] },
      { command: 'cat', args: ['b.ts'] },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.stdout).toBe('file content');
    expect(results[1]!.stderr).toContain('not found');
  });

  it('formatCommandResults produces readable output', async () => {
    const { formatCommandResults } = await import('../../../controllers/chat/streamSession.js');

    const output = formatCommandResults([
      { command: 'cat', args: ['a.ts'], stdout: 'hello', stderr: '' },
      { command: 'ls', args: ['-la'], stdout: 'total 8', stderr: 'warn' },
    ]);

    expect(output).toContain('$ cat a.ts');
    expect(output).toContain('hello');
    expect(output).toContain('STDERR: warn');
    expect(output).not.toContain('STDERR: \n');
  });
});
