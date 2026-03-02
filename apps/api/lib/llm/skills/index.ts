import {
  CODE_QUALITY_COMPACT_SKILL,
  NEXTJS_PATTERNS_COMPACT_SKILL,
  REACT_PERFORMANCE_SKILL,
  SEO_BRANDING_SKILL,
  STRICT_COMPLIANCE_SKILL,
  UI_DESIGN_CORE_SKILL,
  UI_DESIGN_EXPANDED_SKILL,
  VANILLA_PATTERNS_COMPACT_SKILL,
  VITE_PATTERNS_COMPACT_SKILL,
  WEB_QUALITY_SKILL,
} from './compactSkills.js';
import {
  ChatAction,
  type Framework,
} from '../../../services/planning/schemas.js';
import {
  PromptProfile,
  type PromptProfile as PromptProfileType,
} from '../prompts/sections.js';
import type {
  IntentAnalysis,
} from '../../../services/planning/schemas.js';

export type Complexity = 'simple' | 'moderate' | 'complex' | undefined;
type IntentType = IntentAnalysis['type'];

export interface SkillSelectionContext {
  framework?: Framework;
  complexity?: Complexity;
  mode?: ChatAction;
  profile?: PromptProfileType;
  userRequest?: string;
  intentType?: IntentType;
  intentFeatures?: string[];
}

type SkillKey =
  | 'ui_design_core'
  | 'ui_design_expanded'
  | 'web_quality'
  | 'seo_branding'
  | 'react_performance'
  | 'nextjs_patterns'
  | 'vite_patterns'
  | 'vanilla_patterns'
  | 'code_quality'
  | 'strict_compliance';

const FRAMEWORK = {
  NEXTJS: 'nextjs',
  VITE_REACT: 'vite-react',
  VANILLA: 'vanilla',
} as const satisfies Record<string, Framework>;

const COMPLEXITY = {
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
} as const;

const DEFAULT_INTENT_TYPE: IntentType = 'custom';

const SKILL_MAP: Record<SkillKey, string> = {
  ui_design_core: UI_DESIGN_CORE_SKILL,
  ui_design_expanded: UI_DESIGN_EXPANDED_SKILL,
  web_quality: WEB_QUALITY_SKILL,
  seo_branding: SEO_BRANDING_SKILL,
  react_performance: REACT_PERFORMANCE_SKILL,
  nextjs_patterns: NEXTJS_PATTERNS_COMPACT_SKILL,
  vite_patterns: VITE_PATTERNS_COMPACT_SKILL,
  vanilla_patterns: VANILLA_PATTERNS_COMPACT_SKILL,
  code_quality: CODE_QUALITY_COMPACT_SKILL,
  strict_compliance: STRICT_COMPLIANCE_SKILL,
};

const FRAMEWORK_PACK_BY_FRAMEWORK: Record<Framework, SkillKey> = {
  [FRAMEWORK.NEXTJS]: 'nextjs_patterns',
  [FRAMEWORK.VITE_REACT]: 'vite_patterns',
  [FRAMEWORK.VANILLA]: 'vanilla_patterns',
};

const DEFAULT_FRAMEWORK_PACK: SkillKey = 'vite_patterns';

const REACT_FRAMEWORKS: ReadonlySet<Framework> = new Set([
  FRAMEWORK.NEXTJS,
  FRAMEWORK.VITE_REACT,
]);

const DESIGN_HINTS = [
  'design',
  'ui',
  'ux',
  'landing',
  'hero',
  'portfolio',
  'brand',
  'beautiful',
  'aesthetic',
  'animation',
  'redesign',
  'theme',
  'style',
  'visual',
];

const PERF_HINTS = [
  'performance',
  'slow',
  'optimiz',
  'lag',
  'bundle',
  'lcp',
  'tti',
  'cls',
  're-render',
  'waterfall',
  'memory',
  'fps',
];

const A11Y_HINTS = [
  'accessibility',
  'a11y',
  'wcag',
  'aria',
  'keyboard',
  'screen reader',
  'contrast',
  'audit',
  'compliance',
];

const DESIGN_INTENT_TYPES: ReadonlySet<IntentType> = new Set([
  'landing',
  'portfolio',
  'ecommerce',
  'blog',
]);

function toSearchText(context: SkillSelectionContext): string {
  const segments = [
    context.userRequest || '',
    context.intentType || '',
    ...(context.intentFeatures || []),
  ];

  return segments.join(' ').toLowerCase();
}

function hasHint(searchText: string, hints: readonly string[]): boolean {
  return hints.some((hint) => searchText.includes(hint));
}

export function selectSkillsForContext(
  context: SkillSelectionContext = {},
): { names: SkillKey[]; prompts: string[] } {
  const framework = context.framework;
  const complexity = context.complexity ?? COMPLEXITY.SIMPLE;
  const mode = context.mode ?? ChatAction.GENERATE;
  const profile = context.profile ?? PromptProfile.COMPACT;
  const intentType = context.intentType ?? DEFAULT_INTENT_TYPE;
  const searchText = toSearchText(context);

  const names: SkillKey[] = ['ui_design_core', 'web_quality', 'seo_branding'];
  names.push(
    framework ? FRAMEWORK_PACK_BY_FRAMEWORK[framework] : DEFAULT_FRAMEWORK_PACK,
  );

  const shouldUseExpandedDesign =
    mode === ChatAction.GENERATE &&
    (DESIGN_INTENT_TYPES.has(intentType) ||
      hasHint(searchText, DESIGN_HINTS));

  const shouldUseReactPerformance =
    (framework ? REACT_FRAMEWORKS.has(framework) : true) &&
    (mode !== ChatAction.GENERATE ||
      complexity === COMPLEXITY.COMPLEX ||
      hasHint(searchText, PERF_HINTS));

  const shouldUseCodeQuality =
    mode === ChatAction.GENERATE ||
    complexity !== COMPLEXITY.SIMPLE ||
    hasHint(searchText, A11Y_HINTS);

  if (shouldUseExpandedDesign) {
    names.push('ui_design_expanded');
  }

  if (shouldUseReactPerformance) {
    names.push('react_performance');
  }

  if (shouldUseCodeQuality) {
    names.push('code_quality');
  }

  if (profile === PromptProfile.STRICT) {
    names.push('strict_compliance');
  }

  return {
    names,
    prompts: names.map((name) => SKILL_MAP[name]),
  };
}

export function getSkillsForContext(
  context: SkillSelectionContext = {},
): string[] {
  return selectSkillsForContext(context).prompts;
}
