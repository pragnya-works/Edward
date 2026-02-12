import { UI_DESIGN_SKILL } from './uiDesignSkill.js';
import { NEXTJS_PATTERNS_SKILL } from './nextjsPatternsSkill.js';
import { VITE_PATTERNS_SKILL } from './vitePatternsSkill.js';
import { VANILLA_PATTERNS_SKILL } from './vanillaPatternsSkill.js';
import { CODE_QUALITY_SKILL } from './codeQualitySkill.js';
import { REACT_BEST_PRACTICES_SKILL } from './reactBestPracticesSkill.js';
import { WEB_GUIDELINES_SKILL } from './webGuidelinesSkill.js';
import { Framework } from '../../../services/planning/schemas.js';

export type Complexity = 'simple' | 'moderate' | 'complex' | undefined;

export function getSkillsForContext(framework?: Framework, complexity: Complexity = 'simple'): string[] {
  const skills: string[] = [];
  skills.push(UI_DESIGN_SKILL);
  skills.push(WEB_GUIDELINES_SKILL);

  switch (framework) {
    case 'nextjs':
      skills.push(NEXTJS_PATTERNS_SKILL);
      skills.push(REACT_BEST_PRACTICES_SKILL);
      break;
    case 'vite-react':
      skills.push(VITE_PATTERNS_SKILL);
      skills.push(REACT_BEST_PRACTICES_SKILL);
      break;
    case 'vanilla':
      skills.push(VANILLA_PATTERNS_SKILL);
      break;
    default:
      skills.push(NEXTJS_PATTERNS_SKILL);
      skills.push(REACT_BEST_PRACTICES_SKILL);
      break;
  }

  if (complexity !== 'simple') {
    skills.push(CODE_QUALITY_SKILL);
  }

  return skills;
}
