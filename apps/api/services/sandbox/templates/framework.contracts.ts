import { logger } from '../../../utils/logger.js';
import { Framework } from '../../planning/schemas.js';

export interface PackageJson {
    name: string;
    version: string;
    private?: boolean;
    type?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

interface ValidationResult {
    valid: boolean;
    errors: string[];
}

interface FrameworkContract {
    framework: Framework;
    runtimeDependencies: string[];
    developmentDependencies: string[];
    requiredScripts: string[];
    templateDir: string;
    validate?: (packageJson: PackageJson) => ValidationResult;
}

const FRAMEWORK_CONTRACTS: Record<Framework, FrameworkContract> = {
    nextjs: {
        framework: 'nextjs',
        runtimeDependencies: ['react', 'react-dom', 'next', 'next-themes', 'framer-motion', 'lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority', '@radix-ui/react-slot'],
        developmentDependencies: [
            'typescript',
            '@types/node',
            '@types/react',
            '@types/react-dom',
            'postcss',
            'tailwindcss',
            '@tailwindcss/postcss'
        ],
        requiredScripts: ['dev', 'build', 'start'],
        templateDir: 'nextjs',
        validate: (packageJson: PackageJson): ValidationResult => {
            const errors: string[] = [];

            const hasDeps = ['react', 'react-dom', 'next'].every(
                dep => packageJson.dependencies?.[dep]
            );
            if (!hasDeps) {
                errors.push('Missing required runtime dependencies: react, react-dom, next');
            }

            const hasScripts = ['dev', 'build', 'start'].every(
                script => packageJson.scripts?.[script]?.includes('next')
            );
            if (!hasScripts) {
                errors.push('Missing or invalid Next.js scripts');
            }

            return { valid: errors.length === 0, errors };
        }
    },

    'vite-react': {
        framework: 'vite-react',
        runtimeDependencies: ['react', 'react-dom', 'framer-motion', 'lucide-react', 'clsx', 'tailwind-merge'],
        developmentDependencies: [
            'typescript',
            '@types/react',
            '@types/react-dom',
            'vite',
            '@vitejs/plugin-react',
            'tailwindcss',
            '@tailwindcss/vite'
        ],
        requiredScripts: ['dev', 'build', 'preview'],
        templateDir: 'vite-react',
        validate: (packageJson: PackageJson): ValidationResult => {
            const errors: string[] = [];

            const hasDeps = ['react', 'react-dom'].every(
                dep => packageJson.dependencies?.[dep]
            );
            if (!hasDeps) {
                errors.push('Missing required runtime dependencies: react, react-dom');
            }

            const hasVite = packageJson.devDependencies?.['vite'];
            if (!hasVite) {
                errors.push('Missing Vite in devDependencies');
            }

            const hasScripts = ['dev', 'build'].every(
                script => packageJson.scripts?.[script]?.includes('vite')
            );
            if (!hasScripts) {
                errors.push('Missing or invalid Vite scripts');
            }

            return { valid: errors.length === 0, errors };
        }
    },

    vanilla: {
        framework: 'vanilla',
        runtimeDependencies: [],
        developmentDependencies: [],
        requiredScripts: [],
        templateDir: 'vanilla',
        validate: (): ValidationResult => ({ valid: true, errors: [] })
    }
};

export function getFrameworkContract(framework: Framework): FrameworkContract {
    const contract = FRAMEWORK_CONTRACTS[framework];
    if (!contract) {
        logger.warn({ framework }, 'Unknown framework, using vanilla');
        return FRAMEWORK_CONTRACTS.vanilla;
    }
    return contract;
}

export function validateFrameworkContract(
    framework: Framework,
    packageJson: PackageJson
): ValidationResult {
    const contract = getFrameworkContract(framework);

    if (contract.validate) {
        return contract.validate(packageJson);
    }

    const errors: string[] = [];

    const missingRuntime = contract.runtimeDependencies.filter(
        dep => !packageJson.dependencies?.[dep]
    );
    if (missingRuntime.length > 0) {
        errors.push(`Missing runtime dependencies: ${missingRuntime.join(', ')}`);
    }

    const missingDev = contract.developmentDependencies.filter(
        dep => !packageJson.devDependencies?.[dep]
    );
    if (missingDev.length > 0) {
        errors.push(`Missing dev dependencies: ${missingDev.join(', ')}`);
    }

    const missingScripts = contract.requiredScripts.filter(
        script => !packageJson.scripts?.[script]
    );
    if (missingScripts.length > 0) {
        errors.push(`Missing scripts: ${missingScripts.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
}