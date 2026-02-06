import { CORE_SYSTEM_PROMPT } from './systemPrompt.js';
import { getSkillsForContext, type Framework, type Complexity } from './skills/index.js';

export interface ComposeOptions {
  framework?: Framework;
  complexity?: Complexity;
  verifiedDependencies?: string[];
}

export function composePrompt(options: ComposeOptions = {}): string {
  const { framework, complexity, verifiedDependencies } = options;
  const parts: string[] = [CORE_SYSTEM_PROMPT];

  const skills = getSkillsForContext(framework, complexity);
  parts.push(...skills);

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
