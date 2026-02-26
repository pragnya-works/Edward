"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GithubDisconnectReason } from "@edward/shared/constants";
import {
  connectGithubRepo,
  createGithubBranch,
  getGithubRepoStatus,
  syncGithubRepo,
} from "@/lib/api/github";
import { queryKeys } from "@/lib/queryKeys";
import type {
  ConnectGithubPayload,
  CreateGithubBranchPayload,
  SyncGithubPayload,
} from "@edward/shared/github/types";
import type {
  ConnectGithubResponse,
  CreateGithubBranchResponse,
  GithubRepoStatusResponse,
  SyncGithubResponse,
} from "@edward/shared/api/contracts";

const GITHUB_STATUS_STALE_TIME_MS = 45_000;

export function useGithubRepoStatus(chatId: string | undefined, enabled = true) {
  return useQuery<GithubRepoStatusResponse | null, Error>({
    queryKey: queryKeys.github.statusByChatId(chatId),
    queryFn: async () => {
      if (!chatId) {
        return null;
      }
      return getGithubRepoStatus(chatId);
    },
    enabled: enabled && Boolean(chatId),
    staleTime: GITHUB_STATUS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useGithubIntegrationMutations(chatId: string | undefined) {
  const queryClient = useQueryClient();
  const statusQueryKey = queryKeys.github.statusByChatId(chatId);

  const connectRepoMutation = useMutation<
    ConnectGithubResponse,
    Error,
    ConnectGithubPayload
  >({
    mutationFn: connectGithubRepo,
    onSuccess: (response) => {
      if (chatId) {
        queryClient.setQueryData(statusQueryKey, {
          message: "GitHub status updated",
          timestamp: new Date().toISOString(),
          data: {
            connected: true,
            repoFullName: response.data.repoFullName,
            repoExists: true,
            canPush: true,
            disconnectedReason: GithubDisconnectReason.NONE,
            defaultBranch: response.data.defaultBranch,
          },
        } satisfies GithubRepoStatusResponse);
      }
    },
    onSettled: () => {
      if (chatId) {
        void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      }
    },
  });

  const createBranchMutation = useMutation<
    CreateGithubBranchResponse,
    Error,
    CreateGithubBranchPayload
  >({
    mutationFn: createGithubBranch,
    onSettled: () => {
      if (chatId) {
        void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      }
    },
  });

  const syncRepoMutation = useMutation<
    SyncGithubResponse,
    Error,
    SyncGithubPayload
  >({
    mutationFn: syncGithubRepo,
    onSettled: () => {
      if (chatId) {
        void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      }
    },
  });

  return {
    connectRepoMutation,
    createBranchMutation,
    syncRepoMutation,
    isMutating:
      connectRepoMutation.isPending ||
      createBranchMutation.isPending ||
      syncRepoMutation.isPending,
  };
}
