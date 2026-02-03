import { nanoid } from 'nanoid';
import type { Plan, PlanStep, PlanStatus, WorkflowStepType } from '../schemas.js';
import { WorkflowStep } from '../schemas.js';

const DEFAULT_STEPS: Array<Omit<PlanStep, 'id'>> = [
  { title: 'Analyze request', description: 'Understand requirements and constraints', status: 'pending' },
  { title: 'Resolve dependencies', description: 'Validate and select required packages', status: 'pending' },
  { title: 'Generate code', description: 'Create files and update sandbox', status: 'pending' },
  { title: 'Validate & build', description: 'Run validation and build preview', status: 'pending' },
  { title: 'Deliver preview', description: 'Make output available and summarize', status: 'pending' },
];

export function createFallbackPlan(): Plan {
  return {
    summary: 'Execute the request with safe, validated steps and produce a working preview.',
    steps: DEFAULT_STEPS.map(step => ({ ...step, id: nanoid(8) })),
    decisions: [],
    assumptions: [],
    lastUpdatedAt: Date.now(),
  };
}

export function normalizePlan(input: Partial<Plan>): Plan {
  const base = createFallbackPlan();
  const steps = (input.steps && input.steps.length > 0)
    ? input.steps.map(step => ({
        id: step.id || nanoid(8),
        title: step.title,
        description: step.description,
        status: step.status || 'pending',
      }))
    : base.steps;

  return {
    summary: input.summary || base.summary,
    steps,
    decisions: input.decisions || base.decisions,
    assumptions: input.assumptions || base.assumptions,
    lastUpdatedAt: Date.now(),
  };
}

export function updatePlanStepStatus(plan: Plan, matcher: (step: PlanStep) => boolean, status: PlanStatus): Plan {
  let changed = false;
  const steps = plan.steps.map(step => {
    if (matcher(step)) {
      changed = true;
      return { ...step, status };
    }
    return step;
  });

  if (!changed) return plan;
  return { ...plan, steps, lastUpdatedAt: Date.now() };
}

export function updatePlanForWorkflowStep(plan: Plan, workflowStep: WorkflowStepType, success: boolean): Plan {
  const status: PlanStatus = success ? 'done' : 'failed';
  const mapping: Record<WorkflowStepType, string[]> = {
    [WorkflowStep.PLAN]: ['Analyze request'],
    [WorkflowStep.ANALYZE]: ['Analyze request'],
    [WorkflowStep.RESOLVE_PACKAGES]: ['Resolve dependencies'],
    [WorkflowStep.INSTALL_PACKAGES]: ['Resolve dependencies'],
    [WorkflowStep.GENERATE]: ['Generate code'],
    [WorkflowStep.BUILD]: ['Validate & build'],
    [WorkflowStep.DEPLOY]: ['Deliver preview'],
    [WorkflowStep.RECOVER]: [],
  };

  const targets = mapping[workflowStep] || [];
  if (targets.length === 0) return plan;

  return updatePlanStepStatus(
    plan,
    step => targets.some(target => step.title.toLowerCase().includes(target.toLowerCase())),
    status
  );
}

export function markPlanStepInProgress(plan: Plan, titleIncludes: string): Plan {
  return updatePlanStepStatus(
    plan,
    step => step.title.toLowerCase().includes(titleIncludes.toLowerCase()),
    'in_progress'
  );
}

export function markPlanInProgressForWorkflowStep(plan: Plan, workflowStep: WorkflowStepType): Plan {
  const mapping: Record<WorkflowStepType, string[]> = {
    [WorkflowStep.PLAN]: ['Analyze request'],
    [WorkflowStep.ANALYZE]: ['Analyze request'],
    [WorkflowStep.RESOLVE_PACKAGES]: ['Resolve dependencies'],
    [WorkflowStep.INSTALL_PACKAGES]: ['Resolve dependencies'],
    [WorkflowStep.GENERATE]: ['Generate code'],
    [WorkflowStep.BUILD]: ['Validate & build'],
    [WorkflowStep.DEPLOY]: ['Deliver preview'],
    [WorkflowStep.RECOVER]: [],
  };

  const targets = mapping[workflowStep] || [];
  if (targets.length === 0) return plan;

  let updated = plan;
  for (const target of targets) {
    updated = markPlanStepInProgress(updated, target);
  }

  return updated;
}

export function appendPlanDecision(plan: Plan, decision: string): Plan {
  const decisions = [...plan.decisions, decision];
  return { ...plan, decisions, lastUpdatedAt: Date.now() };
}

export function appendPlanAssumption(plan: Plan, assumption: string): Plan {
  const assumptions = [...plan.assumptions, assumption];
  return { ...plan, assumptions, lastUpdatedAt: Date.now() };
}

export function mergePlanUpdate(existing: Plan, update: Plan): Plan {
  const steps: PlanStep[] = [];
  const byTitle = new Map(existing.steps.map(step => [step.title.toLowerCase(), step]));

  for (const step of update.steps) {
    const match = byTitle.get(step.title.toLowerCase());
    if (match) {
      steps.push({
        ...step,
        id: match.id,
        status: match.status === 'done' ? 'done' : step.status,
      });
    } else {
      steps.push({ ...step, id: step.id || nanoid(8) });
    }
  }

  return {
    summary: update.summary || existing.summary,
    steps: steps.length > 0 ? steps : existing.steps,
    decisions: update.decisions.length > 0 ? update.decisions : existing.decisions,
    assumptions: update.assumptions.length > 0 ? update.assumptions : existing.assumptions,
    lastUpdatedAt: Date.now(),
  };
}
