import {
  useSandboxBuildSync,
} from "@/hooks/chat/sandbox-sync/useSandboxBuildSync";
import type {
  UseSandboxBuildSyncParams,
} from "@/hooks/chat/sandbox-sync/buildSyncTypes";

export function useBuildStatusSync(params: UseSandboxBuildSyncParams): void {
  useSandboxBuildSync(params);
}
