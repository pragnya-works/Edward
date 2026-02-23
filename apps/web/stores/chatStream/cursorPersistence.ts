export interface StreamCursorPersistence {
  persistCursor: (chatId: string, runId: string, lastEventId: string) => void;
  readCursor: (chatId: string, runId: string) => string | undefined;
  clearCursor: (chatId: string, runId: string) => void;
}

const SSE_CURSOR_STORAGE_PREFIX = "sse_cursor:";

export function createStreamCursorPersistence(): StreamCursorPersistence {
  const streamCursor = new Map<string, string>();

  const persistCursor = (
    chatId: string,
    runId: string,
    lastEventId: string,
  ): void => {
    const key = `${chatId}:${runId}`;
    streamCursor.set(key, lastEventId);
    try {
      sessionStorage.setItem(`${SSE_CURSOR_STORAGE_PREFIX}${key}`, lastEventId);
    } catch {
      // sessionStorage may be unavailable in private-browsing environments.
    }
  };

  const readCursor = (chatId: string, runId: string): string | undefined => {
    const key = `${chatId}:${runId}`;
    const inMemory = streamCursor.get(key);
    if (inMemory) {
      return inMemory;
    }
    try {
      return (
        sessionStorage.getItem(`${SSE_CURSOR_STORAGE_PREFIX}${key}`) ?? undefined
      );
    } catch {
      return undefined;
    }
  };

  const clearCursor = (chatId: string, runId: string): void => {
    const key = `${chatId}:${runId}`;
    streamCursor.delete(key);
    try {
      sessionStorage.removeItem(`${SSE_CURSOR_STORAGE_PREFIX}${key}`);
    } catch {
      // no-op
    }
  };

  return {
    persistCursor,
    readCursor,
    clearCursor,
  };
}
