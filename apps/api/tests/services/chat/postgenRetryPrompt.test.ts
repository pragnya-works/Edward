import { describe, expect, it } from 'vitest';
import { ChatAction } from '../../../services/planning/schemas.js';
import { buildPostgenRetryPrompt } from '../../../controllers/chat/session/orchestrator/postgenRetryPrompt.js';

describe('buildPostgenRetryPrompt', () => {
  it('builds generate-mode retry prompt with complete regeneration instruction', () => {
    const prompt = buildPostgenRetryPrompt({
      originalUserRequest: 'Build a Next.js landing page',
      mode: ChatAction.GENERATE,
      violations: [
        {
          type: 'missing-entry-point',
          severity: 'error',
          message: 'Missing required entry point: src/app/layout.tsx',
          file: 'src/app/layout.tsx',
        },
      ],
    });

    expect(prompt).toContain('Original user request: Build a Next.js landing page');
    expect(prompt).toContain('Missing required entry point: src/app/layout.tsx');
    expect(prompt).toContain('Regenerate with ALL features fully implemented');
  });

  it('builds edit/fix retry prompt with targeted fix instruction', () => {
    const prompt = buildPostgenRetryPrompt({
      originalUserRequest: 'Fix the failing build',
      mode: ChatAction.FIX,
      violations: [
        {
          type: 'import-placement',
          severity: 'error',
          message: 'Import appears after executable code',
          file: 'src/main.tsx',
        },
      ],
    });

    expect(prompt).toContain('Apply only the minimum targeted fixes required');
    expect(prompt).toContain('Import appears after executable code');
    expect(prompt).toContain('<edward_sandbox>');
  });
});
