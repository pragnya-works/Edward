"use client";

import { useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchApi, deleteChat } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
const PAGE_SIZE = 6;

export interface Project {
  id: string;
  title: string | null;
  description: string | null;
  updatedAt: Date | string;
}

interface RecentChatsResponse {
  message: string;
  data: Project[];
  metadata?: {
    total: number;
    limit: number;
    offset: number;
  };
}

export function useRecentChats() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  const queryFn = async ({ pageParam = 0 }: { pageParam?: number }) => {
    return fetchApi<RecentChatsResponse>(
      `/chat/recent?limit=${PAGE_SIZE}&offset=${pageParam}`,
    );
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.recentChats.byUserId(userId),
    queryFn,
    getNextPageParam: (lastPage) => {
      if (!lastPage.metadata) return undefined;
      const { total, offset } = lastPage.metadata;
      const nextOffset = offset + PAGE_SIZE;
      return nextOffset < total ? nextOffset : undefined;
    },
    initialPageParam: 0,
    enabled: !!userId,
  });

  const projects = useMemo(() => {
    const allProjects = data?.pages.flatMap((page) => page.data) ?? [];
    const seen = new Set<string>();
    const uniqueProjects: Project[] = [];

    for (const project of allProjects) {
      if (seen.has(project.id)) continue;
      seen.add(project.id);
      uniqueProjects.push(project);
    }

    return uniqueProjects;
  }, [data?.pages]);
  const total = useMemo(
    () => data?.pages[0]?.metadata?.total ?? 0,
    [data?.pages],
  );

  const deleteMutation = useMutation({
    mutationFn: (chatId: string) => deleteChat(chatId),
    onMutate: async (chatId: string) => {
      const queryKey = queryKeys.recentChats.byUserId(userId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.filter((p) => p.id !== chatId),
            metadata: page.metadata
              ? { ...page.metadata, total: page.metadata.total - 1 }
              : page.metadata,
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _chatId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.recentChats.byUserId(userId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.recentChats.byUserId(userId),
      });
    },
  });

  return {
    projects,
    total,
    hasMore: hasNextPage ?? false,
    isLoading,
    isError,
    loadMore: fetchNextPage,
    isLoadingMore: isFetchingNextPage,
    refetch,
    deleteProject: deleteMutation.mutate,
    isDeletingProject: deleteMutation.isPending,
  };
}
