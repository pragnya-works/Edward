import type { StateCreator } from "zustand";
import {
  type SandboxBuildSlice,
  type SandboxStoreState,
} from "./types";

export const createSandboxBuildSlice: StateCreator<
  SandboxStoreState,
  [],
  [],
  SandboxBuildSlice
> = (set) => ({
  setBuildStatus: (status) => set({ buildStatus: status }),
  setBuildError: (error) => set({ buildError: error }),
  setFullErrorReport: (report) => set({ fullErrorReport: report }),
});
