import type { StateCreator } from "zustand";
import type {
  SandboxStoreState,
  SandboxTerminalEntry,
  SandboxTerminalEntryInput,
  SandboxTerminalSlice,
} from "./types";
import { sanitizeTerminalOutput } from "@/lib/parsing/terminalOutput";

const MAX_TERMINAL_ENTRIES = 500;
const MAX_TERMINAL_OUTPUT_CHARS = 8_000;

function truncateTerminalOutput(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  if (value.length <= MAX_TERMINAL_OUTPUT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_TERMINAL_OUTPUT_CHARS)}\n… output truncated`;
}

function isSameTerminalEntry(
  left: SandboxTerminalEntry,
  right: SandboxTerminalEntryInput,
): boolean {
  return (
    left.kind === right.kind &&
    left.message === right.message &&
    left.command === right.command &&
    JSON.stringify(left.args ?? []) === JSON.stringify(right.args ?? []) &&
    left.exitCode === right.exitCode &&
    left.stdout === right.stdout &&
    left.stderr === right.stderr
  );
}

function normalizeTerminalEntryInput(
  input: SandboxTerminalEntryInput,
): SandboxTerminalEntryInput {
  return {
    ...input,
    message: sanitizeTerminalOutput(input.message) ?? "",
    stdout: sanitizeTerminalOutput(input.stdout),
    stderr: sanitizeTerminalOutput(input.stderr),
  };
}

function createTerminalEntry(
  input: SandboxTerminalEntryInput,
): SandboxTerminalEntry {
  const createdAt = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `${createdAt}-${randomSuffix}`,
    createdAt,
    kind: input.kind,
    message: input.message,
    command: input.command,
    args: input.args,
    exitCode: input.exitCode,
    stdout: truncateTerminalOutput(input.stdout),
    stderr: truncateTerminalOutput(input.stderr),
  };
}

export const createSandboxTerminalSlice: StateCreator<
  SandboxStoreState,
  [],
  [],
  SandboxTerminalSlice
> = (set) => ({
  appendTerminalEntry: (entryInput) =>
    set((state) => {
      const normalizedInput = normalizeTerminalEntryInput(entryInput);
      const lastEntry = state.terminalEntries[state.terminalEntries.length - 1];
      if (lastEntry && isSameTerminalEntry(lastEntry, normalizedInput)) {
        return state;
      }

      const nextEntries = [...state.terminalEntries, createTerminalEntry(normalizedInput)];
      if (nextEntries.length > MAX_TERMINAL_ENTRIES) {
        nextEntries.splice(0, nextEntries.length - MAX_TERMINAL_ENTRIES);
      }

      return { terminalEntries: nextEntries };
    }),
  clearTerminalEntries: () => set({ terminalEntries: [] }),
  setTerminalOpen: (open) => set({ isTerminalOpen: open }),
  toggleTerminalOpen: () =>
    set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
});
