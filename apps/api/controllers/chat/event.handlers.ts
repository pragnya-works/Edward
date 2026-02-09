import type { Response } from "express";
import { ParserEventType, type ParserEvent } from "../../schemas/chat.schema.js";
import {
    advanceWorkflow,
    ensureSandbox,
} from "../../services/planning/workflowEngine.js";
import { addSandboxPackages } from "../../services/sandbox/lifecycle/packages.js";
import {
    prepareSandboxFile,
    flushSandbox,
} from "../../services/sandbox/writes.sandbox.js";
import { executeSandboxCommand } from "../../services/sandbox/command.sandbox.js";
import { normalizeFramework } from "../../services/sandbox/templates/template.registry.js";
import {
    PlanStatus,
    PlanStepKey,
    type WorkflowState,
} from "../../services/planning/schemas.js";
import {
    markPlanStepInProgress,
    updatePlanStepStatus,
    isPlanComplete,
} from "../../services/planning/workflow/plan.js";
import { saveWorkflow } from "../../services/planning/workflow/store.js";
import {
    resolveDependencies,
    suggestAlternatives,
} from "../../services/planning/resolvers/dependency.resolver.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { safeSSEWrite, emitPlanUpdate, sendSSEError } from "./sse.utils.js";
import { handleFileContent } from "./file.handlers.js";
import type { CommandResult } from "./command.utils.js";
import type { PlanUpdateContext } from "./plan.utils.js";
import { updatePlanWithDecision } from "./plan.utils.js";

export interface EventHandlerContext {
    workflow: WorkflowState;
    res: Response;
    decryptedApiKey: string;
    userId: string;
    chatId: string;
    isFollowUp: boolean;
    currentFilePath: string | undefined;
    isFirstFileChunk: boolean;
    generatedFiles: Map<string, string>;
    declaredPackages: string[];
    commandResultsThisTurn: CommandResult[];
}

export interface EventHandlerResult {
    handled: boolean;
    currentFilePath: string | undefined;
    isFirstFileChunk: boolean;
}

function getPlanUpdateContext(ctx: EventHandlerContext): PlanUpdateContext {
    return {
        workflow: ctx.workflow,
        res: ctx.res,
        decryptedApiKey: ctx.decryptedApiKey,
        userId: ctx.userId,
        chatId: ctx.chatId,
    };
}

async function handleSandboxStart(ctx: EventHandlerContext): Promise<void> {
    if (!ctx.workflow.sandboxId) {
        await ensureSandbox(ctx.workflow, undefined, ctx.isFollowUp);
    }
    if (ctx.workflow.context.plan) {
        ctx.workflow.context.plan = markPlanStepInProgress(
            ctx.workflow.context.plan,
            PlanStepKey.GENERATE,
        );
        await saveWorkflow(ctx.workflow);
        emitPlanUpdate(ctx.res, ctx.workflow.context.plan);
    }
}

async function handleFileStart(
    ctx: EventHandlerContext,
    filePath: string,
): Promise<{ currentFilePath: string; isFirstFileChunk: boolean }> {
    if (!ctx.workflow.sandboxId) {
        await ensureSandbox(ctx.workflow, undefined, ctx.isFollowUp);
    }
    await prepareSandboxFile(ctx.workflow.sandboxId!, filePath);
    return { currentFilePath: filePath, isFirstFileChunk: true };
}

async function handleFileContentEvent(
    ctx: EventHandlerContext,
    content: string,
): Promise<boolean> {
    if (!ctx.workflow.sandboxId || !ctx.currentFilePath) return ctx.isFirstFileChunk;

    await handleFileContent(
        ctx.workflow.sandboxId,
        ctx.currentFilePath,
        content,
        ctx.isFirstFileChunk,
    );
    ctx.generatedFiles.set(
        ctx.currentFilePath,
        (ctx.generatedFiles.get(ctx.currentFilePath) || "") + content,
    );
    return false;
}

async function handleSandboxEnd(ctx: EventHandlerContext): Promise<void> {
    if (ctx.workflow.sandboxId) {
        await flushSandbox(ctx.workflow.sandboxId).catch((err: unknown) =>
            logger.error(
                ensureError(err),
                `Flush failed during SANDBOX_END: ${ctx.workflow.sandboxId}`,
            ),
        );
    }
}

