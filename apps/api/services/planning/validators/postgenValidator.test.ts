import { expect, test, describe } from 'vitest';
import { validateGeneratedOutput } from './postgenValidator.js';

describe('Post-Generation Validator', () => {
    test('should detect missing entry points', () => {
        const output = {
            framework: 'nextjs',
            files: new Map([['src/app/page.tsx', 'content']]),
            declaredPackages: [],
        };
        const result = validateGeneratedOutput(output);
        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.type === 'missing-entry-point')).toBe(true);
    });

    test('should detect markdown fences in files', () => {
        const output = {
            framework: 'nextjs',
            files: new Map([
                ['src/app/layout.tsx', 'import "./globals.css"'],
                ['src/app/page.tsx', '```tsx\nexport default function Page() {}\n```'],
            ]),
            declaredPackages: [],
        };
        const result = validateGeneratedOutput(output);
        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.type === 'markdown-fence')).toBe(true);
    });

    test('should detect missing packages', () => {
        const output = {
            framework: 'nextjs',
            files: new Map([
                ['src/app/layout.tsx', 'import "./globals.css"'],
                ['src/app/page.tsx', 'import { motion } from "framer-motion"'],
            ]),
            declaredPackages: [],
        };
        const result = validateGeneratedOutput(output);
        // Warning status for missing packages doesn't invalidate "valid" flag currently
        expect(result.violations.some(v => v.type === 'missing-package')).toBe(true);
    });

    test('should detect orphaned relative imports', () => {
        const output = {
            framework: 'nextjs',
            files: new Map([
                ['src/app/layout.tsx', 'import "./globals.css"'],
                ['src/app/page.tsx', 'import { Button } from "../components/Button"'],
            ]),
            declaredPackages: [],
        };
        const result = validateGeneratedOutput(output);
        expect(result.violations.some(v => v.type === 'orphaned-import')).toBe(true);
    });

    test('should pass valid output', () => {
        const output = {
            framework: 'nextjs',
            files: new Map([
                ['src/app/layout.tsx', 'import "./globals.css"; export default function Layout({ children }) { return children }'],
                ['src/app/page.tsx', 'import { Button } from "./ui"; export default function Page() { return <Button /> }'],
                ['src/app/ui.tsx', 'export function Button() { return <button /> }'],
                ['src/app/globals.css', '/* styles */'],
            ]),
            declaredPackages: ['framer-motion'],
        };
        const result = validateGeneratedOutput(output);
        expect(result.valid).toBe(true);
        expect(result.violations.length).toBe(0);
    });
});
