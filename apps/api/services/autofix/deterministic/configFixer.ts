import {
    getContainer,
    execCommand,
    CONTAINER_WORKDIR,
} from "../../sandbox/docker.sandbox.js";
import { getSandboxState } from "../../sandbox/state.sandbox.js";
import { logger } from "../../../utils/logger.js";
import type { Diagnostic } from "../../diagnostics/types.js";
import { DiagnosticCategory } from "../../diagnostics/types.js";

const TEMPLATE_CONFIGS: Record<string, Record<string, string>> = {
    nextjs: {
        "tsconfig.json": JSON.stringify(
            {
                compilerOptions: {
                    target: "es5",
                    lib: ["dom", "dom.iterable", "esnext"],
                    allowJs: true,
                    skipLibCheck: true,
                    strict: true,
                    noEmit: true,
                    esModuleInterop: true,
                    module: "esnext",
                    moduleResolution: "bundler",
                    resolveJsonModule: true,
                    isolatedModules: true,
                    jsx: "preserve",
                    incremental: true,
                    paths: { "@/*": ["./*"] },
                },
                include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
                exclude: ["node_modules"],
            },
            null,
            2,
        ),
    },
    "vite-react": {
        "tsconfig.json": JSON.stringify(
            {
                compilerOptions: {
                    target: "ES2020",
                    useDefineForClassFields: true,
                    lib: ["ES2020", "DOM", "DOM.Iterable"],
                    module: "ESNext",
                    skipLibCheck: true,
                    moduleResolution: "bundler",
                    allowImportingTsExtensions: true,
                    isolatedModules: true,
                    noEmit: true,
                    jsx: "react-jsx",
                    strict: true,
                    noUnusedLocals: true,
                    noUnusedParameters: true,
                    noFallthroughCasesInSwitch: true,
                },
                include: ["src"],
                references: [{ path: "./tsconfig.node.json" }],
            },
            null,
            2,
        ),
    },
};

export interface ConfigFixResult {
    fixed: string[];
    skipped: string[];
}

export async function fixConfigFiles(
    sandboxId: string,
    diagnostics: Diagnostic[],
    framework?: string,
): Promise<ConfigFixResult> {
    const configDiags = diagnostics.filter((d) => d.category === DiagnosticCategory.ConfigError);
    if (configDiags.length === 0 || !framework) {
        return { fixed: [], skipped: [] };
    }

    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) throw new Error(`Sandbox not found: ${sandboxId}`);

    const container = getContainer(sandbox.containerId);
    const templates = TEMPLATE_CONFIGS[framework];
    if (!templates) return { fixed: [], skipped: configDiags.map((d) => d.id) };

    const fixed: string[] = [];
    const skipped: string[] = [];

    for (const [filename, content] of Object.entries(templates)) {
        const mentioned = configDiags.some(
            (d) => d.message.toLowerCase().includes(filename.toLowerCase()),
        );
        if (!mentioned) continue;

        const result = await execCommand(
            container,
            ["sh", "-c", `echo '${content.replace(/'/g, "'\\''")}' > ${filename}`],
            false,
            5000,
            undefined,
            CONTAINER_WORKDIR,
        );

        if (result.exitCode === 0) {
            fixed.push(filename);
            logger.info({ sandboxId, filename, framework }, "Config file regenerated from template");
        } else {
            skipped.push(filename);
        }
    }

    return { fixed, skipped };
}
