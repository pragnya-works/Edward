import path from 'path';
import { StreamState, ParserEventType, type ParserEvent } from '../../schemas/chat.schema.js';

const TAGS = {
  THINKING_START: '<Thinking>',
  THINKING_END: '</Thinking>',
  SANDBOX_START: '<edward_sandbox',
  SANDBOX_END: '</edward_sandbox>',
  FILE_START: '<file',
  FILE_END: '</file>',
} as const;

const LOOKAHEAD_LIMIT = 256;
const MAX_BUFFER_SIZE = 1024 * 10;

export function createStreamParser() {
  let state: StreamState = StreamState.TEXT;
  let buffer: string = '';

  function handleState(events: ParserEvent[]): void {
    switch (state) {
      case StreamState.TEXT:
        handleTextState(events);
        break;
      case StreamState.THINKING:
        handleThinkingState(events);
        break;
      case StreamState.SANDBOX:
        handleSandboxState(events);
        break;
      case StreamState.FILE:
        handleFileState(events);
        break;
    }
  }

  function handleTextState(events: ParserEvent[]): void {
    const thinkingIdx = buffer.indexOf(TAGS.THINKING_START);
    const sandboxIdx = buffer.indexOf(TAGS.SANDBOX_START);

    const nextTagIdx = thinkingIdx !== -1 && (sandboxIdx === -1 || thinkingIdx < sandboxIdx)
      ? thinkingIdx
      : sandboxIdx !== -1 ? sandboxIdx : -1;

    if (nextTagIdx !== -1) {
      if (nextTagIdx > 0) {
        const textContent = buffer.slice(0, nextTagIdx);
        if (textContent) {
          events.push({ type: ParserEventType.TEXT, content: textContent });
        }
      }
      buffer = buffer.slice(nextTagIdx);

      if (buffer.startsWith(TAGS.THINKING_START)) {
        buffer = buffer.slice(TAGS.THINKING_START.length);
        state = StreamState.THINKING;
        events.push({ type: ParserEventType.THINKING_START });
      } else if (buffer.startsWith(TAGS.SANDBOX_START)) {
        const closeIdx = buffer.indexOf('>');
        if (closeIdx !== -1) {
          const tag = buffer.slice(0, closeIdx + 1);
          const projectMatch = tag.match(/project="([^"]*)"/)?.[1];
          const baseMatch = tag.match(/base="([^"]*)"/)?.[1];

          events.push({
            type: ParserEventType.SANDBOX_START,
            project: projectMatch,
            base: baseMatch
          });
          buffer = buffer.slice(closeIdx + 1);
          state = StreamState.SANDBOX;
        }
      }
    } else {
      flushSafeContent(events, ParserEventType.TEXT);
    }
  }

  function handleThinkingState(events: ParserEvent[]): void {
    const endIdx = buffer.indexOf(TAGS.THINKING_END);
    if (endIdx !== -1) {
      if (endIdx > 0) {
        const thinkingContent = buffer.slice(0, endIdx);
        if (thinkingContent) {
          events.push({ type: ParserEventType.THINKING_CONTENT, content: thinkingContent });
        }
      }
      buffer = buffer.slice(endIdx + TAGS.THINKING_END.length);
      state = StreamState.TEXT;
      events.push({ type: ParserEventType.THINKING_END });
    } else {
      flushSafeContent(events, ParserEventType.THINKING_CONTENT);
    }
  }

  function handleSandboxState(events: ParserEvent[]): void {
    const fileIdx = buffer.indexOf(TAGS.FILE_START);
    const endIdx = buffer.indexOf(TAGS.SANDBOX_END);

    if (fileIdx !== -1 && (endIdx === -1 || fileIdx < endIdx)) {
      const closeIdx = buffer.indexOf('>', fileIdx);
      if (closeIdx !== -1) {
        const tag = buffer.slice(fileIdx, closeIdx + 1);
        const rawPath = tag.match(/path="([^"]*)"/)?.[1];

        if (rawPath && rawPath.trim()) {
          const normalizedPath = path.posix.normalize(rawPath).replace(/^(\.\.{1,2}(\/|\\|$))+/, '');
          if (normalizedPath) {
            events.push({ type: ParserEventType.FILE_START, path: normalizedPath });
            state = StreamState.FILE;
          } else {
            events.push({ type: ParserEventType.ERROR, message: `Invalid file path after normalization: ${rawPath}` });
          }
        } else {
          events.push({ type: ParserEventType.ERROR, message: 'Invalid file tag: missing or empty path' });
        }
        buffer = buffer.slice(closeIdx + 1);
      }
    } else if (endIdx !== -1) {
      buffer = buffer.slice(endIdx + TAGS.SANDBOX_END.length);
      state = StreamState.TEXT;
      events.push({ type: ParserEventType.SANDBOX_END });
    } else {
      const lastLt = buffer.lastIndexOf('<');
      if (lastLt === -1 && buffer.length > LOOKAHEAD_LIMIT) {
        buffer = '';
      }
    }
  }

  function handleFileState(events: ParserEvent[]): void {
    const endIdx = buffer.indexOf(TAGS.FILE_END);
    if (endIdx !== -1) {
      if (endIdx > 0) {
        const fileContent = buffer.slice(0, endIdx);
        if (fileContent) {
          events.push({ type: ParserEventType.FILE_CONTENT, content: fileContent });
        }
      }
      buffer = buffer.slice(endIdx + TAGS.FILE_END.length);
      state = StreamState.SANDBOX;
      events.push({ type: ParserEventType.FILE_END });
    } else {
      flushSafeContent(events, ParserEventType.FILE_CONTENT);
    }
  }

  function flushSafeContent(
    events: ParserEvent[],
    type: ParserEventType.TEXT | ParserEventType.THINKING_CONTENT | ParserEventType.FILE_CONTENT
  ): void {
    const lastLt = buffer.lastIndexOf('<');
    if (lastLt !== -1 && buffer.length - lastLt < LOOKAHEAD_LIMIT) {
      if (lastLt > 0) {
        const content = buffer.slice(0, lastLt);
        events.push({ type, content } as ParserEvent);
        buffer = buffer.slice(lastLt);
      }
    } else {
      if (buffer.length > 0) {
        events.push({ type, content: buffer } as ParserEvent);
      }
      buffer = '';
    }
  }

  function process(chunk: string): ParserEvent[] {
    if (!chunk || typeof chunk !== 'string') {
      return [];
    }

    buffer += chunk;

    if (buffer.length > MAX_BUFFER_SIZE) {
      const excess = buffer.length - MAX_BUFFER_SIZE;
      buffer = buffer.slice(excess);
    }

    const events: ParserEvent[] = [];
    let prevLen = -1;
    let iterations = 0;
    const maxIterations = 1000;

    while (buffer.length > 0 && buffer.length !== prevLen && iterations < maxIterations) {
      prevLen = buffer.length;
      handleState(events);
      iterations++;
    }

    if (iterations >= maxIterations) {
      events.push({
        type: ParserEventType.ERROR,
        message: 'Parser exceeded maximum iterations - possible infinite loop detected'
      });
      buffer = '';
      state = StreamState.TEXT;
    }

    return events;
  }

  function flush(): ParserEvent[] {
    const events: ParserEvent[] = [];
    if (buffer.length > 0) {
      switch (state) {
        case StreamState.TEXT: events.push({ type: ParserEventType.TEXT, content: buffer }); break;
        case StreamState.THINKING: events.push({ type: ParserEventType.THINKING_CONTENT, content: buffer }, { type: ParserEventType.THINKING_END }); break;
        case StreamState.FILE: events.push({ type: ParserEventType.FILE_CONTENT, content: buffer }, { type: ParserEventType.FILE_END }, { type: ParserEventType.SANDBOX_END }); break;
        case StreamState.SANDBOX: events.push({ type: ParserEventType.SANDBOX_END }); break;
      }
      buffer = '';
    }
    state = StreamState.TEXT;
    return events;
  }

  return { process, flush };
}