import { IntentAnalysisSchema, Framework, Complexity, IntentAnalysis } from '../schemas.js';

const INTENT_PATTERNS: { pattern: RegExp; type: IntentAnalysis['type']; complexity: Complexity }[] = [
    { pattern: /landing\s*page|homepage|hero/i, type: 'landing', complexity: 'simple' },
    { pattern: /dashboard|admin\s*panel|analytics/i, type: 'dashboard', complexity: 'complex' },
    { pattern: /portfolio|personal\s*site|resume/i, type: 'portfolio', complexity: 'moderate' },
    { pattern: /e-?commerce|shop|store|cart/i, type: 'ecommerce', complexity: 'complex' },
    { pattern: /blog|article|cms/i, type: 'blog', complexity: 'moderate' }
];

const FEATURE_PATTERNS: { pattern: RegExp; feature: string }[] = [
    { pattern: /auth|login|sign\s*up/i, feature: 'authentication' },
    { pattern: /dark\s*mode|theme/i, feature: 'theme-switching' },
    { pattern: /responsive|mobile/i, feature: 'responsive-design' },
    { pattern: /animation|motion|framer/i, feature: 'animations' },
    { pattern: /chart|graph|visualization/i, feature: 'data-visualization' },
    { pattern: /form|input|validation/i, feature: 'forms' },
    { pattern: /api|fetch|data/i, feature: 'api-integration' },
    { pattern: /modal|dialog|popup/i, feature: 'modals' },
    { pattern: /search|filter/i, feature: 'search-filter' },
    { pattern: /table|list|grid/i, feature: 'data-display' }
];

const FRAMEWORK_HINTS: { pattern: RegExp; framework: Framework }[] = [
    { pattern: /next\.?js|ssr|server/i, framework: 'nextjs' },
    { pattern: /vite|react\s*only|spa/i, framework: 'vite-react' },
    { pattern: /vanilla|plain|no\s*framework|html/i, framework: 'vanilla' }
];

function extractFeatures(input: string): string[] {
    return FEATURE_PATTERNS
        .filter(({ pattern }) => pattern.test(input))
        .map(({ feature }) => feature);
}

function detectIntentType(input: string): IntentAnalysis['type'] {
    for (const { pattern, type } of INTENT_PATTERNS) {
        if (pattern.test(input)) return type;
    }
    return 'custom';
}

function determineComplexity(input: string, features: string[]): Complexity {
    for (const { pattern, complexity } of INTENT_PATTERNS) {
        if (pattern.test(input)) return complexity;
    }

    if (features.length >= 5) return 'complex';
    if (features.length >= 2) return 'moderate';
    return 'simple';
}

function suggestFramework(input: string, type: IntentAnalysis['type'], complexity: Complexity): Framework {
    for (const { pattern, framework } of FRAMEWORK_HINTS) {
        if (pattern.test(input)) return framework;
    }

    if (complexity === 'simple') return 'vanilla';
    if (type === 'dashboard' || type === 'ecommerce' || complexity === 'complex') return 'nextjs';
    return 'vite-react';
}

function generateReasoning(type: IntentAnalysis['type'], framework: Framework, features: string[]): string {
    const typeReason = type === 'custom'
        ? 'Custom application detected'
        : `${type.charAt(0).toUpperCase() + type.slice(1)} project identified`;

    const frameworkReason = {
        nextjs: 'Next.js chosen for SSR/SSG capabilities and routing',
        'vite-react': 'Vite + React for fast development and modern SPA',
        vanilla: 'Vanilla JS for simplicity and minimal overhead'
    }[framework];

    const featureNote = features.length > 0
        ? `Key features: ${features.slice(0, 3).join(', ')}`
        : 'Basic implementation';

    return `${typeReason}. ${frameworkReason}. ${featureNote}.`;
}

export function analyzeIntent(input: string): IntentAnalysis {
    const features = extractFeatures(input);
    const type = detectIntentType(input);
    const complexity = determineComplexity(input, features);
    const suggestedFramework = suggestFramework(input, type, complexity);
    const reasoning = generateReasoning(type, suggestedFramework, features);

    return IntentAnalysisSchema.parse({
        type,
        complexity,
        features,
        suggestedFramework,
        reasoning
    });
}

export function extractDependenciesFromIntent(analysis: IntentAnalysis): string[] {
    const baseDeps: string[] = [];

    const featureDeps: Record<string, string[]> = {
        'theme-switching': ['next-themes'],
        'animations': ['framer-motion'],
        'data-visualization': ['recharts'],
        'forms': ['react-hook-form', 'zod'],
        'modals': [],
        'search-filter': [],
        'data-display': []
    };

    for (const feature of analysis.features) {
        const deps = featureDeps[feature];
        if (deps) baseDeps.push(...deps);
    }

    return [...new Set(baseDeps)];
}
