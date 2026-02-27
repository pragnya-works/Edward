"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BuildStatusResponse,
  SandboxFilesResponse,
} from "@edward/shared/api/contracts";
import { getBuildStatus, getSandboxFiles } from "@/lib/api/build";
import { queryKeys } from "@/lib/queryKeys";

const SANDBOX_FILES_STALE_TIME_MS = 120_000;
const BUILD_STATUS_STALE_TIME_MS = 5_000;
const SANDBOX_FILES_GC_TIME_MS = 15 * 60_000;

interface FetchSandboxDataOptions {
  force?: boolean;
  chatId?: string;
}

export function useSandboxDataFetchers(chatId: string | undefined) {
  const queryClient = useQueryClient();
  const sandboxFilesQueryKey = queryKeys.sandbox.filesByChatId(chatId);
  const buildStatusQueryKey = queryKeys.sandbox.buildStatusByChatId(chatId);

  const fetchSandboxFiles = useCallback(
    async (options?: FetchSandboxDataOptions): Promise<SandboxFilesResponse | null> => {
      const resolvedChatId = options?.chatId ?? chatId;
      if (!resolvedChatId) {
        return null;
      }

      return queryClient.fetchQuery({
        queryKey: queryKeys.sandbox.filesByChatId(resolvedChatId),
        queryFn: () => getSandboxFiles(resolvedChatId),
        staleTime: options?.force ? 0 : SANDBOX_FILES_STALE_TIME_MS,
        gcTime: SANDBOX_FILES_GC_TIME_MS,
      });
    },
    [chatId, queryClient],
  );

  const fetchBuildStatus = useCallback(
    async (options?: FetchSandboxDataOptions): Promise<BuildStatusResponse | null> => {
      const resolvedChatId = options?.chatId ?? chatId;
      if (!resolvedChatId) {
        return null;
      }

      return queryClient.fetchQuery({
        queryKey: queryKeys.sandbox.buildStatusByChatId(resolvedChatId),
        queryFn: () => getBuildStatus(resolvedChatId),
        staleTime: options?.force ? 0 : BUILD_STATUS_STALE_TIME_MS,
      });
    },
    [chatId, queryClient],
  );

  const invalidateSandboxFiles = useCallback(() => {
    if (!chatId) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: sandboxFilesQueryKey });
  }, [chatId, queryClient, sandboxFilesQueryKey]);

  const invalidateBuildStatus = useCallback(() => {
    if (!chatId) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: buildStatusQueryKey });
  }, [buildStatusQueryKey, chatId, queryClient]);

  return {
    sandboxFilesQueryKey,
    buildStatusQueryKey,
    fetchSandboxFiles,
    fetchBuildStatus,
    invalidateSandboxFiles,
    invalidateBuildStatus,
  };
}
