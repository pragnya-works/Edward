import { create } from "zustand";
import { createSandboxBuildSlice } from "./buildSlice";
import { createSandboxFileSlice } from "./fileSlice";
import { INITIAL_SANDBOX_STATE } from "./state";
import type { SandboxStoreState } from "./types";
import { createSandboxUiSlice } from "./uiSlice";

export const useSandboxStore = create<SandboxStoreState>((...args) => ({
  ...INITIAL_SANDBOX_STATE,
  ...createSandboxUiSlice(...args),
  ...createSandboxFileSlice(...args),
  ...createSandboxBuildSlice(...args),
}));
