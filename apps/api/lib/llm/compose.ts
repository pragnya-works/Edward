import { CORE_SYSTEM_PROMPT, MODE_PROMPTS } from './systemPrompt.js';
import { getSkillsForContext, type Complexity } from './skills/index.js';
import { Framework, ChatAction, PlanStatus, type Plan } from '../../services/planning/schemas.js';

export interface ComposeOptions {
  framework?: Framework;
  complexity?: Complexity;
  verifiedDependencies?: string[];
  mode?: typeof ChatAction[keyof typeof ChatAction];
  plan?: Plan;
}

function formatPlanForLLM(plan: Plan): string {
  const stepsBlock = plan.steps
    .map(step => {
      const statusIcon = step.status === PlanStatus.DONE ? '✅' : step.status === PlanStatus.IN_PROGRESS ? '🔄' : step.status === PlanStatus.FAILED ? '❌' : '⬜';
      return `  - [${statusIcon} ${step.status.toUpperCase()}] step_id="${step.id}" | ${step.title}${step.description ? ': ' + step.description : ''}`;
    })
    .join('\n');

  return `\n[ACTIVE PLAN — YOU MUST TRACK THIS]\nSummary: ${plan.summary}\nSteps:\n${stepsBlock}\n\nIMPORTANT: Use <edward_plan_check step_id="..." status="done"> to mark each step as you complete it. Do NOT emit <edward_done /> until ALL steps are "done" or "failed".`;
}

export function composePrompt(options: ComposeOptions = {}): string {
  const { framework, complexity, verifiedDependencies, mode = ChatAction.GENERATE, plan } = options;
  const parts: string[] = [CORE_SYSTEM_PROMPT];

  if (mode === ChatAction.FIX) parts.push(MODE_PROMPTS.fix);
  if (mode === ChatAction.EDIT) parts.push(MODE_PROMPTS.edit);

  const skills = getSkillsForContext(framework, complexity);
  parts.push(...skills);

  if (plan) {
    parts.push(formatPlanForLLM(plan));
  }

  if (verifiedDependencies && verifiedDependencies.length > 0) {
    parts.push(
      `\n[CONTEXT] These packages are verified and available: ${verifiedDependencies.join(', ')}. Use these exact names in your <edward_install> tag.`
    );
  }

  if (framework) {
    const frameworkLabel = framework === 'nextjs' ? 'Next.js' : framework === 'vite-react' ? 'Vite React' : 'Vanilla HTML/CSS/JS';
    parts.push(
      `\n[ENVIRONMENT] You are working in a ${frameworkLabel} project. Include the required entry point files.`
    );
  }

  return parts.join('\n\n');
}

export function composeStructuredPrompt(instruction: string): string {
  return instruction;
}
