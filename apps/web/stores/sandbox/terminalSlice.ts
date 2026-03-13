import type { StateCreator } from "zustand";
import type {
  SandboxStoreState,
  SandboxTerminalEntry,
  SandboxTerminalEntryInput,
  SandboxTerminalSlice,
} from "./types";
import { sanitizeTerminalOutput } from "@/lib/parsing/terminalOutput";

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
    stdout: input.stdout,
    stderr: input.stderr,
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
      return {
        terminalEntries: [
          ...state.terminalEntries,
          createTerminalEntry(normalizedInput),
        ],
      };
    }),
  clearTerminalEntries: () => set({ terminalEntries: [] }),
  setTerminalOpen: (open) => set({ isTerminalOpen: open }),
  toggleTerminalOpen: () =>
    set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
});
