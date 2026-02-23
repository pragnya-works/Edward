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
    set((state) => ({
      files: upsertFile(state.files, file),
    })),
  setFiles: (files) => set({ files }),
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
    const nextFiles = [...files];
    nextFiles[existingIndex] = file;
    return nextFiles;
  }

  return [...files, file];
}
