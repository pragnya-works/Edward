import { IntentAnalysisSchema, IntentAnalysis } from '../schemas.js';
import { generateResponse } from '../../../lib/llm/provider.client.js';
import { logger } from '../../../utils/logger.js';
import { detectExplicitFrameworkPreference } from '../frameworkPreference.js';

const ANALYSIS_SYSTEM_PROMPT = `You are the intent classifier for a FRONTEND-ONLY assistant.

Return ONLY a valid JSON object (no markdown, no commentary) with this exact shape:
{
    "action": "generate" | "fix" | "edit",
    "type": "landing" | "dashboard" | "portfolio" | "ecommerce" | "blog" | "custom",
    "complexity": "simple" | "moderate" | "complex",
    "features": ["frontend-feature"],
    "recommendedPackages": ["package-name"],
    "suggestedFramework": "nextjs" | "vite-react" | "vanilla",
    "reasoning": "brief reason"
}

Rules (strict):
1) Action:
- fix: user reports bug/error/failure/not working
- edit: user asks to modify existing project
- generate: otherwise/default

2) Framework:
- vite-react: default for most requests, especially when user says React without explicit Next.js
- nextjs: ONLY when user explicitly asks Next.js/Next/nextjs OR needs Next-specific features (SSR, Server Components, file-based routing + API routes)
- vanilla: plain HTML/CSS/JS or simple static page without framework
- If unsure, choose vite-react

3) Hard reject backend/infrastructure scope:
- Backend APIs/servers (REST, GraphQL, Express, Fastify, Node server setup)
- Databases (schema/migrations/queries, Prisma)
- Auth backends (JWT issuing, password hashing)
- Infra/DevOps (Docker, CI/CD, deployment pipelines, Kubernetes, provisioning)

If backend/infrastructure is requested, return:
- action: "generate"
- type: "custom"
- complexity: "moderate"
- features: []
- recommendedPackages: []
- suggestedFramework: "vite-react"
- reasoning: "BACKEND_REQUEST_REJECTED"

4) features must include ONLY frontend capabilities:
- UI/layout/components/pages
- client state
- forms + client validation
- consuming external APIs from frontend
- routing/navigation
- styling/animation/responsive behavior`;

export async function analyzeIntent(input: string, apiKey: string): Promise<IntentAnalysis> {
    const explicitFramework = detectExplicitFrameworkPreference(input);

    try {
        const response = await generateResponse(
            apiKey,
            `Analyze this request: "${input}"`,
            [],
            ANALYSIS_SYSTEM_PROMPT,
        );

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');

        const parsed = IntentAnalysisSchema.parse(JSON.parse(jsonMatch[0]));
        if (!explicitFramework || parsed.suggestedFramework === explicitFramework) {
            return parsed;
        }

        return {
            ...parsed,
            suggestedFramework: explicitFramework,
            reasoning: `${parsed.reasoning} Explicit framework preference detected in request: ${explicitFramework}.`,
        };
    } catch (error) {
        logger.warn(error, 'Intent analysis failed, using fallback');
        return IntentAnalysisSchema.parse({
            action: 'generate',
            type: 'custom',
            complexity: 'moderate',
            features: [],
            recommendedPackages: [],
            suggestedFramework: explicitFramework || 'vite-react',
            reasoning: explicitFramework
                ? `Fallback logic invoked with explicit framework preference: ${explicitFramework}.`
                : 'Fallback logic invoked'
        });
    }
}
