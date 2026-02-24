import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@edward/ui/components/sonner";
import { getGithubRepoStatus } from "@/lib/api/github";
import type { GithubRepoStatusData } from "@edward/shared/github/types";
import {
  buildDefaultBranchName,
  buildDefaultCommitMessage,
  buildDefaultRepoName,
  getBranchNameSuggestions,
  DEFAULT_BASE_BRANCH,
  getBranchNameValidationError,
  getErrorMessage,
  getGithubToastId,
  getRepoInputSuggestions,
  getRepoInputValidationError,
  isRepoMissingDisconnect,
  normalizeChatId,
  normalizeRepoInput,
  REPO_DISCONNECTED_DESCRIPTION,
  STORAGE_KEY_PREFIX,
} from "@/lib/githubIntegration/githubIntegrationNaming";
import {
  type GithubIntegrationStateSnapshot,
  persistGithubIntegrationState,
  resolvePersistedGithubIntegrationState,
} from "./githubIntegrationStorage";
import { runGithubIntegrationFlow } from "./runGithubIntegrationFlow";
import { useRateLimitScope } from "@/hooks/rateLimit/useRateLimitScope";
import {
  formatRateLimitResetTime,
  RATE_LIMIT_SCOPE,
} from "@/lib/rateLimit/scopes";

interface UseGithubIntegrationOptions {
  chatId: string;
  projectName: string | null;
}

export interface GithubIntegrationController {
  normalizedChatId: string;
  repoInput: string;
  setRepoInput: (value: string) => void;
  branchInput: string;
  setBranchInput: (value: string) => void;
  commitMessage: string;
  setCommitMessage: (value: string) => void;
  errorMessage: string | null;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isSubmitting: boolean;
  isCheckingStatus: boolean;
  isGithubRateLimited: boolean;
  githubRateLimitMessage: string | null;
  isRepoLocked: boolean;
  actionLabel: "Sync" | "Connect";
  normalizedRepoInput: string;
  normalizedBranchInput: string;
  normalizedCommitMessage: string;
  repoValidationError: string | null;
  branchValidationError: string | null;
  repoSuggestions: string[];
  branchSuggestions: string[];
  resolvedBaseBranch: string;
  handleRunGithubFlow: () => Promise<void>;
  openModal: () => void;
}

