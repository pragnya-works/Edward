export const queryKeys = {
  chatHistory: {
    all: ["chatHistory"] as const,
    byChatId: (chatId: string | undefined) => ["chatHistory", chatId] as const,
  },
  activeRun: {
    all: ["activeRun"] as const,
    byChatId: (chatId: string | undefined) => ["activeRun", chatId] as const,
  },
  recentChats: {
    all: ["recentChats"] as const,
    byUserId: (userId: string | undefined) => ["recentChats", userId] as const,
  },
  apiKey: {
    all: ["apiKey"] as const,
    byUserId: (userId: string | undefined) => ["apiKey", userId] as const,
  },
  github: {
    all: ["github"] as const,
    statusByChatId: (chatId: string | undefined) => ["github", "status", chatId] as const,
  },
  sandbox: {
    all: ["sandbox"] as const,
    filesByChatId: (chatId: string | undefined) => ["sandbox", "files", chatId] as const,
    buildStatusByChatId: (chatId: string | undefined) =>
      ["sandbox", "buildStatus", chatId] as const,
  },
  subdomain: {
    all: ["subdomain"] as const,
    availability: (
      chatId: string | undefined,
      subdomain: string,
    ) => ["subdomain", "availability", chatId, subdomain] as const,
  },
} as const;
