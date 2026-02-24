import type { RefObject, SyntheticEvent } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { BuildStatus } from "@/stores/sandbox/types";
import { PreviewFrameState, type PreviewFrameState as PreviewFrameStateType } from "@/components/chat/sandbox/previewState";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";

interface PreviewWorkspaceProps {
  previewUrl: string | null;
  previewAddress: string | null;
  previewFrameState: PreviewFrameStateType;
  previewFrameRef: RefObject<HTMLIFrameElement | null>;
  buildStatus: BuildStatus;
  onSwitchToCode: () => void;
  onPreviewLoad: (event: SyntheticEvent<HTMLIFrameElement>) => void;
  onPreviewError: () => void;
}

export function PreviewWorkspace({
  previewUrl,
  previewAddress,
  previewFrameState,
  previewFrameRef,
  buildStatus,
  onSwitchToCode,
  onPreviewLoad,
  onPreviewError,
}: PreviewWorkspaceProps) {
  const { chatId } = useChatWorkspaceContext();

  if (previewUrl) {
    if (previewFrameState === PreviewFrameState.FAILED) {
      return (
        <div className="flex-1 flex items-center justify-center text-workspace-foreground/50 bg-workspace-bg">
          <div className="flex flex-col items-center gap-3 text-center px-6 max-w-md">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-workspace-foreground">
              Preview could not be embedded in this panel.
            </p>
            <a
              href={previewAddress ?? previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-md border border-workspace-border hover:bg-workspace-hover transition-colors text-workspace-foreground"
            >
              Open preview in new tab
            </a>
          </div>
        </div>
      );
    }

    return (
      <iframe
        ref={previewFrameRef}
        src={previewUrl}
        title={`Sandbox preview for chat ${chatId}`}
        className="flex-1 w-full"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={onPreviewLoad}
        onError={onPreviewError}
      />
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center text-workspace-foreground/50 bg-workspace-bg">
      {buildStatus === BuildStatus.FAILED ? (
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-workspace-foreground">Build Failed</p>
            <p className="text-[11px] text-workspace-foreground/50 leading-relaxed">
              The preview is unavailable because the build encountered errors. Switch to the{" "}
              <button
                type="button"
                onClick={onSwitchToCode}
                className="text-workspace-accent font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                Code
              </button>{" "}
              tab to inspect the output.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin-slow opacity-30 text-workspace-accent" />
          <span className="text-[11px] font-medium">
            {buildStatus === BuildStatus.QUEUED
              ? "Queued for build..."
              : "Wait for build..."}
          </span>
        </div>
      )}
    </div>
  );
}
