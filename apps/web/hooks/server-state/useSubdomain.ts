"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  SubdomainAvailabilityResponse,
  UpdateSubdomainResponse,
} from "@edward/shared/api/contracts";
import { checkSubdomainAvailability, updateChatSubdomain } from "@/lib/api/subdomain";
import { queryKeys } from "@/lib/queryKeys";

interface CheckSubdomainVariables {
  chatId: string;
  subdomain: string;
  signal?: AbortSignal;
}

interface UpdateSubdomainVariables {
  chatId: string;
  subdomain: string;
}

export function useSubdomainMutations() {
  const queryClient = useQueryClient();

  const checkAvailabilityMutation = useMutation<
    SubdomainAvailabilityResponse,
    Error,
    CheckSubdomainVariables
  >({
    mutationFn: ({ chatId, subdomain, signal }) =>
      checkSubdomainAvailability(subdomain, chatId, signal),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        queryKeys.subdomain.availability(variables.chatId, variables.subdomain),
        data,
      );
    },
  });

  const saveSubdomainMutation = useMutation<
    UpdateSubdomainResponse,
    Error,
    UpdateSubdomainVariables
  >({
    mutationFn: ({ chatId, subdomain }) => updateChatSubdomain(chatId, subdomain),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subdomain.availability(variables.chatId, variables.subdomain),
      });
    },
  });

  return {
    checkAvailabilityMutation,
    saveSubdomainMutation,
  };
}
