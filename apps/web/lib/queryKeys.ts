export const queryKeys = {
  chatHistory: {
    all: ["chatHistory"] as const,
    byChatId: (chatId: string | undefined) => ["chatHistory", chatId] as const,
  },
  recentChats: {
    all: ["recentChats"] as const,
    byUserId: (userId: string | undefined) => ["recentChats", userId] as const,
  },
  apiKey: {
    all: ["apiKey"] as const,
    byUserId: (userId: string | undefined) => ["apiKey", userId] as const,
  },
} as const;
