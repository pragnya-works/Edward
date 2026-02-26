import type { StateCreator } from "zustand";
import {
  BuildStatus,
  SandboxMode,
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
  setRouteChatId: (chatId) =>
    set((state) => {
      if (state.routeChatId === chatId) {
        return {};
      }

      return {
        routeChatId: chatId,
        isOpen: false,
        isSearchOpen: false,
        terminalEntries: [],
        isTerminalOpen: true,
      };
    }),
  openSandbox: (chatId) =>
    set((state) => {
      if (chatId && state.routeChatId !== chatId) {
        return {};
      }

      return {
        isOpen: true,
        mode:
          state.buildStatus === BuildStatus.SUCCESS && Boolean(state.previewUrl)
            ? SandboxMode.PREVIEW
            : state.mode,
      };
    }),
  closeSandbox: () => set({ isOpen: false }),
  toggleSandbox: (chatId) =>
    set((state) => {
      if (chatId && state.routeChatId !== chatId) {
        return {};
      }

      const isOpening = !state.isOpen;
      return {
        isOpen: isOpening,
        mode:
          isOpening &&
          state.buildStatus === BuildStatus.SUCCESS &&
          Boolean(state.previewUrl)
            ? SandboxMode.PREVIEW
            : state.mode,
      };
    }),
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  setMode: (mode) => set({ mode }),
  setActiveFile: (path) => set({ activeFilePath: path }),
  setPreviewUrl: (url) => set({ previewUrl: sanitizePreviewUrl(url) }),
});
