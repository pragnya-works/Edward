import type { StateCreator } from "zustand";
import {
  type SandboxStoreState,
  type SandboxUiSlice,
} from "./types";
import { sanitizePreviewUrl } from "./state";

export const createSandboxUiSlice: StateCreator<
  SandboxStoreState,
  [],
  [],
  SandboxUiSlice
> = (set) => ({
  openSandbox: () => set({ isOpen: true }),
  closeSandbox: () => set({ isOpen: false }),
  toggleSandbox: () => set((state) => ({ isOpen: !state.isOpen })),
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  setMode: (mode) => set({ mode }),
  setActiveFile: (path) => set({ activeFilePath: path }),
  setPreviewUrl: (url) => set({ previewUrl: sanitizePreviewUrl(url) }),
});
