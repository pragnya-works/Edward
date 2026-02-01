import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { getContainer, execCommand, CONTAINER_WORKDIR } from '../sandbox/docker.sandbox.js';

const ValidationStageSchema = z.enum(['syntax', 'imports', 'types', 'build']);
type ValidationStage = z.infer<typeof ValidationStageSchema>;

const ValidationErrorSchema = z.object({
    stage: ValidationStageSchema,
    file: z.string().optional(),
    line: z.number().optional(),
    message: z.string(),
    ruleId: z.string().optional()
});

const ValidationResultSchema = z.object({
    valid: z.boolean(),
    stage: ValidationStageSchema.optional(),
    errors: z.array(ValidationErrorSchema).default([]),
    retryPrompt: z.string().optional()
});

type ValidationError = z.infer<typeof ValidationErrorSchema>;
type ValidationResult = z.infer<typeof ValidationResultSchema>;

async function runContainerCommand(
    containerId: string,
    command: string[],
    timeoutMs = 30000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const container = getContainer(containerId);
    return execCommand(container, command, false, timeoutMs, undefined, CONTAINER_WORKDIR);
}

async function validateSyntax(containerId: string, _sandboxId: string): Promise<ValidationResult> {
    const result = await runContainerCommand(containerId, [
        'sh', '-c',
        'find src -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" 2>/dev/null | head -20 | xargs -I{} sh -c "node --check {} 2>&1 || true"'
    ]);

    if (result.exitCode !== 0 && result.stderr) {
        const errors = parseSyntaxErrors(result.stderr);
        return { valid: false, stage: 'syntax', errors };
    }

    return { valid: true, errors: [] };
}

function parseSyntaxErrors(output: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
        const match = line.match(/^(.+):(\d+):\s*(.+)$/);
        if (match && match[1] && match[2] && match[3]) {
            errors.push({
                stage: 'syntax',
                file: match[1],
                line: parseInt(match[2], 10),
                message: match[3]
            });
        } else if (line.includes('SyntaxError') || line.includes('error')) {
            errors.push({ stage: 'syntax', message: line });
        }
    }

    return errors;
}

async function validateTypes(containerId: string, _sandboxId: string): Promise<ValidationResult> {
    const result = await runContainerCommand(containerId, [
        'sh', '-c',
        'if [ -f tsconfig.json ]; then pnpm tsc --noEmit 2>&1 | head -50; else echo "no-ts"; fi'
    ], 60000);

    if (result.stdout.includes('no-ts')) {
        return { valid: true, errors: [] };
    }

    if (result.exitCode !== 0) {
        const errors = parseTypeErrors(result.stdout + result.stderr);
        return { valid: false, stage: 'types', errors };
    }

    return { valid: true, errors: [] };
}

function parseTypeErrors(output: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
        const match = line.match(/^(.+)\((\d+),\d+\):\s*error\s+(\w+):\s*(.+)$/);
        if (match && match[1] && match[2] && match[3] && match[4]) {
            errors.push({
                stage: 'types',
                file: match[1],
                line: parseInt(match[2], 10),
                ruleId: match[3],
                message: match[4]
            });
        }
    }

    return errors;
}

async function validateBuild(_containerId: string, sandboxId: string): Promise<ValidationResult> {
    logger.debug({ sandboxId }, 'Skipping build validation in pipeline - handled by builder.service');
    return { valid: true, errors: [] };
}

function generateRetryPrompt(errors: ValidationError[], originalRequest: string): string {
    const errorList = errors.slice(0, 10).map(e =>
        `- ${e.file ? `${e.file}:${e.line}: ` : ''}${e.message}`
    ).join('\n');

    return `The previous code generation failed validation.

Errors found (${errors[0]?.stage || 'unknown'} stage):
${errorList}

Please fix these issues. Original request: ${originalRequest}

Focus on:
${errors[0]?.stage === 'syntax' ? '- Fix syntax errors (missing brackets, semicolons, etc.)' : ''}
${errors[0]?.stage === 'imports' ? '- Use correct import paths' : ''}
${errors[0]?.stage === 'types' ? '- Add proper TypeScript types' : ''}`;
}

export async function runValidationPipeline(
    containerId: string,
    sandboxId: string,
    originalRequest = ''
): Promise<ValidationResult> {
    const stages: { name: ValidationStage; validate: typeof validateSyntax }[] = [
        { name: 'syntax', validate: validateSyntax },
        { name: 'types', validate: validateTypes },
        { name: 'build', validate: validateBuild }
    ];

    try {
        for (const stage of stages) {
            logger.debug({ sandboxId, stage: stage.name }, 'Running validation stage');
            const result = await stage.validate(containerId, sandboxId);

            if (!result.valid) {
                logger.warn({ sandboxId, stage: stage.name, errorCount: result.errors.length }, 'Validation failed');
                return {
                    valid: false,
                    stage: stage.name,
                    errors: result.errors,
                    retryPrompt: generateRetryPrompt(result.errors, originalRequest)
                };
            }
        }

        logger.info({ sandboxId }, 'All validation stages passed');
        return { valid: true, errors: [] };
    } catch (error) {
        logger.error({ error, sandboxId }, 'Validation pipeline failed');
        return {
            valid: false,
            stage: 'syntax',
            errors: [{ stage: 'syntax', message: error instanceof Error ? error.message : 'Validation failed' }]
        };
    }
}

export async function quickSyntaxCheck(
    containerId: string,
    filePath: string
): Promise<{ valid: boolean; error?: string }> {
    try {
        const result = await runContainerCommand(containerId, [
            'node', '--check', `${CONTAINER_WORKDIR}/${filePath}`
        ]);

        if (result.exitCode !== 0) {
            return { valid: false, error: result.stderr || result.stdout };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : 'Syntax check failed' };
    }
}
