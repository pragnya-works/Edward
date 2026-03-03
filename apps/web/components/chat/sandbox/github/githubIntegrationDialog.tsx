import {
  AlertCircle,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestCreateArrow,
  LoaderIcon,
  ShieldCheck,
} from "lucide-react";
import { useId } from "react";
import { Button } from "@edward/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@edward/ui/components/dialog";
import { GitHub } from "@edward/ui/components/icons/github";
import { Input } from "@edward/ui/components/input";
import type { GithubIntegrationController } from "./useGithubIntegration";

interface GithubIntegrationDialogProps {
  integration: GithubIntegrationController;
}

export function GithubIntegrationDialog({
  integration,
}: GithubIntegrationDialogProps) {
  const isRateLimited = integration.isGithubRateLimited;
  const rateLimitMessage = integration.githubRateLimitMessage;
  const repoInputId = useId();
  const branchInputId = useId();
  const commitMessageInputId = useId();

  return (
    <Dialog open={integration.isModalOpen} onOpenChange={integration.setIsModalOpen}>
      <DialogContent className="overflow-hidden border-workspace-border bg-workspace-bg p-0 sm:max-w-2xl">
        <DialogHeader className="gap-3 border-b border-workspace-border bg-gradient-to-b from-workspace-sidebar to-workspace-bg px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-workspace-border bg-workspace-bg">
              <GitHub className="h-4 w-4 text-workspace-foreground" />
            </div>
            <DialogTitle className="text-base font-semibold text-workspace-foreground">
              {integration.isRepoLocked
                ? "Sync GitHub Repository"
                : "Connect GitHub Repository"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-workspace-foreground/70">
            {integration.isRepoLocked
              ? "Repository is already connected for this project. Choose branch and commit details to sync."
              : "Configure repository, branch, and commit details. Edward connects, prepares the branch, and syncs in one flow."}
          </DialogDescription>
          <div className="flex items-center gap-2 rounded-lg border border-workspace-border bg-workspace-sidebar/70 px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-workspace-accent" />
            <p className="text-[12px] text-workspace-foreground/80">
              New repositories created by Edward are private by default.
            </p>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label
              htmlFor={repoInputId}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-workspace-foreground/85"
            >
              <GitPullRequestCreateArrow className="h-3.5 w-3.5 text-workspace-foreground/70" />
              Repository
            </label>
            <Input
              id={repoInputId}
              value={integration.repoInput}
              onChange={(event) => integration.setRepoInput(event.target.value)}
              placeholder="owner/repo or repo-name"
              disabled={integration.isRepoLocked || isRateLimited}
              className="h-10 rounded-xl border-workspace-border bg-workspace-sidebar text-[13px] text-workspace-foreground placeholder:text-workspace-foreground/45 focus-visible:ring-workspace-accent/40"
            />
            {integration.repoValidationError && !integration.isRepoLocked ? (
              <div className="space-y-1">
                <p className="text-[11px] text-destructive">
                  {integration.repoValidationError}
                </p>
                {integration.repoSuggestions.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-workspace-foreground/60">Try:</span>
                    {integration.repoSuggestions.map(function mapRepoSuggestion(
                      suggestion,
                    ) {
                      return (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={function handleRepoSuggestionClick() {
                            integration.setRepoInput(suggestion);
                          }}
                          className="rounded-md border border-workspace-border bg-workspace-sidebar px-2 py-0.5 text-[11px] text-workspace-foreground/85 hover:bg-workspace-hover"
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[11px] text-workspace-foreground/55">
                {integration.isRepoLocked
                  ? "This project is already bound to the connected repository. Only branch and commit can be changed."
                  : "If only a repo name is provided, Edward uses your GitHub username."}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={branchInputId}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-workspace-foreground/85"
              >
                <GitBranch className="h-3.5 w-3.5 text-workspace-foreground/70" />
                Branch
              </label>
              <Input
                id={branchInputId}
                value={integration.branchInput}
                onChange={(event) => integration.setBranchInput(event.target.value)}
                placeholder="feature/my-change"
                disabled={isRateLimited}
                className="h-10 rounded-xl border-workspace-border bg-workspace-sidebar text-[13px] text-workspace-foreground placeholder:text-workspace-foreground/45 focus-visible:ring-workspace-accent/40"
              />
              <p className="text-[11px] text-workspace-foreground/55">
                Base branch for creation:{" "}
                <span className="font-medium">{integration.resolvedBaseBranch}</span>
              </p>
              {integration.branchValidationError ? (
                <div className="space-y-1">
                  <p className="text-[11px] text-destructive">
                    {integration.branchValidationError}
                  </p>
                  {integration.branchSuggestions.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-workspace-foreground/60">Try:</span>
                      {integration.branchSuggestions.map(function mapBranchSuggestion(
                        suggestion,
                      ) {
                        return (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={function handleBranchSuggestionClick() {
                              integration.setBranchInput(suggestion);
                            }}
                            className="rounded-md border border-workspace-border bg-workspace-sidebar px-2 py-0.5 text-[11px] text-workspace-foreground/85 hover:bg-workspace-hover"
                          >
                            {suggestion}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={commitMessageInputId}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-workspace-foreground/85"
              >
                <GitCommitHorizontal className="h-3.5 w-3.5 text-workspace-foreground/70" />
                Commit message
              </label>
              <Input
                id={commitMessageInputId}
                value={integration.commitMessage}
                onChange={(event) => integration.setCommitMessage(event.target.value)}
                placeholder="chore: sync project changes"
                disabled={isRateLimited}
                className="h-10 rounded-xl border-workspace-border bg-workspace-sidebar text-[13px] text-workspace-foreground placeholder:text-workspace-foreground/45 focus-visible:ring-workspace-accent/40"
              />
            </div>
          </div>

          {rateLimitMessage ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[12px] text-amber-500">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {rateLimitMessage}
            </p>
          ) : null}

          {integration.errorMessage ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {integration.errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-workspace-border bg-workspace-sidebar/40 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => integration.setIsModalOpen(false)}
            className="h-10 rounded-xl border-workspace-border bg-workspace-bg text-workspace-foreground hover:bg-workspace-hover"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void integration.handleRunGithubFlow()}
            disabled={
              integration.isSubmitting ||
              integration.isCheckingStatus ||
              isRateLimited ||
              (!integration.isRepoLocked && !integration.normalizedRepoInput) ||
              Boolean(integration.repoValidationError) ||
              !integration.normalizedBranchInput ||
              Boolean(integration.branchValidationError) ||
              !integration.normalizedCommitMessage
            }
            className="h-10 rounded-xl px-4"
          >
            {integration.isSubmitting || integration.isCheckingStatus ? (
              <>
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                {integration.isRepoLocked ? "Syncing..." : "Connecting..."}
              </>
            ) : (
              integration.actionLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
