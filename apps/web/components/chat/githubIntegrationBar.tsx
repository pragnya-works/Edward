"use client";

import { LoaderIcon } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { GitHub } from "@edward/ui/components/icons/github";
import { useSandbox } from "@/contexts/sandboxContext";
import { GithubIntegrationDialog } from "./githubIntegration/githubIntegrationDialog";
import { useGithubIntegration } from "./githubIntegration/useGithubIntegration";

interface GithubIntegrationBarProps {
  chatId: string;
  projectName: string | null;
}

export function GithubIntegrationBar({
  chatId,
  projectName,
}: GithubIntegrationBarProps) {
  const { files, isStreaming } = useSandbox();
  const hasGeneratedCode = files.length > 0;

  const integration = useGithubIntegration({ chatId, projectName });
  const shouldRender =
    hasGeneratedCode && !isStreaming && Boolean(integration.normalizedChatId);

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={integration.openModal}
        disabled={integration.isSubmitting || integration.isCheckingStatus}
        className="h-8 rounded-lg px-3 text-[12px] font-semibold tracking-tight"
      >
        {integration.isSubmitting || integration.isCheckingStatus ? (
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <GitHub className="h-4 w-4" />
            {integration.actionLabel}
          </>
        )}
      </Button>

      <GithubIntegrationDialog
        actionLabel={integration.actionLabel}
        errorMessage={integration.errorMessage}
        isCheckingStatus={integration.isCheckingStatus}
        isModalOpen={integration.isModalOpen}
        isRepoLocked={integration.isRepoLocked}
        isSubmitting={integration.isSubmitting}
        normalizedBranchInput={integration.normalizedBranchInput}
        normalizedCommitMessage={integration.normalizedCommitMessage}
        normalizedRepoInput={integration.normalizedRepoInput}
        repoInput={integration.repoInput}
        branchInput={integration.branchInput}
        commitMessage={integration.commitMessage}
        resolvedBaseBranch={integration.resolvedBaseBranch}
        onBranchInputChange={integration.setBranchInput}
        onCommitMessageChange={integration.setCommitMessage}
        onOpenChange={integration.setIsModalOpen}
        onRepoInputChange={integration.setRepoInput}
        onRunGithubFlow={() => void integration.handleRunGithubFlow()}
      />
    </>
  );
}
