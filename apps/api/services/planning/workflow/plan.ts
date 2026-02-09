import { nanoid } from "nanoid";
import type {
  Plan,
  PlanStep,
  PlanStatus as PlanStatusType,
  PlanStepKey as PlanStepKeyType,
  WorkflowStepType,
} from "../schemas.js";
import {
  PlanStatus,
  PlanStepKey,
  WORKFLOW_STEP_TO_PLAN_KEY,
} from "../schemas.js";

const DEFAULT_STEPS: Array<Omit<PlanStep, "id">> = [
  {
    title: "Analyze request",
    description: "Understand requirements and constraints",
    status: PlanStatus.PENDING,
    key: PlanStepKey.ANALYZE,
  },
  {
    title: "Resolve dependencies",
    description: "Validate and select required packages",
    status: PlanStatus.PENDING,
    key: PlanStepKey.RESOLVE_DEPS,
  },
  {
    title: "Generate code",
    description: "Create files and update sandbox",
    status: PlanStatus.PENDING,
    key: PlanStepKey.GENERATE,
  },
  {
    title: "Validate & build",
    description: "Run validation and build preview",
    status: PlanStatus.PENDING,
    key: PlanStepKey.VALIDATE_BUILD,
  },
  {
    title: "Deliver preview",
    description: "Make output available and summarize",
    status: PlanStatus.PENDING,
    key: PlanStepKey.DELIVER,
  },
];

export function createFallbackPlan(): Plan {
  return {
    summary:
      "Execute the request with safe, validated steps and produce a working preview.",
    steps: DEFAULT_STEPS.map((step) => ({ ...step, id: nanoid(8) })),
    decisions: [],
    assumptions: [],
    lastUpdatedAt: Date.now(),
  };
}

export function normalizePlan(input: Partial<Plan>): Plan {
  const base = createFallbackPlan();
  const steps =
    input.steps && input.steps.length > 0
      ? input.steps.map((step) => ({
          id: step.id || nanoid(8),
          title: step.title,
          description: step.description,
          status: step.status || PlanStatus.PENDING,
          key: step.key,
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

export function updatePlanStepStatus(
  plan: Plan,
  matcher: (step: PlanStep) => boolean,
  status: PlanStatus,
): Plan {
  let changed = false;
  const steps = plan.steps.map((step) => {
    if (matcher(step)) {
      changed = true;
      return { ...step, status };
    }
    return step;
  });

  if (!changed) return plan;
  return { ...plan, steps, lastUpdatedAt: Date.now() };
}

export function updatePlanForWorkflowStep(
  plan: Plan,
  workflowStep: WorkflowStepType,
  success: boolean,
): Plan {
  const status: PlanStatusType = success ? PlanStatus.DONE : PlanStatus.FAILED;
  const targetKey = WORKFLOW_STEP_TO_PLAN_KEY[workflowStep];
  if (!targetKey) return plan;

  return updatePlanStepStatus(plan, (step) => step.key === targetKey, status);
}

export function markPlanStepInProgress(
  plan: Plan,
  stepKey: PlanStepKeyType,
): Plan {
  return updatePlanStepStatus(
    plan,
    (step) => step.key === stepKey,
    PlanStatus.IN_PROGRESS,
  );
}

export function markPlanInProgressForWorkflowStep(
  plan: Plan,
  workflowStep: WorkflowStepType,
): Plan {
  const targetKey = WORKFLOW_STEP_TO_PLAN_KEY[workflowStep];
  if (!targetKey) return plan;

  return markPlanStepInProgress(plan, targetKey);
}

export function appendPlanDecision(plan: Plan, decision: string): Plan {
  const decisions = [...plan.decisions, decision];
  return { ...plan, decisions, lastUpdatedAt: Date.now() };
}

export function mergePlanUpdate(existing: Plan, update: Plan): Plan {
  const steps: PlanStep[] = [];
  const byTitle = new Map(
    existing.steps.map((step) => [step.title.toLowerCase(), step]),
  );

  for (const step of update.steps) {
    const match = byTitle.get(step.title.toLowerCase());
    if (match) {
      steps.push({
        ...step,
        id: match.id,
        status:
          match.status === PlanStatus.DONE ? PlanStatus.DONE : step.status,
      });
    } else {
      steps.push({ ...step, id: step.id || nanoid(8) });
    }
  }

  return {
    summary: update.summary || existing.summary,
    steps: steps.length > 0 ? steps : existing.steps,
    decisions:
      update.decisions.length > 0 ? update.decisions : existing.decisions,
    assumptions:
      update.assumptions.length > 0 ? update.assumptions : existing.assumptions,
    lastUpdatedAt: Date.now(),
  };
}

export function isPlanComplete(plan: Plan | undefined | null): boolean {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return true;
  }

  return plan.steps.every(
    (step) =>
      step.status === PlanStatus.DONE || step.status === PlanStatus.FAILED,
  );
}

export function getIncompleteSteps(plan: Plan | undefined | null): PlanStep[] {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return [];
  }

  return plan.steps.filter(
    (step) =>
      step.status === PlanStatus.PENDING ||
      step.status === PlanStatus.IN_PROGRESS ||
      step.status === PlanStatus.BLOCKED,
  );
}

export function markRemainingStepsAsFailed(plan: Plan, reason: string): Plan {
  const incompleteSteps = getIncompleteSteps(plan);

  if (incompleteSteps.length === 0) {
    return plan;
  }

  let updatedPlan = plan;

  for (const incompleteStep of incompleteSteps) {
    updatedPlan = updatePlanStepStatus(
      updatedPlan,
      (step) => step.id === incompleteStep.id,
      PlanStatus.FAILED,
    );
  }

  updatedPlan = appendPlanDecision(
    updatedPlan,
    `${incompleteSteps.length} step(s) not completed: ${reason}`,
  );
  return updatedPlan;
}

export function hasCriticalFailures(plan: Plan | undefined | null): boolean {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return false;
  }

  const criticalStepKeys: PlanStepKeyType[] = [
    PlanStepKey.GENERATE,
    PlanStepKey.VALIDATE_BUILD,
  ];

  return plan.steps.some(
    (step) =>
      step.status === PlanStatus.FAILED &&
      step.key != null &&
      criticalStepKeys.includes(step.key),
  );
}

export function getPlanCompletionSummary(plan: Plan | undefined | null): {
  isComplete: boolean;
  totalSteps: number;
  done: number;
  failed: number;
  pending: number;
  inProgress: number;
  blocked: number;
  hasCriticalFailures: boolean;
} {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return {
      isComplete: true,
      totalSteps: 0,
      done: 0,
      failed: 0,
      pending: 0,
      inProgress: 0,
      blocked: 0,
      hasCriticalFailures: false,
    };
  }

  const summary = {
    isComplete: isPlanComplete(plan),
    totalSteps: plan.steps.length,
    done: plan.steps.filter((s) => s.status === PlanStatus.DONE).length,
    failed: plan.steps.filter((s) => s.status === PlanStatus.FAILED).length,
    pending: plan.steps.filter((s) => s.status === PlanStatus.PENDING).length,
    inProgress: plan.steps.filter((s) => s.status === PlanStatus.IN_PROGRESS)
      .length,
    blocked: plan.steps.filter((s) => s.status === PlanStatus.BLOCKED).length,
    hasCriticalFailures: hasCriticalFailures(plan),
  };

  return summary;
}
