import { GithubDisconnectReason } from "@edward/shared/constants";
import { toast } from "@edward/ui/components/sonner";
import {
  connectGithubRepo,
  createGithubBranch,
  syncGithubRepo,
} from "@/lib/api/github";
import type {
  ConnectGithubPayload,
  GithubRepoStatusData,
} from "@edward/shared/github/types";
import {
  getBranchNameValidationError,
  getErrorMessage,
  getGithubToastId,
  getRepoInputValidationError,
  isRepoMissingDisconnect,
  normalizeRepoInput,
} from "@/lib/githubIntegration/githubIntegrationNaming";

interface RunGithubIntegrationFlowParams {
  normalizedBranchInput: string;
  normalizedChatId: string;
  normalizedCommitMessage: string;
  normalizedRepoInput: string;
  refreshGithubStatus: (
    options?: { silent?: boolean },
  ) => Promise<GithubRepoStatusData | null>;
  resolvedBaseBranch: string;
  setConnectedRepo: (value: string | null) => void;
  setErrorMessage: (value: string | null) => void;
  setIsModalOpen: (value: boolean) => void;
  setRepoInput: (value: string) => void;
  setRepoStatus: (value: GithubRepoStatusData | null) => void;
  showRepoDisconnectedToast: () => void;
}

function buildConnectPayload(
  normalizedChatId: string,
  effectiveRepoInput: string,
): ConnectGithubPayload {
  if (effectiveRepoInput.includes("/")) {
    return { chatId: normalizedChatId, repoFullName: effectiveRepoInput };
  }
  return { chatId: normalizedChatId, repoName: effectiveRepoInput };
}

function ensureGithubFlowInputs(
  normalizedChatId: string,
  effectiveRepoInput: string,
  normalizedBranchInput: string,
  normalizedCommitMessage: string,
): string | null {
  if (!normalizedChatId) {
    return "Chat session is not ready yet. Please retry in a moment.";
  }

  if (!effectiveRepoInput || !normalizedBranchInput || !normalizedCommitMessage) {
    return null;
  }

  const repoValidationError = getRepoInputValidationError(effectiveRepoInput);
  if (repoValidationError) {
    return repoValidationError;
  }

  const branchValidationError = getBranchNameValidationError(normalizedBranchInput);
  if (branchValidationError) {
    return branchValidationError;
  }

  return null;
}

export async function runGithubIntegrationFlow({
  normalizedBranchInput,
  normalizedChatId,
  normalizedCommitMessage,
  normalizedRepoInput,
  refreshGithubStatus,
  resolvedBaseBranch,
  setConnectedRepo,
  setErrorMessage,
  setIsModalOpen,
  setRepoInput,
  setRepoStatus,
  showRepoDisconnectedToast,
}: RunGithubIntegrationFlowParams): Promise<void> {
  try {
    const latestStatus = await refreshGithubStatus({ silent: true });
    const statusLockedRepo =
      latestStatus?.connected && latestStatus.repoFullName
        ? latestStatus.repoFullName
        : null;
    const effectiveRepoInput = normalizeRepoInput(
      statusLockedRepo ?? normalizedRepoInput,
    );
    const validationError = ensureGithubFlowInputs(
      normalizedChatId,
      effectiveRepoInput,
      normalizedBranchInput,
      normalizedCommitMessage,
    );

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (
      !normalizedChatId ||
      !effectiveRepoInput ||
      !normalizedBranchInput ||
      !normalizedCommitMessage
    ) {
      return;
    }

    const toastId = getGithubToastId(normalizedChatId);
    let resolvedRepo = statusLockedRepo;
    let effectiveBaseBranch =
      latestStatus?.defaultBranch?.trim() || resolvedBaseBranch;
    const shouldConnect = !resolvedRepo;

    if (shouldConnect) {
      const connectPayload = buildConnectPayload(
        normalizedChatId,
        effectiveRepoInput,
      );
      const connectResponse = await connectGithubRepo(connectPayload);
      resolvedRepo = connectResponse.data.repoFullName;
      effectiveBaseBranch =
        connectResponse.data.defaultBranch?.trim() || effectiveBaseBranch;

      setConnectedRepo(resolvedRepo);
      setRepoInput(resolvedRepo);
      setRepoStatus({
        connected: true,
        repoFullName: resolvedRepo,
        repoExists: true,
        canPush: true,
        disconnectedReason: GithubDisconnectReason.NONE,
        defaultBranch: effectiveBaseBranch,
      });

      toast.success("Repository connected", {
        id: toastId,
        description: `Connected to ${resolvedRepo}`,
      });
    }

    await createGithubBranch({
      chatId: normalizedChatId,
      branchName: normalizedBranchInput,
      baseBranch: effectiveBaseBranch,
    });

    const syncResponse = await syncGithubRepo({
      chatId: normalizedChatId,
      branch: normalizedBranchInput,
      commitMessage: normalizedCommitMessage,
    });

    if (syncResponse.data.sha) {
      setConnectedRepo(resolvedRepo ?? effectiveRepoInput);
    }

    if (syncResponse.data.noChanges) {
      toast.info("No changes to push", {
        id: toastId,
        description: `Branch ${normalizedBranchInput} is already up to date.`,
      });
    } else {
      toast.success("Synced to GitHub", {
        id: toastId,
        description: `Branch ${normalizedBranchInput} updated successfully.`,
      });
    }

    setIsModalOpen(false);
  } catch (error) {
    const message = getErrorMessage(error);
    setErrorMessage(message);
    toast.error("GitHub sync failed", {
      id: getGithubToastId(normalizedChatId),
      description: message,
    });
    const latest = await refreshGithubStatus({ silent: true });
    if (latest && isRepoMissingDisconnect(latest.disconnectedReason)) {
      showRepoDisconnectedToast();
    }
  }
}
