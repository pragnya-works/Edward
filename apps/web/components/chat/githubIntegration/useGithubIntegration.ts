import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GithubDisconnectReason } from "@edward/shared/constants";
import { toast } from "@edward/ui/components/sonner";
import {
  connectGithubRepo,
  createGithubBranch,
  getGithubRepoStatus,
  syncGithubRepo,
  type ConnectGithubPayload,
  type GithubRepoStatusData,
} from "@/lib/api";
import {
  buildDefaultBranchName,
  buildDefaultCommitMessage,
  buildDefaultRepoName,
  DEFAULT_BASE_BRANCH,
  getErrorMessage,
  getGithubToastId,
  isRepoMissingDisconnect,
  normalizeChatId,
  normalizeRepoInput,
  REPO_DISCONNECTED_DESCRIPTION,
  STORAGE_KEY_PREFIX,
} from "./utils";

interface PersistedGithubIntegrationState {
  connectedRepo?: string;
  repoInput?: string;
  branchInput?: string;
  commitMessage?: string;
}

interface UseGithubIntegrationOptions {
  chatId: string;
  projectName: string | null;
}

interface ApplyPersistedState {
  repoInput: string;
  branchInput: string;
  commitMessage: string;
  connectedRepo: string | null;
}

export function useGithubIntegration({
  chatId,
  projectName,
}: UseGithubIntegrationOptions) {
  const normalizedChatId = useMemo(() => normalizeChatId(chatId), [chatId]);
  const chatIdForDefaults = normalizedChatId || chatId;

  const defaultRepoName = useMemo(
    () => buildDefaultRepoName(projectName, chatIdForDefaults),
    [projectName, chatIdForDefaults],
  );
  const defaultBranchName = useMemo(
    () => buildDefaultBranchName(chatIdForDefaults),
    [chatIdForDefaults],
  );
  const defaultCommitMessage = useMemo(
    () => buildDefaultCommitMessage(projectName),
    [projectName],
  );
  const storageKey = useMemo(
    () => `${STORAGE_KEY_PREFIX}${normalizedChatId}`,
    [normalizedChatId],
  );

  const [repoInput, setRepoInput] = useState(defaultRepoName);
  const [branchInput, setBranchInput] = useState(defaultBranchName);
  const [commitMessage, setCommitMessage] = useState(defaultCommitMessage);
  const [connectedRepo, setConnectedRepo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [repoStatus, setRepoStatus] = useState<GithubRepoStatusData | null>(null);
  const initializedChatIdRef = useRef<string | null>(null);

  const applyPersistedState = useCallback((state: ApplyPersistedState) => {
    setRepoInput(state.repoInput);
    setBranchInput(state.branchInput);
    setCommitMessage(state.commitMessage);
    setConnectedRepo(state.connectedRepo);
  }, []);

  useEffect(() => {
    if (!normalizedChatId || initializedChatIdRef.current === normalizedChatId) {
      return;
    }
    initializedChatIdRef.current = normalizedChatId;

    const fallback = {
      repoInput: defaultRepoName,
      branchInput: defaultBranchName,
      commitMessage: defaultCommitMessage,
      connectedRepo: null as string | null,
    };

    if (typeof window === "undefined") {
      applyPersistedState(fallback);
      return;
    }

    try {
      const rawStored = window.localStorage.getItem(storageKey);
      if (!rawStored) {
        applyPersistedState(fallback);
      } else {
        const parsed = JSON.parse(rawStored) as PersistedGithubIntegrationState;
        applyPersistedState({
          repoInput: parsed.repoInput?.trim() || fallback.repoInput,
          branchInput: parsed.branchInput?.trim() || fallback.branchInput,
          commitMessage: parsed.commitMessage?.trim() || fallback.commitMessage,
          connectedRepo: parsed.connectedRepo?.trim() || fallback.connectedRepo,
        });
      }
    } catch {
      applyPersistedState(fallback);
    }

    setRepoStatus(null);
    setErrorMessage(null);
    setIsModalOpen(false);
    setIsSubmitting(false);
  }, [
    normalizedChatId,
    defaultRepoName,
    defaultBranchName,
    defaultCommitMessage,
    storageKey,
    applyPersistedState,
  ]);

  useEffect(() => {
    if (!normalizedChatId || typeof window === "undefined") {
      return;
    }

    const payload: PersistedGithubIntegrationState = {
      connectedRepo: connectedRepo ?? undefined,
      repoInput: repoInput.trim() || undefined,
      branchInput: branchInput.trim() || undefined,
      commitMessage: commitMessage.trim() || undefined,
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Keep UI usable even if persistence fails.
    }
  }, [
    normalizedChatId,
    storageKey,
    connectedRepo,
    repoInput,
    branchInput,
    commitMessage,
  ]);

  const normalizedRepoInput = useMemo(
    () => normalizeRepoInput(repoInput),
    [repoInput],
  );
  const normalizedBranchInput = useMemo(() => branchInput.trim(), [branchInput]);
  const normalizedCommitMessage = useMemo(
    () => commitMessage.trim(),
    [commitMessage],
  );
  const lockedRepoFullName = useMemo(() => {
    if (repoStatus?.connected && repoStatus.repoFullName) {
      return repoStatus.repoFullName;
    }
    return connectedRepo;
  }, [repoStatus, connectedRepo]);
  const isRepoLocked = Boolean(lockedRepoFullName);
  const actionLabel: "Sync" | "Connect" = isRepoLocked ? "Sync" : "Connect";
  const resolvedBaseBranch =
    repoStatus?.defaultBranch?.trim() || DEFAULT_BASE_BRANCH;

  const showRepoDisconnectedToast = useCallback(() => {
    toast.info("Repository disconnected", {
      id: getGithubToastId(normalizedChatId),
      description: REPO_DISCONNECTED_DESCRIPTION,
    });
  }, [normalizedChatId]);

  const applyRepoStatus = useCallback(
    (status: GithubRepoStatusData, options?: { silent?: boolean }) => {
      setRepoStatus(status);

      if (status.connected && status.repoFullName) {
        setConnectedRepo(status.repoFullName);
        setRepoInput(status.repoFullName);
      } else {
        setConnectedRepo(null);
      }

      if (
        isRepoMissingDisconnect(status.disconnectedReason) &&
        !options?.silent
      ) {
        showRepoDisconnectedToast();
      }
    },
    [showRepoDisconnectedToast],
  );

  const refreshGithubStatus = useCallback(
    async (options?: { silent?: boolean }): Promise<GithubRepoStatusData | null> => {
      if (!normalizedChatId) {
        return null;
      }

      if (!options?.silent) {
        setIsCheckingStatus(true);
      }

      try {
        const statusResponse = await getGithubRepoStatus(normalizedChatId);
        applyRepoStatus(statusResponse.data, options);
        return statusResponse.data;
      } catch (error) {
        if (!options?.silent) {
          const message = getErrorMessage(error);
          toast.error("Failed to check GitHub status", {
            id: getGithubToastId(normalizedChatId),
            description: message,
          });
        }
        return null;
      } finally {
        if (!options?.silent) {
          setIsCheckingStatus(false);
        }
      }
    },
    [normalizedChatId, applyRepoStatus],
  );

  useEffect(() => {
    if (!normalizedChatId) {
      return;
    }
    void refreshGithubStatus({ silent: true });
  }, [normalizedChatId, refreshGithubStatus]);

  useEffect(() => {
    if (!isModalOpen || !normalizedChatId) {
      return;
    }
    void refreshGithubStatus({ silent: true });
  }, [isModalOpen, normalizedChatId, refreshGithubStatus]);

  const handleRunGithubFlow = useCallback(async () => {
    const latestStatus = await refreshGithubStatus({ silent: true });
    const statusLockedRepo =
      latestStatus?.connected && latestStatus.repoFullName
        ? latestStatus.repoFullName
        : null;
    const effectiveRepoInput = normalizeRepoInput(
      statusLockedRepo ?? normalizedRepoInput,
    );

    if (
      !normalizedChatId ||
      !effectiveRepoInput ||
      !normalizedBranchInput ||
      !normalizedCommitMessage
    ) {
      if (!normalizedChatId) {
        setErrorMessage("Chat session is not ready yet. Please retry in a moment.");
      }
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const toastId = getGithubToastId(normalizedChatId);

    try {
      let resolvedRepo = statusLockedRepo;
      let effectiveBaseBranch =
        latestStatus?.defaultBranch?.trim() || resolvedBaseBranch;
      const shouldConnect = !resolvedRepo;

      if (shouldConnect) {
        const connectPayload: ConnectGithubPayload = effectiveRepoInput.includes("/")
          ? { chatId: normalizedChatId, repoFullName: effectiveRepoInput }
          : { chatId: normalizedChatId, repoName: effectiveRepoInput };

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
        id: toastId,
        description: message,
      });
      const latest = await refreshGithubStatus({ silent: true });
      if (latest && isRepoMissingDisconnect(latest.disconnectedReason)) {
        showRepoDisconnectedToast();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    normalizedChatId,
    normalizedRepoInput,
    normalizedBranchInput,
    normalizedCommitMessage,
    refreshGithubStatus,
    resolvedBaseBranch,
    showRepoDisconnectedToast,
  ]);

  return {
    normalizedChatId,
    repoInput,
    setRepoInput,
    branchInput,
    setBranchInput,
    commitMessage,
    setCommitMessage,
    errorMessage,
    isModalOpen,
    setIsModalOpen,
    isSubmitting,
    isCheckingStatus,
    isRepoLocked,
    actionLabel,
    normalizedRepoInput,
    normalizedBranchInput,
    normalizedCommitMessage,
    resolvedBaseBranch,
    handleRunGithubFlow,
    openModal: () => setIsModalOpen(true),
  };
}
