import { IntentAnalysisSchema, IntentAnalysis } from '../schemas.js';
import { generateResponse } from '../../../lib/llm/response.js';
import { logger } from '../../../utils/logger.js';

const ANALYSIS_SYSTEM_PROMPT = `You are a technical architect for a FRONTEND-ONLY development assistant. Analyze the user request and return a JSON object with this exact structure:

{
  "action": "generate" | "fix" | "edit",
  "action": "generate" | "fix" | "edit",
  "type": "landing" | "dashboard" | "portfolio" | "ecommerce" | "blog" | "custom",
  "complexity": "simple" | "moderate" | "complex",
  "features": ["feature1", "feature2"],
  "recommendedPackages": ["package-name"],
  "suggestedFramework": "nextjs" | "vite-react" | "vanilla",
  "reasoning": "Brief explanation"
}

Action Rules:
- "fix": If the user reports an error, bug, build failure, or something not working.
- "edit": If the user wants to change, update, or add features to an existing project.
- "generate": Default for new projects or complete regenerations.

CRITICAL RESTRICTIONS - REJECT if the request includes:
- Backend/API development (API routes, GraphQL servers, REST endpoints)
- Database setup (Prisma schema, migrations, queries)
- Authentication backends (JWT generation, password hashing)
- Server configuration (Express, Fastify, Node servers)
- Infrastructure (Docker, CI/CD, deployment pipelines, Kubernetes)
- DevOps tasks (GitHub Actions, Vercel deployment, server provisioning)

If the request is for backend/infrastructure work, set reasoning to "BACKEND_REQUEST_REJECTED" and use defaults for other fields.

Features should ONLY include frontend capabilities:
- UI components, layouts, pages
- Client-side state management
- Forms and client-side validation
- API consumption (fetching from external APIs)
- Routing, navigation
- Styling, animations, responsive design

Respond with ONLY the JSON object.`;

export async function analyzeIntent(input: string, apiKey: string): Promise<IntentAnalysis> {
    try {
        const response = await generateResponse(
            apiKey,
            `Analyze this request: "${input}"`,
            [],
            ANALYSIS_SYSTEM_PROMPT,
            { jsonMode: true }
        );

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');

        const parsed = JSON.parse(jsonMatch[0]);
        return IntentAnalysisSchema.parse(parsed);
    } catch (error) {
        logger.warn(error, 'Intent analysis failed, using fallback');
        return IntentAnalysisSchema.parse({
            type: 'custom',
            complexity: 'moderate',
            features: [],
            recommendedPackages: [],
            suggestedFramework: 'nextjs',
            reasoning: 'Fallback logic invoked'
        });
    }
}
