export interface TemplateConfig {
    image: string;
    templateDir: string;
    outputDir: string;
    protectedFiles: string[];
}

const REGISTRY_BASE = process.env.DOCKER_REGISTRY_BASE || 'ghcr.io/pragnya-works/edward';

export const TEMPLATE_REGISTRY: Record<string, TemplateConfig> = {
    nextjs: {
        image: `${REGISTRY_BASE}/nextjs-sandbox:latest`,
        templateDir: 'nextjs',
        outputDir: '.next',
        protectedFiles: [
            'package.json', 'tsconfig.json', 'next.config.ts', 'next.config.mjs', 'next.config.js',
            'tailwind.config.ts', 'tailwind.config.js', 'postcss.config.mjs', 'postcss.config.js',
            'eslint.config.mjs', '.eslintrc.json', 'next-env.d.ts',
            'globals.css', 'src/app/globals.css'
        ]
    },
    'vite-react': {
        image: `${REGISTRY_BASE}/vite-react-sandbox:latest`,
        templateDir: 'vite-react',
        outputDir: 'dist',
        protectedFiles: [
            'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
            'tsconfig.app.json', 'tsconfig.node.json',
            'index.css', 'src/index.css'
        ]
    },
    'vanilla': {
        image: `${REGISTRY_BASE}/vanilla-sandbox:latest`,
        templateDir: 'vanilla',
        outputDir: '.',
        protectedFiles: []
    }
};

export function isValidFramework(framework: string): boolean {
    const normalized = framework.toLowerCase();
    const validFrameworks = ['nextjs', 'vite-react', 'vanilla', 'next', 'react', 'vite', 'next.js'];
    return validFrameworks.includes(normalized);
}

export function normalizeFramework(framework: string): 'nextjs' | 'vite-react' | 'vanilla' | undefined {
    const normalized = framework.toLowerCase();
    if (normalized === 'next' || normalized === 'next.js' || normalized === 'nextjs') return 'nextjs';
    if (normalized === 'react' || normalized === 'vite' || normalized === 'vite-react') return 'vite-react';
    if (normalized === 'vanilla') return 'vanilla';
    return undefined;
}

export function getTemplateConfig(framework: string): TemplateConfig | undefined {
    const normalized = normalizeFramework(framework);
    return normalized ? TEMPLATE_REGISTRY[normalized] : undefined;
}

export function getDefaultImage(): string {
    return TEMPLATE_REGISTRY.vanilla!.image;
}