export function useGithubIntegration({
  chatId,
  projectName,
}: UseGithubIntegrationOptions): GithubIntegrationController {
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
  const isGithubFlowInFlightRef = useRef(false);
  const githubBurstRateLimit = useRateLimitScope(RATE_LIMIT_SCOPE.GITHUB_BURST);
  const githubDailyRateLimit = useRateLimitScope(RATE_LIMIT_SCOPE.GITHUB_DAILY);

  const activeGithubRateLimit = useMemo(() => {
    if (githubDailyRateLimit.isActive) {
      return githubDailyRateLimit;
    }
    if (githubBurstRateLimit.isActive) {
      return githubBurstRateLimit;
    }
    return null;
  }, [githubBurstRateLimit, githubDailyRateLimit]);

  const isGithubRateLimited = activeGithubRateLimit !== null;
  const githubRateLimitMessage = useMemo(() => {
    if (!activeGithubRateLimit) {
      return null;
    }

    if (activeGithubRateLimit.scope === RATE_LIMIT_SCOPE.GITHUB_DAILY) {
      if (!activeGithubRateLimit.resetAt) {
        return "Daily GitHub quota exhausted.";
      }
      return `Daily GitHub quota exhausted. You can sync again at ${formatRateLimitResetTime(activeGithubRateLimit.resetAt)}.`;
    }

    return `GitHub requests are temporarily limited. Try again in ${activeGithubRateLimit.remainingSeconds}s.`;
  }, [activeGithubRateLimit]);

  const applyPersistedState = useCallback(function applyPersistedState(
    state: GithubIntegrationStateSnapshot,
  ) {
    setRepoInput(state.repoInput);
    setBranchInput(state.branchInput);
    setCommitMessage(state.commitMessage);
    setConnectedRepo(state.connectedRepo);
  }, []);

  const fallbackState = useMemo(
    function createFallbackState(): GithubIntegrationStateSnapshot {
      return {
        repoInput: defaultRepoName,
        branchInput: defaultBranchName,
        commitMessage: defaultCommitMessage,
        connectedRepo: null,
      };
    },
    [defaultRepoName, defaultBranchName, defaultCommitMessage],
  );

  useEffect(function hydrateGithubIntegrationStateFromStorage() {
    if (!normalizedChatId || initializedChatIdRef.current === normalizedChatId) {
      return;
    }
    initializedChatIdRef.current = normalizedChatId;
    const resolvedState = resolvePersistedGithubIntegrationState(
      storageKey,
      fallbackState,
    );
    applyPersistedState(resolvedState);

    setRepoStatus(null);
    setErrorMessage(null);
    setIsModalOpen(false);
    setIsSubmitting(false);
    isGithubFlowInFlightRef.current = false;
  }, [
    normalizedChatId,
    fallbackState,
    storageKey,
    applyPersistedState,
  ]);

  useEffect(function persistGithubIntegrationStateToStorage() {
    if (!normalizedChatId || typeof window === "undefined") {
      return;
    }
    persistGithubIntegrationState(storageKey, {
      connectedRepo,
      repoInput,
      branchInput,
      commitMessage,
    });
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
  const repoValidationError = useMemo(
    function resolveRepoValidationError() {
      if (isRepoLocked) {
        return null;
      }
      return getRepoInputValidationError(normalizedRepoInput);
    },
    [isRepoLocked, normalizedRepoInput],
  );
  const branchValidationError = useMemo(
    function resolveBranchValidationError() {
      return getBranchNameValidationError(normalizedBranchInput);
    },
    [normalizedBranchInput],
  );
  const branchSuggestions = useMemo(
    function resolveBranchSuggestions() {
      if (!branchValidationError) {
        return [];
      }
      return getBranchNameSuggestions(normalizedBranchInput || branchInput);
    },
    [branchValidationError, normalizedBranchInput, branchInput],
  );
  const repoSuggestions = useMemo(
    function resolveRepoSuggestions() {
      if (isRepoLocked || !repoValidationError) {
        return [];
      }
      return getRepoInputSuggestions(normalizedRepoInput || repoInput);
    },
    [isRepoLocked, repoValidationError, normalizedRepoInput, repoInput],
  );

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
      if (isGithubRateLimited) {
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
    [normalizedChatId, applyRepoStatus, isGithubRateLimited],
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

  const handleRunGithubFlow = useCallback(async function handleRunGithubFlow() {
    if (isGithubRateLimited) {
      setErrorMessage(githubRateLimitMessage ?? "GitHub rate limit reached.");
      return;
    }

    if (isGithubFlowInFlightRef.current) {
      return;
    }

    isGithubFlowInFlightRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await runGithubIntegrationFlow({
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
      });
    } finally {
      isGithubFlowInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    githubRateLimitMessage,
    isGithubRateLimited,
    normalizedChatId,
    normalizedRepoInput,
    normalizedBranchInput,
    normalizedCommitMessage,
    refreshGithubStatus,
    resolvedBaseBranch,
    showRepoDisconnectedToast,
  ]);

  const openModal = useCallback(function openModal() {
    if (isGithubRateLimited) {
      return;
    }
    setIsModalOpen(true);
  }, [isGithubRateLimited]);

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
    isGithubRateLimited,
    githubRateLimitMessage,
    isRepoLocked,
    actionLabel,
    normalizedRepoInput,
    normalizedBranchInput,
    normalizedCommitMessage,
    repoValidationError,
    branchValidationError,
    repoSuggestions,
    branchSuggestions,
    resolvedBaseBranch,
    handleRunGithubFlow,
    openModal,
  };
}
