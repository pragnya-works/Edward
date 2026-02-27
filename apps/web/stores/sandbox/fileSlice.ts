import type { StateCreator } from "zustand";
import {
  BuildStatus,
  type SandboxFile,
  type SandboxFileSlice,
  type SandboxStoreState,
} from "./types";

export const createSandboxFileSlice: StateCreator<
  SandboxStoreState,
  [],
  [],
  SandboxFileSlice
> = (set, get) => ({
  updateFile: (file) =>
    set((state) => {
      const nextFiles = upsertFile(state.files, file);
      if (nextFiles === state.files) {
        return state;
      }
      return { files: nextFiles };
    }),
  setFiles: (files) =>
    set((state) => (areFilesEqual(state.files, files) ? state : { files })),
  startStreaming: (filePath) =>
    set({
      isStreaming: true,
      streamingFilePath: filePath,
      activeFilePath: filePath,
    }),
  stopStreaming: () =>
    set({
      isStreaming: false,
      streamingFilePath: null,
    }),
  clearFiles: () =>
    set({
      files: [],
      activeFilePath: null,
      previewUrl: null,
      buildStatus: BuildStatus.IDLE,
      buildError: null,
      fullErrorReport: null,
      localEdits: new Map(),
      terminalEntries: [],
      isTerminalOpen: true,
    }),
  setLocalEdit: (path, content) =>
    set((state) => {
      const localEdits = new Map(state.localEdits);
      localEdits.set(path, content);
      return { localEdits };
    }),
  clearLocalEdit: (path) =>
    set((state) => {
      const localEdits = new Map(state.localEdits);
      localEdits.delete(path);
      return { localEdits };
    }),
  clearAllLocalEdits: () => set({ localEdits: new Map() }),
  getFileContent: (path) => {
    const localEdit = get().localEdits.get(path);
    if (localEdit !== undefined) {
      return localEdit;
    }

    const file = get().files.find((item) => item.path === path);
    return file?.content ?? "";
  },
});

function upsertFile(files: SandboxFile[], file: SandboxFile): SandboxFile[] {
  const existingIndex = files.findIndex((existing) => existing.path === file.path);
  if (existingIndex >= 0) {
    const existing = files[existingIndex];
    if (
      existing &&
      existing.content === file.content &&
      existing.isComplete === file.isComplete
    ) {
      return files;
    }
    const nextFiles = [...files];
    nextFiles[existingIndex] = file;
    return nextFiles;
  }

  return [...files, file];
}

function areFilesEqual(a: SandboxFile[], b: SandboxFile[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) return false;
    if (
      left.path !== right.path ||
      left.content !== right.content ||
      left.isComplete !== right.isComplete
    ) {
      return false;
    }
  }

  return true;
}
