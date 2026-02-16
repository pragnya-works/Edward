"use client";

import { useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";
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

  const projects = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data?.pages],
  );
  const total = useMemo(
    () => data?.pages[0]?.metadata?.total ?? 0,
    [data?.pages],
  );

  return {
    projects,
    total,
    hasMore: hasNextPage ?? false,
    isLoading,
    isError,
    loadMore: fetchNextPage,
    isLoadingMore: isFetchingNextPage,
    refetch,
  };
}
