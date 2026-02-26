type EvalResult = {
  scenario: string;
  approxTokens: number;
  pass: boolean;
  checks: Array<{ name: string; pass: boolean; details?: string }>;
};

function ensureEvalEnv(): void {
  process.env.EDWARD_API_PORT ||= '3001';
  process.env.ENCRYPTION_KEY ||= 'eval-key';
  process.env.AWS_ACCESS_KEY_ID ||= 'eval';
  process.env.AWS_SECRET_ACCESS_KEY ||= 'eval';
  process.env.AWS_BUCKET_NAME ||= 'eval';
  process.env.AWS_CDN_BUCKET_NAME ||= 'eval';
  process.env.REDIS_HOST ||= 'localhost';
  process.env.REDIS_PORT ||= '6379';
  process.env.PREWARM_SANDBOX_IMAGE ||= 'eval';
  process.env.DOCKER_REGISTRY_BASE ||= 'eval';
}

async function run(): Promise<number> {
  ensureEvalEnv();

  const { composePrompt, estimatePromptTokensApprox } = await import(
    '../lib/llm/compose.js'
  );
  const { ChatAction } = await import('../services/planning/schemas.js');
  const { PromptProfile } = await import('../lib/llm/prompts/sections.js');

  const scenarios: Array<{
    name: string;
    input: Parameters<typeof composePrompt>[0];
    budget: number;
    mustContain: string[];
    mustNotContain?: string[];
  }> = [
    {
      name: 'nextjs-generate-compact-default',
      input: {
        framework: 'nextjs',
        complexity: 'simple',
        mode: ChatAction.GENERATE,
        profile: PromptProfile.COMPACT,
        userRequest: 'Build a marketing landing page',
        intentType: 'landing',
      },
      budget: 5000,
      mustContain: [
        '<scope_restrictions>',
        '<edward_sandbox_format>',
        '<skill:nextjs-compact>',
      ],
    },
    {
      name: 'vite-generate-compact-default',
      input: {
        framework: 'vite-react',
        complexity: 'simple',
        mode: ChatAction.GENERATE,
        profile: PromptProfile.COMPACT,
        userRequest: 'Build a dashboard UI',
      },
      budget: 5000,
      mustContain: ['<skill:vite-compact>'],
      mustNotContain: ['<skill:strict-compliance>'],
    },
    {
      name: 'nextjs-fix-strict',
      input: {
        framework: 'nextjs',
        complexity: 'moderate',
        mode: ChatAction.FIX,
        profile: PromptProfile.STRICT,
        userRequest: 'Fix failing imports and missing entrypoints',
      },
      budget: 7000,
      mustContain: [
        'You are in FIX MODE.',
        '<skill:react-performance>',
        '<skill:strict-compliance>',
      ],
    },
  ];

  const results: EvalResult[] = scenarios.map((scenario) => {
    const prompt = composePrompt(scenario.input);
    const approxTokens = estimatePromptTokensApprox(prompt);

    const checks: EvalResult['checks'] = [];
    checks.push({
      name: 'budget',
      pass: approxTokens <= scenario.budget,
      details: `approx=${approxTokens}, budget=${scenario.budget}`,
    });

    for (const marker of scenario.mustContain) {
      checks.push({
        name: `contains:${marker}`,
        pass: prompt.includes(marker),
      });
    }

    for (const marker of scenario.mustNotContain ?? []) {
      checks.push({
        name: `not-contains:${marker}`,
        pass: !prompt.includes(marker),
      });
    }

    return {
      scenario: scenario.name,
      approxTokens,
      checks,
      pass: checks.every((check) => check.pass),
    };
  });

  const allPass = results.every((result) => result.pass);
  console.log(JSON.stringify({ allPass, results }, null, 2));
  return allPass ? 0 : 1;
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