async function handleInstallContent(
    ctx: EventHandlerContext,
    dependencies: string[] | undefined,
    framework: string | undefined,
): Promise<void> {
    if (dependencies) {
        ctx.declaredPackages.push(...dependencies);
    }
    if (framework) {
        const normalized = normalizeFramework(framework);
        if (normalized) {
            ctx.workflow.context.framework = normalized;
        }
    }
    if (!ctx.workflow.sandboxId) {
        await ensureSandbox(ctx.workflow, ctx.workflow.context.framework, ctx.isFollowUp);
    }

    const rawDependencies = dependencies || [];
    if (rawDependencies.length === 0) return;

    if (ctx.workflow.context.plan) {
        ctx.workflow.context.plan = markPlanStepInProgress(
            ctx.workflow.context.plan,
            PlanStepKey.RESOLVE_DEPS,
        );
        await saveWorkflow(ctx.workflow);
        emitPlanUpdate(ctx.res, ctx.workflow.context.plan);
    }

    const frameworkForResolution = ctx.workflow.context.framework || "vanilla";
    const resolution = await resolveDependencies(rawDependencies, frameworkForResolution);
    const validDeps = resolution.resolved.map((dep) => dep.name);

    if (resolution.failed.length > 0) {
        const failures = resolution.failed.map((dep) => dep.name).join(", ");
        const suggestions = resolution.failed
            .flatMap((dep) => suggestAlternatives(dep.name))
            .filter(Boolean);

        const message =
            `Invalid dependencies detected: ${failures}` +
            (suggestions.length > 0
                ? ` (suggested alternatives: ${Array.from(new Set(suggestions)).join(", ")})`
                : "");

        await updatePlanWithDecision(
            getPlanUpdateContext(ctx),
            `Dependency validation failed: ${message}`,
        );
        sendSSEError(ctx.res, message);
    }

    if (resolution.warnings.length > 0) {
        await updatePlanWithDecision(
            getPlanUpdateContext(ctx),
            `Dependency warnings: ${resolution.warnings.join("; ")}`,
        );
    }

    await advanceWorkflow(ctx.workflow, rawDependencies);
    if (ctx.workflow.sandboxId && validDeps.length > 0) {
        await addSandboxPackages(ctx.workflow.sandboxId, validDeps);
        if (ctx.workflow.context.plan) {
            ctx.workflow.context.plan = updatePlanStepStatus(
                ctx.workflow.context.plan,
                (step) => step.key === PlanStepKey.RESOLVE_DEPS,
                PlanStatus.DONE,
            );
            await saveWorkflow(ctx.workflow);
            emitPlanUpdate(ctx.res, ctx.workflow.context.plan);
        }
    }
}

async function handleCommand(
    ctx: EventHandlerContext,
    command: string,
    args: string[],
): Promise<void> {
    if (!ctx.workflow.sandboxId) {
        await ensureSandbox(ctx.workflow, undefined, ctx.isFollowUp);
    }

    try {
        const result = await executeSandboxCommand(ctx.workflow.sandboxId!, {
            command,
            args,
        });
        ctx.commandResultsThisTurn.push({
            command,
            args,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
        });
        safeSSEWrite(
            ctx.res,
            `data: ${JSON.stringify({
                type: ParserEventType.COMMAND,
                command,
                args,
                ...result,
            })}\n\n`,
        );
    } catch (cmdError) {
        const err = ensureError(cmdError);
        ctx.commandResultsThisTurn.push({
            command,
            args,
            stdout: "",
            stderr: `Command failed: ${err.message}`,
        });
        sendSSEError(ctx.res, `Command failed: ${err.message}`);
    }
}

async function handlePlanStepComplete(
    ctx: EventHandlerContext,
    stepId: string,
    status?: string,
): Promise<void> {
    if (!ctx.workflow.context.plan) return;

    const stepStatus = (status || PlanStatus.DONE) as (typeof PlanStatus)[keyof typeof PlanStatus];
    ctx.workflow.context.plan = updatePlanStepStatus(
        ctx.workflow.context.plan,
        (step) => step.id === stepId,
        stepStatus,
    );
    await saveWorkflow(ctx.workflow);
    emitPlanUpdate(ctx.res, ctx.workflow.context.plan);
    logger.info(
        {
            chatId: ctx.chatId,
            stepId,
            status: stepStatus,
            planComplete: isPlanComplete(ctx.workflow.context.plan),
        },
        "Plan step updated by LLM",
    );
}

