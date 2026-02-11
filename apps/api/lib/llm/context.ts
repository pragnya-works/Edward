import { db, message, eq, desc, getLatestBuildByChatId } from '@edward/auth';
import { getActiveSandbox } from '../../services/sandbox/lifecycle/provisioning.js';
import { readAllProjectFiles, readSpecificFiles, formatProjectSnapshot } from '../../services/sandbox/read.sandbox.js';
import { logger } from '../../utils/logger.js';
import { DiagnosticMethod } from '../../services/diagnostics/types.js';
import type { Diagnostic } from '../../services/diagnostics/types.js';

const MAX_CONTEXT_BYTES = 150 * 1024;

export async function buildConversationContext(chatId: string) {
    const history = await db.query.message.findMany({
        where: eq(message.chatId, chatId),
        orderBy: [desc(message.createdAt)],
        limit: 10,
    });
    history.reverse();

    const latestBuild = await getLatestBuildByChatId(chatId);

    let context = 'CONVERSATION CONTEXT:\n';

    for (const msg of history) {
        context += `${msg.role.toUpperCase()}: ${msg.content}\n`;
    }

    const buildError = latestBuild?.status === 'failed' ? (latestBuild.errorLog ?? undefined) : undefined;
    const errorMetadata = (() => {
        if (latestBuild?.status !== 'failed' || !latestBuild.errorMetadata) return null;
        const raw = latestBuild.errorMetadata as Record<string, unknown>;
        if (
            Array.isArray(raw.diagnostics) &&
            typeof raw.method === 'string' &&
            Object.values(DiagnosticMethod).includes(raw.method as DiagnosticMethod) &&
            typeof raw.confidence === 'number'
        ) {
            return {
                diagnostics: raw.diagnostics as Diagnostic[],
                method: raw.method as DiagnosticMethod,
                confidence: raw.confidence,
            };
        }
        logger.warn({ chatId }, 'Error metadata failed structural validation');
        return null;
    })();

    if (latestBuild && latestBuild.status === 'failed') {
        if (errorMetadata && errorMetadata.diagnostics.length > 0) {
            const primary = errorMetadata.diagnostics[0];
            context += `\nBUILD ERROR ANALYSIS:\n`;
            context += `Category: ${primary?.category}\n`;
            if (primary?.file) {
                context += `Primary Suspect: ${primary.file}\n`;
            }

            const affectedFiles = errorMetadata.diagnostics
                .map((d: Diagnostic) => d.file)
                .filter((f): f is string => typeof f === 'string');
            if (affectedFiles.length > 0) {
                context += `Affected Files: ${affectedFiles.join(', ')}\n`;
            }

            const locations = errorMetadata.diagnostics
                .filter((d: Diagnostic) => d.file && d.line)
                .map((d: Diagnostic) => `${d.file}:${d.line}${d.column ? `:${d.column}` : ''}`);
            if (locations.length > 0) {
                context += `Error Locations: ${locations.join(', ')}\n`;
            }

            if (primary?.ruleId) {
                context += `Error Code: ${primary.ruleId}\n`;
            }

            context += `Confidence: ${errorMetadata.confidence}%\n`;
            context += `Diagnostic Method: ${errorMetadata.method}\n`;
            context += `\nError Messages:\n`;
            for (const d of errorMetadata.diagnostics) {
                context += `  - [${d.severity}] ${d.message}\n`;
            }
        } else {
            context += `\nLATEST BUILD FAILED:\nError Log:\n${buildError}\n`;
        }
    }

    const sandboxId = await getActiveSandbox(chatId);
    if (sandboxId) {
        try {
            let projectFiles: Map<string, string>;
            const affectedFiles = errorMetadata
                ? errorMetadata.diagnostics
                    .map((d: Diagnostic) => d.file)
                    .filter((f): f is string => typeof f === 'string')
                : [];
            if (affectedFiles.length > 0) {
                logger.debug(
                    { chatId, fileCount: affectedFiles.length },
                    'Using targeted file context from error metadata'
                );
                projectFiles = await readSpecificFiles(sandboxId, affectedFiles);
            } else if (buildError) {
                logger.debug({ chatId }, 'Using full file context with reordering');
                projectFiles = await readAllProjectFiles(sandboxId);
                projectFiles = reorderByErrorRefs(projectFiles, buildError);
            } else {
                projectFiles = await readAllProjectFiles(sandboxId);
            }

            const snapshot = formatProjectSnapshot(projectFiles);
            const currentBytes = Buffer.byteLength(context, 'utf8');
            if (snapshot && currentBytes + Buffer.byteLength(snapshot, 'utf8') <= MAX_CONTEXT_BYTES) {
                context += '\n\n' + snapshot;
            }
        } catch (err) {
            logger.warn({ sandboxId, err }, 'Failed to pre-load project files into context');
        }
    }

    return context;
}

function reorderByErrorRefs(
    files: Map<string, string>,
    errorLog: string,
): Map<string, string> {
    const refPaths = extractErrorFilePaths(errorLog);
    if (refPaths.length === 0) return files;

    const reordered = new Map<string, string>();
    for (const rp of refPaths) {
        for (const [key, val] of files) {
            if (!reordered.has(key) && (key.includes(rp) || rp.includes(key))) {
                reordered.set(key, val);
            }
        }
    }
    for (const [key, val] of files) {
        if (!reordered.has(key)) reordered.set(key, val);
    }
    return reordered;
}

function extractErrorFilePaths(errorLog: string): string[] {
    const paths = new Set<string>();
    const pattern = /(?:\.\/)?([a-zA-Z][\w/.@-]*\.(?:ts|tsx|js|jsx|css|json))[\s:(]/g;
    let match;
    while ((match = pattern.exec(errorLog)) !== null) {
        const clean = match[1]!.replace(/^\.\//, '');
        if (!clean.includes('node_modules')) paths.add(clean);
    }
    return [...paths];
}
