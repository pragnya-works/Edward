import type {
  SubdomainAvailabilityResponse,
  UpdateSubdomainResponse,
} from "@edward/shared/api/contracts";
import { fetchApi } from "@/lib/api/httpClient";

export async function checkSubdomainAvailability(
  subdomain: string,
  chatId: string,
  signal?: AbortSignal,
): Promise<SubdomainAvailabilityResponse> {
  const params = new URLSearchParams({ subdomain, chatId });
  return fetchApi<SubdomainAvailabilityResponse>(
    `/chat/subdomain/check?${params.toString()}`,
    { signal },
  );
}

export async function updateChatSubdomain(
  chatId: string,
  subdomain: string,
): Promise<UpdateSubdomainResponse> {
  return fetchApi<UpdateSubdomainResponse>(`/chat/${chatId}/subdomain`, {
    method: "PATCH",
    body: JSON.stringify({ subdomain }),
  });
}
