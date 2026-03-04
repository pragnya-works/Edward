"use client";

import { useMemo } from "react";
import { LoaderIcon } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { GitHub } from "@edward/ui/components/icons/github";
import { useSandbox } from "@/stores/sandbox/hooks";
import { useChatStreamState } from "@/stores/chatStream/hooks";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import { GithubIntegrationDialog } from "./github/githubIntegrationDialog";
import { useGithubIntegration } from "./github/useGithubIntegration";
import { INITIAL_STREAM_STATE } from "@edward/shared/chat/types";

export function GithubIntegrationBar() {
  const { chatId, projectName } = useChatWorkspaceContext();
  const { files } = useSandbox();
  const { streams } = useChatStreamState();
  const hasGeneratedCode = files.length > 0;

  const integration = useGithubIntegration({ chatId, projectName });
  const stream = useMemo(
    () =>
      streams[chatId] ??
      Object.values(streams).find(
        (candidate) =>
          candidate.streamChatId === chatId || candidate.meta?.chatId === chatId,
      ) ??
      INITIAL_STREAM_STATE,
    [chatId, streams],
  );

  const isLlmResponseInProgress =
    stream.isStreaming ||
    stream.isThinking ||
    stream.isSandboxing ||
    stream.activeFiles.length > 0 ||
    stream.installingDeps.length > 0;

  const shouldRender =
    hasGeneratedCode &&
    !isLlmResponseInProgress &&
    Boolean(integration.normalizedChatId);

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={integration.openModal}
          disabled={
            integration.isSubmitting ||
            integration.isCheckingStatus ||
            integration.isGithubRateLimited
          }
          aria-label={integration.actionLabel}
          className="h-8 rounded-lg px-2 md:px-3 text-[12px] font-semibold tracking-tight"
        >
          {integration.isSubmitting || integration.isCheckingStatus ? (
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <GitHub className="h-4 w-4 shrink-0" />
              {/* Text label hidden on small screens, visible md+ */}
              <span className="hidden md:inline">
                {integration.actionLabel}
              </span>
            </>
          )}
        </Button>
        {integration.githubRateLimitMessage ? (
          <p className="text-[11px] font-medium text-amber-500/90">
            {integration.githubRateLimitMessage}
          </p>
        ) : null}
      </div>

      <GithubIntegrationDialog integration={integration} />
    </>
  );
}
