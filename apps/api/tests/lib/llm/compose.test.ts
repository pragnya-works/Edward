import { describe, expect, it, vi } from 'vitest';
import { MAX_EMITTED_FILE_LINES } from '../../../lib/llm/prompts/sections.js';

vi.mock('../../../services/sandbox/templates/template.registry.js', () => ({
  getTemplateConfig: vi.fn((framework: string) => {
    if (framework === 'vanilla') {
      return { protectedFiles: [] };
    }

    return {
      protectedFiles: [
        'package.json',
        'tsconfig.json',
        framework === 'nextjs' ? 'src/app/globals.css' : 'src/index.css',
      ],
    };
  }),
}));

describe('composePrompt', () => {
  it('keeps default nextjs generate prompt under budget', async () => {
    const { composePrompt, estimatePromptTokensApprox } = await import(
      '../../../lib/llm/compose.js'
    );

    const prompt = composePrompt({
      framework: 'nextjs',
      complexity: 'simple',
      mode: 'generate',
    });

    expect(prompt).toContain('<scope_restrictions>');
    expect(prompt).toContain('<execution_ownership>');
    expect(prompt).toContain('<edward_sandbox_format>');
    expect(prompt).toContain('<skill:nextjs-compact>');
    expect(prompt).toContain('[POSTGEN OUTPUT CONTRACT - HARD REQUIREMENT]');
    expect(prompt).toContain('Required entry files:');
    expect(prompt).toContain('- src/app/layout.tsx');
    expect(prompt).toContain('Required project files in generate mode:');
    expect(prompt).toContain('- README.md');
    expect(prompt).toContain(
      `Hard limit: each emitted <file> must be at most ${MAX_EMITTED_FILE_LINES} total lines.`,
    );
    expect(prompt).toContain(
      "If a requested change would push one file beyond that limit, split the work into smaller components/hooks/utils/styles instead of overloading one file.",
    );
    expect(prompt).not.toContain('<skill:react-performance>');

    const approxTokens = estimatePromptTokensApprox(prompt);
    expect(approxTokens).toBeLessThan(5000);
  });

  it('adds performance and code quality packs for fix mode', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'nextjs',
      complexity: 'moderate',
      mode: 'fix',
      userRequest: 'Fix slow render and improve performance',
      intentFeatures: ['optimization', 'performance'],
    });

    expect(prompt).toContain('You are in FIX MODE.');
    expect(prompt).toContain('<skill:react-performance>');
    expect(prompt).toContain('<skill:code-quality-compact>');
  });

  it('adds strict compliance pack when strict profile is selected', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'nextjs',
      complexity: 'moderate',
      mode: 'fix',
      profile: 'strict',
      userRequest: 'Fix runtime errors and produce valid sandbox output',
    });

    expect(prompt).toContain('<skill:strict-compliance>');
    expect(prompt).toContain(
      `Keep each emitted file under ${MAX_EMITTED_FILE_LINES} lines; if a file is getting large, split it into smaller modules instead of overcoding one file.`,
    );
  });

  it('adds expanded design pack for design-heavy generation requests', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'vite-react',
      complexity: 'simple',
      mode: 'generate',
      intentType: 'landing',
      userRequest: 'Create a visually striking landing page with strong branding',
    });

    expect(prompt).toContain('<skill:ui-design-expanded>');
    expect(prompt).toContain('<skill:vite-compact>');
  });

  it('uses vanilla framework pack without react performance for simple vanilla generation', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'vanilla',
      complexity: 'simple',
      mode: 'generate',
      userRequest: 'Build a simple static page',
    });

    expect(prompt).toContain('<skill:vanilla-compact>');
    expect(prompt).not.toContain('<skill:react-performance>');
  });

  it('adds edit mode prompt and excludes fix mode prompt for edit action', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'nextjs',
      complexity: 'simple',
      mode: 'edit',
      userRequest: 'Update the hero section copy',
    });

    expect(prompt).toContain('You are in EDIT MODE.');
    expect(prompt).not.toContain('You are in FIX MODE.');
    expect(prompt).not.toContain('Required project files in generate mode:');
  });

  it('injects verified dependencies context when provided', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'vite-react',
      mode: 'generate',
      complexity: 'simple',
      verifiedDependencies: ['react-query', 'zustand'],
    });

    expect(prompt).toContain('Verified packages: react-query, zustand');
  });

  it('adds react performance and code quality for complex generate without entering fix mode', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'nextjs',
      complexity: 'complex',
      mode: 'generate',
      userRequest: 'Build a full dashboard with charts and real-time data',
    });

    expect(prompt).toContain('<skill:react-performance>');
    expect(prompt).toContain('<skill:code-quality-compact>');
    expect(prompt).not.toContain('You are in FIX MODE.');
  });

  it('does not add strict compliance for default compact profile', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'vite-react',
      complexity: 'simple',
      mode: 'generate',
      userRequest: 'Build a dashboard UI',
    });

    expect(prompt).not.toContain('<skill:strict-compliance>');
  });

  it('adds strict compliance for strict profile in generate mode', async () => {
    const { composePrompt } = await import('../../../lib/llm/compose.js');

    const prompt = composePrompt({
      framework: 'vite-react',
      complexity: 'simple',
      mode: 'generate',
      profile: 'strict',
      userRequest: 'Build a dashboard UI',
    });

    expect(prompt).toContain('<skill:strict-compliance>');
    expect(prompt).not.toContain('You are in FIX MODE.');
  });
});
