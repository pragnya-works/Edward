import type {
  RefObject,
} from "react";
import {
  BuildRecordStatus,
  type BuildErrorReport,
} from "@edward/shared/api/contracts";
import { BuildStatus, SandboxMode } from "@/stores/sandbox/types";
import type {
  BuildStatusPayload,
} from "@/hooks/chat/sandbox-sync/buildSyncTypes";

interface BuildStatusRuntimeRefs {
  pushTerminalRef: RefObject<boolean>;
  buildInFlightRef: RefObject<boolean>;
  lastPolledChatIdRef: RefObject<string | null>;
}

interface ApplyBuildStatusUpdateParams extends BuildStatusRuntimeRefs {
  build: BuildStatusPayload;
  openSandbox: () => void;
  setMode: (mode: SandboxMode) => void;
  setPreviewUrl: (url: string | null) => void;
  setBuildStatus: (status: BuildStatus) => void;
  setBuildError: (error: string | null) => void;
  setFullErrorReport: (report: BuildErrorReport | null) => void;
}

export function applyBuildStatusUpdate({
  build,
  openSandbox,
  setMode,
  setPreviewUrl,
  setBuildStatus,
  setBuildError,
  setFullErrorReport,
  pushTerminalRef,
  buildInFlightRef,
  lastPolledChatIdRef,
}: ApplyBuildStatusUpdateParams): void {
  if (!build.status) {
    setBuildStatus(BuildStatus.QUEUED);
    setBuildError(null);
    setFullErrorReport(null);
    pushTerminalRef.current = false;
    buildInFlightRef.current = true;
    lastPolledChatIdRef.current = null;
    return;
  }

  if (build.status === BuildRecordStatus.SUCCESS) {
    setBuildStatus(BuildStatus.SUCCESS);
    if (build.previewUrl) {
      setPreviewUrl(build.previewUrl);
      if (buildInFlightRef.current) {
        setMode(SandboxMode.PREVIEW);
        openSandbox();
      }
    }
    setBuildError(null);
    setFullErrorReport(null);
    pushTerminalRef.current = true;
    buildInFlightRef.current = false;
    return;
  }

  if (build.status === BuildRecordStatus.FAILED) {
    setBuildStatus(BuildStatus.FAILED);
    const report = build.errorReport as BuildErrorReport | null;
    const laymanReason =
      report?.userFacing?.shortMessage ||
      report?.rootCause?.suggestion ||
      report?.errors?.[0]?.suggestion ||
      report?.headline ||
      "An unknown error occurred during build.";

    setBuildError(String(laymanReason));
    setFullErrorReport(report);
    pushTerminalRef.current = true;
    buildInFlightRef.current = false;
    return;
  }

  if (build.status === BuildRecordStatus.QUEUED) {
    setBuildStatus(BuildStatus.QUEUED);
    setBuildError(null);
    pushTerminalRef.current = false;
    buildInFlightRef.current = true;
    lastPolledChatIdRef.current = null;
    return;
  }

  if (build.status === BuildRecordStatus.BUILDING) {
    setBuildStatus(BuildStatus.BUILDING);
    setBuildError(null);
    pushTerminalRef.current = false;
    buildInFlightRef.current = true;
    lastPolledChatIdRef.current = null;
    return;
  }

  setBuildStatus(BuildStatus.FAILED);
  setBuildError(`Unexpected build status: ${build.status}`);
  pushTerminalRef.current = true;
  buildInFlightRef.current = false;
}
