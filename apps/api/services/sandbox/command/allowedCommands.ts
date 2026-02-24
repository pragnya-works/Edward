export const SANDBOX_ALLOWED_COMMANDS = [
  "ls",
  "find",
  "grep",
  "mv",
  "cp",
  "mkdir",
  "rm",
  "cat",
  "pnpm",
  "npm",
  "git",
  "pwd",
  "date",
  "echo",
  "touch",
  "head",
  "tail",
  "wc",
  "tsc",
] as const;

export function formatAllowedSandboxCommands(): string {
  return SANDBOX_ALLOWED_COMMANDS.join(", ");
}
