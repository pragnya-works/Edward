import { executeSandboxCommand } from "../../services/sandbox/command.sandbox.js";

export interface CommandResult {
    command: string;
    args: string[];
    stdout: string;
    stderr: string;
}

export interface CommandSpec {
    command: string;
    args: string[];
}

export async function executeCommands(
    sandboxId: string,
    commands: CommandSpec[],
): Promise<CommandResult[]> {
    return Promise.all(
        commands.map(async (cmd) => {
            try {
                const r = await executeSandboxCommand(sandboxId, cmd);
                return { ...cmd, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
            } catch (err) {
                return {
                    ...cmd,
                    stdout: "",
                    stderr: `Command failed: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        }),
    );
}

export function formatCommandResults(results: CommandResult[]): string {
    return results
        .map((r) => {
            let out = `$ ${r.command} ${r.args.join(" ")}\n${r.stdout}`;
            if (r.stderr) out += `\nSTDERR: ${r.stderr}`;
            return out;
        })
        .join("\n---\n");
}

export interface TurnResult {
    rawResponse: string;
    commands: CommandSpec[];
}

export async function processLLMStream(
    stream: AsyncIterable<string>,
    parser: {
        process: (text: string) => Iterable<{ type: string; command?: string; args?: string[] }>;
        flush: () => Iterable<{ type: string; command?: string; args?: string[] }>;
    },
    sendSSE: (event: unknown) => void,
    abortSignal?: AbortSignal,
): Promise<TurnResult> {
    let rawResponse = "";
    const commands: CommandSpec[] = [];

    for await (const text of stream) {
        if (abortSignal?.aborted) break;
        if (!text) continue;

        rawResponse += text;

        for (const event of parser.process(text)) {
            sendSSE(event);
            if (event.type === "command" && event.command) {
                commands.push({ command: event.command, args: event.args ?? [] });
            }
        }
    }

    for (const event of parser.flush()) {
        sendSSE(event);
        if (event.type === "command" && event.command) {
            commands.push({ command: event.command, args: event.args ?? [] });
        }
    }

    return { rawResponse, commands };
}