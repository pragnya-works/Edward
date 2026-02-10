import { db, message, eq, desc, getLatestBuildByChatId } from '@edward/auth';
import { getActiveSandbox } from '../../services/sandbox/lifecycle/provisioning.js';
import { readAllProjectFiles, readSpecificFiles, formatProjectSnapshot } from '../../services/sandbox/read.sandbox.js';
import { logger } from '../../utils/logger.js';
import type { ErrorDiagnostic } from '../../services/diagnostics/types.js';

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
            typeof raw.category === 'string' &&
            typeof raw.diagnosticMethod === 'string' &&
            Array.isArray(raw.affectedFiles) &&
            Array.isArray(raw.lineNumbers) &&
            typeof raw.excerpt === 'string' &&
            typeof raw.confidence === 'number'
        ) {
            return raw as unknown as ErrorDiagnostic;
        }
        logger.warn({ chatId }, 'Error metadata failed structural validation');
        return null;
    })();

    if (latestBuild && latestBuild.status === 'failed') {
        if (errorMetadata?.primaryFile) {
            context += `\nBUILD ERROR ANALYSIS:\n`;
            context += `Category: ${errorMetadata.category}\n`;
            context += `Primary Suspect: ${errorMetadata.primaryFile}\n`;

            if (errorMetadata.affectedFiles.length > 0) {
                context += `Affected Files: ${errorMetadata.affectedFiles.join(', ')}\n`;
            }

            if (errorMetadata.lineNumbers.length > 0) {
                const locations = errorMetadata.lineNumbers
                    .map(loc => `${loc.file}:${loc.line}${loc.column ? `:${loc.column}` : ''}`)
                    .join(', ');
                context += `Error Locations: ${locations}\n`;
            }

            if (errorMetadata.errorCode) {
                context += `Error Code: ${errorMetadata.errorCode}\n`;
            }

            context += `Confidence: ${errorMetadata.confidence}%\n`;
            context += `Diagnostic Method: ${errorMetadata.diagnosticMethod}\n`;
            context += `\nError Excerpt:\n${errorMetadata.excerpt}\n`;
        } else {
            context += `\nLATEST BUILD FAILED:\nError Log:\n${buildError}\n`;
        }
    }

    const sandboxId = await getActiveSandbox(chatId);
    if (sandboxId) {
        try {
            let projectFiles: Map<string, string>;
            if (errorMetadata && errorMetadata.affectedFiles.length > 0) {
                logger.debug(
                    { chatId, fileCount: errorMetadata.affectedFiles.length },
                    'Using targeted file context from error metadata'
                );
                projectFiles = await readSpecificFiles(sandboxId, errorMetadata.affectedFiles);
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
