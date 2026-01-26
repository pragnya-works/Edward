interface ErrorWithDetails {
  message?: string;
  stack?: string;
}

export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (error && typeof error === 'object') {
    const potentialError = error as ErrorWithDetails;
    const message = typeof potentialError.message === 'string' 
      ? potentialError.message 
      : JSON.stringify(error);
    
    const newError = new Error(message);
    if (typeof potentialError.stack === 'string') {
      newError.stack = potentialError.stack;
    }
    return newError;
  }

  return new Error("An unknown error occurred");
}
