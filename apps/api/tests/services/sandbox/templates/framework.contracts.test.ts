import { describe, it, expect } from 'vitest';
import { validateFrameworkContract, getFrameworkContract } from '../../../../services/sandbox/templates/framework.contracts.js';
import { Framework } from '../../../../services/planning/schemas.js';

describe('FrameworkContracts', () => {
    describe('nextjs contract', () => {
        it('should validate a correct Next.js package.json', () => {
            const packageJson = {
                name: 'test-next',
                version: '1.0.0',
                dependencies: {
                    'react': '^18',
                    'react-dom': '^18',
                    'next': 'latest'
                },
                scripts: {
                    'dev': 'next dev',
                    'build': 'next build',
                    'start': 'next start'
                }
            };

            const result = validateFrameworkContract('nextjs', packageJson);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should fail if critical dependencies are missing', () => {
            const packageJson = {
                name: 'test-next',
                version: '1.0.0',
                dependencies: {
                    'react': '^18'
                },
                scripts: {
                    'dev': 'next dev'
                }
            };

            const result = validateFrameworkContract('nextjs', packageJson);
            expect(result.valid).toBe(false);
            expect(result.errors.join('')).toContain('Missing required runtime dependencies');
        });

        it('should fail if scripts are invalid', () => {
            const packageJson = {
                name: 'test-next',
                version: '1.0.0',
                dependencies: {
                    'react': '^18',
                    'react-dom': '^18',
                    'next': 'latest'
                },
                scripts: {
                    'dev': 'node dev.js'
                }
            };

            const result = validateFrameworkContract('nextjs', packageJson);
            expect(result.valid).toBe(false);
            expect(result.errors.join('')).toContain('Missing or invalid Next.js scripts');
        });
    });

    describe('vite-react contract', () => {
        it('should validate a correct Vite package.json', () => {
            const packageJson = {
                name: 'test-vite',
                version: '1.0.0',
                dependencies: {
                    'react': '^18',
                    'react-dom': '^18'
                },
                devDependencies: {
                    'vite': 'latest'
                },
                scripts: {
                    'dev': 'vite',
                    'build': 'vite build'
                }
            };

            const result = validateFrameworkContract('vite-react', packageJson);
            expect(result.valid).toBe(true);
        });

        it('should fail if vite is missing from devDependencies', () => {
            const packageJson = {
                name: 'test-vite',
                version: '1.0.0',
                dependencies: {
                    'react': '^18',
                    'react-dom': '^18'
                },
                scripts: {
                    'dev': 'vite'
                }
            };

            const result = validateFrameworkContract('vite-react', packageJson);
            expect(result.valid).toBe(false);
            expect(result.errors.join('')).toContain('Missing Vite in devDependencies');
        });
    });

    describe('vanilla contract', () => {
        it('should always be valid', () => {
            const result = validateFrameworkContract('vanilla', { name: 'v', version: '1' });
            expect(result.valid).toBe(true);
        });
    });

    describe('getFrameworkContract', () => {
        it('should return vanilla for unknown frameworks', () => {
            const contract = getFrameworkContract('unknown' as Framework);
            expect(contract.framework).toBe('vanilla');
        });
    });
});
