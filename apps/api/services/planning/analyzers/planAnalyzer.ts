import { nanoid } from 'nanoid';
import { generateResponse } from '../../../lib/llm/response.js';
import { logger } from '../../../utils/logger.js';
import { ensureError } from '../../../utils/error.js';
import { PlanSchema, PlanStatus, type Plan } from '../schemas.js';
import { createFallbackPlan, normalizePlan, mergePlanUpdate } from '../workflow/plan.js';

const PLAN_SYSTEM_PROMPT = `You are a technical planner for a FRONTEND-ONLY development assistant. Create an execution plan as a JSON object.

Required JSON structure:
{
  "summary": "One sentence describing what will be built",
  "steps": [
    { "id": "step-1", "title": "Verb + action", "description": "Details", "status": "pending" }
  ],
  "assumptions": ["assumption1"],
  "decisions": [],
  "lastUpdatedAt": 0
}

Rules:
- 5 to 8 steps, titles start with verbs (Analyze, Generate, Validate, etc.)
- All statuses must be "pending"
- lastUpdatedAt must be 0 (will be set by system)
- Be concise and production-oriented

CRITICAL RESTRICTIONS - Steps must ONLY include FRONTEND tasks:
✅ ALLOWED:
- Analyze requirements
- Generate UI components
- Create pages and layouts
- Implement forms and validation
- Add styling and animations
- Setup routing and navigation
- Integrate API calls (consuming external APIs)
- Test components
- Optimize performance

❌ FORBIDDEN - DO NOT include steps for:
- Backend/API development (building API endpoints, GraphQL servers)
- Database setup (Prisma, migrations, SQL schemas)
- Authentication backends (JWT, session management, password hashing)
- Server configuration (Express, Fastify, Node.js servers)
- CI/CD setup (GitHub Actions, pipelines)
- Deployment (Vercel, Docker, Kubernetes, cloud deployment)
- Infrastructure (server provisioning, Nginx, load balancers)
- DevOps tasks (monitoring, logging infrastructure)

If the request involves backend/infrastructure, create a plan that focuses ONLY on the frontend UI that would consume such services.

Respond with ONLY the JSON object.`;

const REFLECT_SYSTEM_PROMPT = `You are a planner revising an execution plan for a FRONTEND-ONLY development assistant. Update the plan based on the decision context.
Use the same JSON schema. Keep completed steps as "done". Be concise.
REMEMBER: Only include FRONTEND tasks (UI, components, styling, client-side logic). NO backend, infrastructure, or deployment steps.
Respond with ONLY the JSON object.`;

const RETRY_PROMPT = `Your previous response was not valid JSON. Respond with ONLY a valid JSON object matching the schema described in the system prompt. No markdown, no explanation, just the raw JSON.`;

function safeParsePlan(raw: string): Plan | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (Array.isArray(parsed.steps)) {
      parsed.steps = parsed.steps.map((step: Record<string, unknown>) => ({
        id: typeof step.id === 'string' && step.id ? step.id : nanoid(8),
        title: step.title,
        description: step.description,
        status: typeof step.status === 'string' ? step.status : PlanStatus.PENDING,
      }));
    }

    if (typeof parsed.lastUpdatedAt !== 'number') {
      parsed.lastUpdatedAt = Date.now();
    }

    if (!Array.isArray(parsed.decisions)) parsed.decisions = [];
    if (!Array.isArray(parsed.assumptions)) parsed.assumptions = [];

    return PlanSchema.parse(parsed);
  } catch (error) {
    logger.debug({ error: ensureError(error), raw }, 'Failed to parse plan JSON');
    return null;
  }
}

export async function generatePlan(userRequest: string, apiKey: string): Promise<Plan> {
  try {
    const response = await generateResponse(apiKey, userRequest, [], PLAN_SYSTEM_PROMPT, { jsonMode: true });
    const parsed = safeParsePlan(response);
    if (parsed) return normalizePlan(parsed);

    logger.info('Plan generation: first attempt failed to parse, retrying with nudge');
    const retryResponse = await generateResponse(apiKey, RETRY_PROMPT + '\n\nOriginal request: ' + userRequest, [], PLAN_SYSTEM_PROMPT, { jsonMode: true });
    const retryParsed = safeParsePlan(retryResponse);
    if (retryParsed) return normalizePlan(retryParsed);

    logger.warn('Plan generation: both attempts failed, using fallback');
    return createFallbackPlan();
  } catch (error) {
    logger.error(error, 'Plan generation failed');
    return createFallbackPlan();
  }
}

export async function reflectPlan(
  currentPlan: Plan,
  decisionContext: string,
  apiKey: string
): Promise<Plan> {
  try {
    const prompt = `Current Plan:\n${JSON.stringify(currentPlan, null, 2)}\n\nDecision Context:\n${decisionContext}`;
    const response = await generateResponse(apiKey, prompt, [], REFLECT_SYSTEM_PROMPT, { jsonMode: true });
    const parsed = safeParsePlan(response);
    if (!parsed) return currentPlan;

    const normalized = normalizePlan(parsed);
    return mergePlanUpdate(currentPlan, normalized);
  } catch (error) {
    logger.error(error, 'Plan reflection failed');
    return currentPlan;
  }
}
