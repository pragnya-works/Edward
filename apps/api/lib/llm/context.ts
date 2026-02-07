import { db, message, eq, desc, getLatestBuildByChatId } from '@edward/auth';
import { getActiveSandbox } from '../../services/sandbox/lifecycle/provisioning.js';
import { readAllProjectFiles, formatProjectSnapshot } from '../../services/sandbox/read.sandbox.js';
import { logger } from '../../utils/logger.js';

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

    let buildError: string | undefined;
    if (latestBuild && latestBuild.status === 'failed') {
        buildError = latestBuild.errorLog ?? undefined;
        context += `\nLATEST BUILD FAILED:\nError Log:\n${buildError}\n`;
    }

    const sandboxId = await getActiveSandbox(chatId);
    if (sandboxId) {
        try {
            let projectFiles = await readAllProjectFiles(sandboxId);

            if (buildError && projectFiles.size > 0) {
                projectFiles = reorderByErrorRefs(projectFiles, buildError);
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
