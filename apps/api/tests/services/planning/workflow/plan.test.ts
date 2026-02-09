import { describe, it, expect } from 'vitest';
import {
  createFallbackPlan,
  normalizePlan,
  updatePlanStepStatus,
  isPlanComplete,
  getIncompleteSteps,
  markRemainingStepsAsFailed,
  hasCriticalFailures,
  getPlanCompletionSummary,
  markPlanStepInProgress,
} from '../../../../services/planning/workflow/plan.js';
import type { Plan, PlanStep } from '../../../../services/planning/schemas.js';
import { PlanStepKey } from '../../../../services/planning/schemas.js';

describe('Plan Utilities', () => {
  describe('createFallbackPlan', () => {
    it('should create a plan with default steps', () => {
      const plan = createFallbackPlan();
      
      expect(plan.summary).toBeTruthy();
      expect(plan.steps).toHaveLength(5);
      expect(plan.decisions).toEqual([]);
      expect(plan.assumptions).toEqual([]);
      expect(plan.lastUpdatedAt).toBeGreaterThan(0);
      
      plan.steps.forEach(step => {
        expect(step.id).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.status).toBe('pending');
      });
    });
  });

  describe('normalizePlan', () => {
    it('should normalize a partial plan with custom steps', () => {
      const input: Partial<Plan> = {
        summary: 'Custom summary',
        steps: [
          { id: 'step-1', title: 'Custom step', status: 'done' },
        ],
      };
      
      const result = normalizePlan(input);
      
      expect(result.summary).toBe('Custom summary');
      expect(result.steps).toHaveLength(1);
      expect(result.steps.length).toBeGreaterThan(0);
      if (result.steps.length > 0) {
        expect(result.steps[0]!.title).toBe('Custom step');
        expect(result.steps[0]!.status).toBe('done');
      }
    });

    it('should use fallback steps when no steps provided', () => {
      const input: Partial<Plan> = {
        summary: 'Test summary',
        steps: [],
      };
      
      const result = normalizePlan(input);
      
      expect(result.steps).toHaveLength(5);
    });

    it('should generate IDs for steps without them', () => {
      const input: Partial<Plan> = {
        steps: [
          { title: 'No ID step', status: 'pending' } as PlanStep,
        ],
      };
      
      const result = normalizePlan(input);
      
      expect(result.steps.length).toBeGreaterThan(0);
      if (result.steps.length > 0) {
        expect(result.steps[0]!.id).toBeTruthy();
      }
    });
  });

  describe('isPlanComplete', () => {
    it('should return true when plan is undefined', () => {
      expect(isPlanComplete(undefined)).toBe(true);
    });

    it('should return true when plan is null', () => {
      expect(isPlanComplete(null)).toBe(true);
    });

    it('should return true when all steps are done', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'done' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(isPlanComplete(plan)).toBe(true);
    });

    it('should return true when all steps are done or failed', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'failed' },
          { id: '3', title: 'Step 3', status: 'done' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(isPlanComplete(plan)).toBe(true);
    });

    it('should return false when any step is pending', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'pending' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(isPlanComplete(plan)).toBe(false);
    });

    it('should return false when any step is in_progress', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'in_progress' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(isPlanComplete(plan)).toBe(false);
    });

    it('should return false when any step is blocked', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'blocked' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(isPlanComplete(plan)).toBe(false);
    });
  });

  describe('getIncompleteSteps', () => {
    it('should return empty array when plan is undefined', () => {
      expect(getIncompleteSteps(undefined)).toEqual([]);
    });

    it('should return empty array when plan is null', () => {
      expect(getIncompleteSteps(null)).toEqual([]);
    });

    it('should return empty array when all steps are complete', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'failed' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(getIncompleteSteps(plan)).toEqual([]);
    });

    it('should return pending steps', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'pending' },
          { id: '3', title: 'Step 3', status: 'done' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const incomplete = getIncompleteSteps(plan);
      
      expect(incomplete).toHaveLength(1);
      expect(incomplete.length).toBeGreaterThan(0);
      if (incomplete.length > 0) {
        expect(incomplete[0]!.id).toBe('2');
        expect(incomplete[0]!.status).toBe('pending');
      }
    });

    it('should return all incomplete steps (pending, in_progress, blocked)', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'pending' },
          { id: '3', title: 'Step 3', status: 'in_progress' },
          { id: '4', title: 'Step 4', status: 'blocked' },
          { id: '5', title: 'Step 5', status: 'failed' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const incomplete = getIncompleteSteps(plan);
      
      expect(incomplete).toHaveLength(3);
      expect(incomplete.map(s => s.status)).toEqual(['pending', 'in_progress', 'blocked']);
    });
  });

  describe('markRemainingStepsAsFailed', () => {
    it('should mark incomplete steps as failed', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'pending' },
          { id: '3', title: 'Step 3', status: 'in_progress' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const result = markRemainingStepsAsFailed(plan, 'Test reason');
      
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
      if (result.steps.length >= 3) {
        expect(result.steps[0]!.status).toBe('done');
        expect(result.steps[1]!.status).toBe('failed');
        expect(result.steps[2]!.status).toBe('failed');
      }
      expect(result.decisions.length).toBeGreaterThan(0);
      expect(result.decisions[result.decisions.length - 1]).toContain('Test reason');
    });

    it('should return unchanged plan when all steps are complete', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'done' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const result = markRemainingStepsAsFailed(plan, 'Test reason');
      
      expect(result).toBe(plan);
    });

    it('should add decision with count and reason', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'pending' },
          { id: '2', title: 'Step 2', status: 'pending' },
          { id: '3', title: 'Step 3', status: 'blocked' },
        ],
        decisions: ['Previous decision'],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const result = markRemainingStepsAsFailed(plan, 'Stream timeout');
      
      expect(result.decisions).toHaveLength(2);
      expect(result.decisions[1]).toContain('3 step(s)');
      expect(result.decisions[1]).toContain('Stream timeout');
    });
  });

  describe('hasCriticalFailures', () => {
    it('should return false when plan is undefined', () => {
      expect(hasCriticalFailures(undefined)).toBe(false);
    });

    it('should return false when plan is null', () => {
      expect(hasCriticalFailures(null)).toBe(false);
    });

    it('should return false when no critical steps have failed', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Analyze request', status: 'failed', key: PlanStepKey.ANALYZE },
          { id: '2', title: 'Generate code', status: 'done', key: PlanStepKey.GENERATE },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(hasCriticalFailures(plan)).toBe(false);
    });

    it('should return true when generate step fails', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Analyze request', status: 'done', key: PlanStepKey.ANALYZE },
          { id: '2', title: 'Generate code', status: 'failed', key: PlanStepKey.GENERATE },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(hasCriticalFailures(plan)).toBe(true);
    });

    it('should return true when build step fails', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Generate code', status: 'done', key: PlanStepKey.GENERATE },
          { id: '2', title: 'Validate & build', status: 'failed', key: PlanStepKey.VALIDATE_BUILD },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(hasCriticalFailures(plan)).toBe(true);
    });

    it('should detect critical failures via key regardless of title', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Arbitrary Title', status: 'failed', key: PlanStepKey.GENERATE },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(hasCriticalFailures(plan)).toBe(true);
    });
  });

  describe('getPlanCompletionSummary', () => {
    it('should return empty summary when plan is undefined', () => {
      const summary = getPlanCompletionSummary(undefined);
      
      expect(summary.isComplete).toBe(true);
      expect(summary.totalSteps).toBe(0);
      expect(summary.done).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.inProgress).toBe(0);
      expect(summary.blocked).toBe(0);
      expect(summary.hasCriticalFailures).toBe(false);
    });

    it('should return correct metrics for mixed status plan', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Step 2', status: 'done' },
          { id: '3', title: 'Step 3', status: 'failed' },
          { id: '4', title: 'Step 4', status: 'pending' },
          { id: '5', title: 'Step 5', status: 'in_progress' },
          { id: '6', title: 'Step 6', status: 'blocked' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const summary = getPlanCompletionSummary(plan);
      
      expect(summary.isComplete).toBe(false);
      expect(summary.totalSteps).toBe(6);
      expect(summary.done).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.inProgress).toBe(1);
      expect(summary.blocked).toBe(1);
    });

    it('should mark plan as complete when all are done/failed', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'done' },
          { id: '2', title: 'Generate code', status: 'failed', key: PlanStepKey.GENERATE },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const summary = getPlanCompletionSummary(plan);
      
      expect(summary.isComplete).toBe(true);
      expect(summary.hasCriticalFailures).toBe(true);
    });

    it('should correctly identify critical failures', () => {
      const planWithCriticalFailure: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Validate & build', status: 'failed', key: PlanStepKey.VALIDATE_BUILD },
          { id: '2', title: 'Other step', status: 'done' },
        ],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      const summary = getPlanCompletionSummary(planWithCriticalFailure);
      expect(summary.hasCriticalFailures).toBe(true);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle plan with empty steps array', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [],
        decisions: [],
        assumptions: [],
        lastUpdatedAt: Date.now(),
      };
      
      expect(isPlanComplete(plan)).toBe(true);
      expect(getIncompleteSteps(plan)).toEqual([]);
      expect(hasCriticalFailures(plan)).toBe(false);
      
      const summary = getPlanCompletionSummary(plan);
      expect(summary.isComplete).toBe(true);
      expect(summary.totalSteps).toBe(0);
    });

    it('should handle workflow simulation: marking steps in progress then done', () => {
      let plan = createFallbackPlan();
      
      expect(isPlanComplete(plan)).toBe(false);
      expect(getIncompleteSteps(plan)).toHaveLength(5);
      plan = markPlanStepInProgress(plan, PlanStepKey.ANALYZE);
      expect(plan.steps.length).toBeGreaterThan(0);
      if (plan.steps.length > 0) {
        expect(plan.steps[0]!.status).toBe('in_progress');
      }
      expect(isPlanComplete(plan)).toBe(false);
      
      plan = updatePlanStepStatus(plan, s => s.key === PlanStepKey.ANALYZE, 'done');
      if (plan.steps.length > 0) {
        expect(plan.steps[0]!.status).toBe('done');
      }
      expect(isPlanComplete(plan)).toBe(false);
      
      plan.steps.forEach((_, i) => {
        if (plan.steps[i] && plan.steps[i]!.status !== 'done') {
          plan = updatePlanStepStatus(plan, s => s.id === plan.steps[i]!.id, 'done');
        }
      });
      
      expect(isPlanComplete(plan)).toBe(true);
      expect(getIncompleteSteps(plan)).toEqual([]);
    });

    it('should handle early termination scenario correctly', () => {
      let plan = createFallbackPlan();
      
      plan = updatePlanStepStatus(plan, s => s.key === PlanStepKey.ANALYZE, 'done');
      plan = updatePlanStepStatus(plan, s => s.key === PlanStepKey.RESOLVE_DEPS, 'done');
      
      expect(isPlanComplete(plan)).toBe(false);
      const incomplete = getIncompleteSteps(plan);
      expect(incomplete).toHaveLength(3);
      plan = markRemainingStepsAsFailed(plan, 'Stream timeout');
      
      expect(isPlanComplete(plan)).toBe(true);
      expect(getIncompleteSteps(plan)).toEqual([]);
      expect(plan.steps.filter(s => s.status === 'failed')).toHaveLength(3);
    });

    it('should preserve decisions and assumptions when marking steps failed', () => {
      const plan: Plan = {
        summary: 'Test',
        steps: [
          { id: '1', title: 'Step 1', status: 'pending' },
        ],
        decisions: ['Initial decision'],
        assumptions: ['Initial assumption'],
        lastUpdatedAt: Date.now(),
      };
      
      const result = markRemainingStepsAsFailed(plan, 'Test reason');
      
      expect(result.decisions).toContain('Initial decision');
      expect(result.assumptions).toContain('Initial assumption');
      expect(result.decisions.length).toBe(2);
    });
  });
});
