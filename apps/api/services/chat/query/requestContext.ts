export interface ChatRequestContext {
  readonly chatId: string;
  readonly userId: string;
}

export interface RunRequestContext extends ChatRequestContext {
  readonly runId: string;
}

export function toChatRequestContext(params: {
  chatId: string;
  userId: string;
}): ChatRequestContext {
  return {
    chatId: params.chatId,
    userId: params.userId,
  };
}

export function toRunRequestContext(params: {
  context: ChatRequestContext;
  runId: string;
}): RunRequestContext {
  return {
    chatId: params.context.chatId,
    userId: params.context.userId,
    runId: params.runId,
  };
}
