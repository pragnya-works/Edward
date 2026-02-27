import { writeSandboxFile } from "../../services/sandbox/write/buffer.js";

export async function handleFileContent(
    sandboxId: string,
    filePath: string,
    content: string,
    isFirstChunk: boolean,
): Promise<void> {
    let processedContent = content;

    if (isFirstChunk) {
        const trimmed = content.trimStart();
        if (trimmed.startsWith("```")) {
            const newlineIdx = trimmed.indexOf("\n");
            processedContent = newlineIdx !== -1 ? trimmed.slice(newlineIdx + 1) : "";
        } else {
            processedContent = content.replace(/^\n+/, "");
        }
    }

    if (processedContent) {
        await writeSandboxFile(sandboxId, filePath, processedContent);
    }
}
