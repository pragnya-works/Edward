import { nanoid } from 'nanoid';
import { generateResponse } from '../../../lib/llm/response.js';
import { logger } from '../../../utils/logger.js';
import { ensureError } from '../../../utils/error.js';
import { PlanSchema, type Plan } from '../schemas.js';
import { createFallbackPlan, normalizePlan, mergePlanUpdate } from '../workflow/plan.js';

const PLAN_SYSTEM_PROMPT = `You are a senior technical planner. Produce a concise execution plan BEFORE any tools are used.
Respond ONLY with JSON and nothing else.

JSON Schema:
{
  "summary": string,
  "steps": [
    {
      "id": string,
      "title": string,
      "description": string,
      "status": "pending" | "in_progress" | "done" | "blocked" | "failed"
    }
  ],
  "assumptions": string[],
  "decisions": string[],
  "lastUpdatedAt": number
}

Rules:
- 5 to 8 steps
- Start titles with verbs (Analyze, Resolve, Generate, Validate, Deliver, etc.)
- All statuses MUST be "pending"
- lastUpdatedAt MUST be a number (milliseconds)
- Be explicit, production-oriented, and efficient
`;

const REFLECT_SYSTEM_PROMPT = `You are a senior planner revising a plan due to a decision point.
Respond ONLY with JSON and nothing else.
Use the same schema as the original plan.
Update steps only if needed and keep completed steps as done when possible.
Keep the plan concise and actionable.`;

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
        status: typeof step.status === 'string' ? step.status : 'pending',
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
    const response = await generateResponse(apiKey, userRequest, [], PLAN_SYSTEM_PROMPT);
    const parsed = safeParsePlan(response);
    if (!parsed) return createFallbackPlan();

    return normalizePlan(parsed);
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
    const response = await generateResponse(apiKey, prompt, [], REFLECT_SYSTEM_PROMPT);
    const parsed = safeParsePlan(response);
    if (!parsed) return currentPlan;

    const normalized = normalizePlan(parsed);
    return mergePlanUpdate(currentPlan, normalized);
  } catch (error) {
    logger.error(error, 'Plan reflection failed');
    return currentPlan;
  }
}