export async function handleParserEvent(
    ctx: EventHandlerContext,
    event: ParserEvent,
): Promise<EventHandlerResult> {
    let handled = false;
    let { currentFilePath, isFirstFileChunk } = ctx;

    try {
        switch (event.type) {
            case ParserEventType.SANDBOX_START:
                await handleSandboxStart(ctx);
                break;

            case ParserEventType.FILE_START: {
                const result = await handleFileStart(ctx, event.path);
                currentFilePath = result.currentFilePath;
                isFirstFileChunk = result.isFirstFileChunk;
                break;
            }

            case ParserEventType.FILE_CONTENT:
                isFirstFileChunk = await handleFileContentEvent(ctx, event.content);
                break;

            case ParserEventType.FILE_END:
                currentFilePath = undefined;
                break;

            case ParserEventType.SANDBOX_END:
                await handleSandboxEnd(ctx);
                break;

            case ParserEventType.INSTALL_CONTENT:
                await handleInstallContent(ctx, event.dependencies, event.framework);
                break;

            case ParserEventType.COMMAND:
                await handleCommand(ctx, event.command, event.args ?? []);
                handled = true;
                break;

            case ParserEventType.PLAN_STEP_COMPLETE:
                if ("stepId" in event) {
                    await handlePlanStepComplete(
                        ctx,
                        event.stepId,
                        "status" in event ? event.status : undefined,
                    );
                }
                handled = true;
                break;
        }
    } catch (sandboxError) {
        logger.error(ensureError(sandboxError), "Sandbox operation failed during streaming");
        await updatePlanWithDecision(
            getPlanUpdateContext(ctx),
            `Sandbox operation failed during streaming: ${ensureError(sandboxError).message}`,
        );
        sendSSEError(ctx.res, "Sandbox execution failed");
    }

    return { handled, currentFilePath, isFirstFileChunk };
}

export async function handleFlushEvents(
    ctx: EventHandlerContext,
    events: ParserEvent[],
): Promise<EventHandlerResult> {
    let { currentFilePath, isFirstFileChunk } = ctx;

    for (const event of events) {
        try {
            switch (event.type) {
                case ParserEventType.FILE_START:
                    if (!ctx.workflow.sandboxId) {
                        logger.error("[Chat] FILE_START in flush without active sandbox");
                        break;
                    }
                    currentFilePath = event.path;
                    isFirstFileChunk = true;
                    await prepareSandboxFile(ctx.workflow.sandboxId, currentFilePath);
                    break;

                case ParserEventType.FILE_CONTENT:
                    if (ctx.workflow.sandboxId && currentFilePath) {
                        await handleFileContent(
                            ctx.workflow.sandboxId,
                            currentFilePath,
                            event.content,
                            isFirstFileChunk,
                        );
                        ctx.generatedFiles.set(
                            currentFilePath,
                            (ctx.generatedFiles.get(currentFilePath) || "") + event.content,
                        );
                        if (isFirstFileChunk) isFirstFileChunk = false;
                    }
                    break;

                case ParserEventType.FILE_END:
                    currentFilePath = undefined;
                    break;

                case ParserEventType.SANDBOX_END:
                    if (ctx.workflow.sandboxId) {
                        await flushSandbox(ctx.workflow.sandboxId).catch((err: unknown) =>
                            logger.error(
                                ensureError(err),
                                `Flush failed during SANDBOX_END: ${ctx.workflow.sandboxId}`,
                            ),
                        );
                    }
                    break;
            }
        } catch (sandboxError) {
            logger.error(ensureError(sandboxError), "Final sandbox operation failed");
            await updatePlanWithDecision(
                getPlanUpdateContext(ctx),
                `Final sandbox operation failed: ${ensureError(sandboxError).message}`,
            );
            continue;
        }
        safeSSEWrite(ctx.res, `data: ${JSON.stringify(event)}\n\n`);
    }

    return { handled: false, currentFilePath, isFirstFileChunk };
}
