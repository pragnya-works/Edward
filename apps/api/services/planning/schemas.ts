import { z } from 'zod';

export const WorkflowStep = {
    ANALYZE: 'ANALYZE',
    RESOLVE_PACKAGES: 'RESOLVE_PACKAGES',
    INSTALL_PACKAGES: 'INSTALL_PACKAGES',
    GENERATE: 'GENERATE',
    BUILD: 'BUILD',
    DEPLOY: 'DEPLOY',
    RECOVER: 'RECOVER'
} as const;

const WorkflowStepTypeSchema = z.nativeEnum(WorkflowStep);

export const WorkflowStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed'
} as const;

const WorkflowStatusSchema = z.nativeEnum(WorkflowStatus);

const ExecutorTypeSchema = z.enum(['llm', 'worker', 'hybrid']);

const FrameworkSchema = z.enum(['nextjs', 'vite-react', 'vanilla']);

const ComplexitySchema = z.enum(['simple', 'moderate', 'complex']);

const PackageInfoSchema = z.object({
    name: z.string(),
    version: z.string(),
    valid: z.boolean(),
    error: z.string().optional(),
    peerDependencies: z.record(z.string()).optional()
});

export const IntentAnalysisSchema = z.object({
    type: z.enum(['landing', 'dashboard', 'portfolio', 'ecommerce', 'blog', 'custom']),
    complexity: ComplexitySchema,
    features: z.array(z.string()),
    recommendedPackages: z.array(z.string()).default([]),
    suggestedFramework: FrameworkSchema,
    reasoning: z.string()
});

const StepResultSchema = z.object({
    step: WorkflowStepTypeSchema,
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
    durationMs: z.number(),
    retryCount: z.number().default(0)
});

const WorkflowContextSchema = z.object({
    userRequest: z.string().optional(),
    intent: IntentAnalysisSchema.optional(),
    framework: FrameworkSchema.optional(),
    resolvedPackages: z.array(PackageInfoSchema).optional(),
    generatedFiles: z.array(z.string()).optional(),
    buildDirectory: z.string().optional(),
    previewUrl: z.string().optional(),
    errors: z.array(z.string()).default([])
});

export const WorkflowStateSchema = z.object({
    id: z.string(),
    userId: z.string(),
    chatId: z.string(),
    sandboxId: z.string().optional(),
    status: WorkflowStatusSchema,
    currentStep: WorkflowStepTypeSchema,
    context: WorkflowContextSchema,
    history: z.array(StepResultSchema),
    createdAt: z.number(),
    updatedAt: z.number()
});

const PhaseConfigSchema = z.object({
    name: WorkflowStepTypeSchema,
    executor: ExecutorTypeSchema,
    maxRetries: z.number().default(3),
    timeoutMs: z.number().default(60000)
});

export type WorkflowStepType = z.infer<typeof WorkflowStepTypeSchema>;
export type Framework = z.infer<typeof FrameworkSchema>;
export type Complexity = z.infer<typeof ComplexitySchema>;
export type IntentAnalysis = z.infer<typeof IntentAnalysisSchema>;
export type PackageInfo = z.infer<typeof PackageInfoSchema>;
export type StepResult = z.infer<typeof StepResultSchema>;
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type PhaseConfig = z.infer<typeof PhaseConfigSchema>;
