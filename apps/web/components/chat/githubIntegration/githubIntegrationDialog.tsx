import {
  AlertCircle,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestCreateArrow,
  LoaderIcon,
  ShieldCheck,
} from "lucide-react";
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

interface GithubIntegrationDialogProps {
  actionLabel: "Connect" | "Sync";
  errorMessage: string | null;
  isCheckingStatus: boolean;
  isModalOpen: boolean;
  isRepoLocked: boolean;
  isSubmitting: boolean;
  normalizedBranchInput: string;
  normalizedCommitMessage: string;
  normalizedRepoInput: string;
  repoInput: string;
  branchInput: string;
  commitMessage: string;
  resolvedBaseBranch: string;
  onBranchInputChange: (value: string) => void;
  onCommitMessageChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRepoInputChange: (value: string) => void;
  onRunGithubFlow: () => void;
}

export function GithubIntegrationDialog({
  actionLabel,
  errorMessage,
  isCheckingStatus,
  isModalOpen,
  isRepoLocked,
  isSubmitting,
  normalizedBranchInput,
  normalizedCommitMessage,
  normalizedRepoInput,
  repoInput,
  branchInput,
  commitMessage,
  resolvedBaseBranch,
  onBranchInputChange,
  onCommitMessageChange,
  onOpenChange,
  onRepoInputChange,
  onRunGithubFlow,
}: GithubIntegrationDialogProps) {
  return (
    <Dialog open={isModalOpen} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-workspace-border bg-workspace-bg p-0 sm:max-w-2xl">
        <DialogHeader className="gap-3 border-b border-workspace-border bg-gradient-to-b from-workspace-sidebar to-workspace-bg px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-workspace-border bg-workspace-bg">
              <GitHub className="h-4 w-4 text-workspace-foreground" />
            </div>
            <DialogTitle className="text-base font-semibold text-workspace-foreground">
              {isRepoLocked ? "Sync GitHub Repository" : "Connect GitHub Repository"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-workspace-foreground/70">
            {isRepoLocked
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
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-workspace-foreground/85">
              <GitPullRequestCreateArrow className="h-3.5 w-3.5 text-workspace-foreground/70" />
              Repository
            </label>
            <Input
              value={repoInput}
              onChange={(event) => onRepoInputChange(event.target.value)}
              placeholder="owner/repo or repo-name"
              disabled={isRepoLocked}
              className="h-10 rounded-xl border-workspace-border bg-workspace-sidebar text-[13px] text-workspace-foreground placeholder:text-workspace-foreground/45 focus-visible:ring-workspace-accent/40"
            />
            <p className="text-[11px] text-workspace-foreground/55">
              {isRepoLocked
                ? "This project is already bound to the connected repository. Only branch and commit can be changed."
                : "If only a repo name is provided, Edward uses your GitHub username."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-workspace-foreground/85">
                <GitBranch className="h-3.5 w-3.5 text-workspace-foreground/70" />
                Branch
              </label>
              <Input
                value={branchInput}
                onChange={(event) => onBranchInputChange(event.target.value)}
                placeholder="feature/my-change"
                className="h-10 rounded-xl border-workspace-border bg-workspace-sidebar text-[13px] text-workspace-foreground placeholder:text-workspace-foreground/45 focus-visible:ring-workspace-accent/40"
              />
              <p className="text-[11px] text-workspace-foreground/55">
                Base branch for creation: <span className="font-medium">{resolvedBaseBranch}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-workspace-foreground/85">
                <GitCommitHorizontal className="h-3.5 w-3.5 text-workspace-foreground/70" />
                Commit message
              </label>
              <Input
                value={commitMessage}
                onChange={(event) => onCommitMessageChange(event.target.value)}
                placeholder="chore: sync project changes"
                className="h-10 rounded-xl border-workspace-border bg-workspace-sidebar text-[13px] text-workspace-foreground placeholder:text-workspace-foreground/45 focus-visible:ring-workspace-accent/40"
              />
            </div>
          </div>

          {errorMessage ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-workspace-border bg-workspace-sidebar/40 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border-workspace-border bg-workspace-bg text-workspace-foreground hover:bg-workspace-hover"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onRunGithubFlow}
            disabled={
              isSubmitting ||
              isCheckingStatus ||
              (!isRepoLocked && !normalizedRepoInput) ||
              !normalizedBranchInput ||
              !normalizedCommitMessage
            }
            className="h-10 rounded-xl px-4"
          >
            {isSubmitting || isCheckingStatus ? (
              <>
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                {isRepoLocked ? "Syncing..." : "Connecting..."}
              </>
            ) : (
              actionLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
