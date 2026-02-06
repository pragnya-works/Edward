import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeIntent } from '../../../../services/planning/analyzers/intentAnalyzer.js';
import { generateResponse } from '../../../../lib/llm/response.js';

vi.mock('../../../../lib/llm/response.js', () => ({
    generateResponse: vi.fn(),
}));

vi.mock('../../../../utils/logger.js', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('IntentAnalyzer', () => {
    const mockApiKey = 'sk-12345';
    const mockInput = 'Create a landing page for a coffee shop';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should correctly parse valid LLM response', async () => {
        const mockLlmResponse = JSON.stringify({
            type: 'landing',
            complexity: 'simple',
            features: ['hero section', 'menu', 'contact form'],
            recommendedPackages: ['framer-motion', 'lucide-react'],
            suggestedFramework: 'vite-react',
            reasoning: 'Small landing page with simple interactions.'
        });

        vi.mocked(generateResponse).mockResolvedValue(mockLlmResponse);

        const result = await analyzeIntent(mockInput, mockApiKey);

        expect(result.type).toBe('landing');
        expect(result.complexity).toBe('simple');
        expect(result.suggestedFramework).toBe('vite-react');
        expect(result.features).toContain('hero section');
        expect(result.recommendedPackages).toContain('framer-motion');
    });

    it('should handle LLM response wrapped in markdown or extra text', async () => {
        const mockLlmResponse = `Here is the analysis:
        {
            "type": "dashboard",
            "complexity": "moderate",
            "features": ["auth", "charts"],
            "recommendedPackages": ["recharts"],
            "suggestedFramework": "nextjs",
            "reasoning": "Admin dashboard needs SSR."
        }
        Good luck!`;

        vi.mocked(generateResponse).mockResolvedValue(mockLlmResponse);

        const result = await analyzeIntent(mockInput, mockApiKey);

        expect(result.type).toBe('dashboard');
        expect(result.suggestedFramework).toBe('nextjs');
    });

    it('should return fallback logic if LLM returns invalid JSON', async () => {
        vi.mocked(generateResponse).mockResolvedValue('Invalid response without JSON');

        const result = await analyzeIntent(mockInput, mockApiKey);

        expect(result.type).toBe('custom');
        expect(result.complexity).toBe('moderate');
        expect(result.suggestedFramework).toBe('nextjs');
        expect(result.reasoning).toContain('Fallback logic');
    });

    it('should return fallback logic if LLM call fails', async () => {
        vi.mocked(generateResponse).mockRejectedValue(new Error('Network error'));

        const result = await analyzeIntent(mockInput, mockApiKey);

        expect(result.type).toBe('custom');
        expect(result.suggestedFramework).toBe('nextjs');
    });
});
