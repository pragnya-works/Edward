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

/**
 * A state-machine parser that processes LLM streams byte-by-byte.
 * It extracts structured data from custom tags like <Thinking>, <edward_sandbox>, and <file>.
 * Includes lookahead buffering to handle split tags and path sanitization for security.
 */
export function createStreamParser() {
  let state: StreamState = StreamState.TEXT;
  let buffer: string = '';
  const bufferSize = 1024; // 1KB lookahead

  function containsPartialTag(str: string): boolean {
    const lastLt = str.lastIndexOf('<');
    if (lastLt === -1) return false;
    const afterLt = str.slice(lastLt);
    return afterLt.indexOf('>') === -1;
  }

  function handleTextState(events: ParserEvent[]): void {
    const thinkingStart = buffer.indexOf(TAGS.THINKING_START);
    const sandboxStart = buffer.indexOf(TAGS.SANDBOX_START);

    let nextTagIndex = -1;
    let nextState: StreamState | null = null;

    if (thinkingStart !== -1 && (sandboxStart === -1 || thinkingStart < sandboxStart)) {
      nextTagIndex = thinkingStart;
      nextState = StreamState.THINKING;
    } else if (sandboxStart !== -1) {
      nextTagIndex = sandboxStart;
      nextState = StreamState.SANDBOX;
    }

    if (nextTagIndex !== -1) {
      if (nextTagIndex > 0) {
        events.push({ type: ParserEventType.TEXT, content: buffer.slice(0, nextTagIndex) });
      }
      
      buffer = buffer.slice(nextTagIndex);

      if (nextState === StreamState.THINKING) {
        buffer = buffer.slice(TAGS.THINKING_START.length);
        state = StreamState.THINKING;
        events.push({ type: ParserEventType.THINKING_START });
      } else if (nextState === StreamState.SANDBOX) {
        const tagEnd = buffer.indexOf('>');
        if (tagEnd !== -1) {
          const tagContent = buffer.slice(0, tagEnd + 1);
          const projectMatch = tagContent.match(/project="([^"]*)"/);
          const baseMatch = tagContent.match(/base="([^"]*)"/);
          
          state = StreamState.SANDBOX;
          events.push({
            type: ParserEventType.SANDBOX_START,
            project: projectMatch ? projectMatch[1] : undefined,
            base: baseMatch ? baseMatch[1] : undefined
          });
          
          buffer = buffer.slice(tagEnd + 1);
        }
      }
    } else {
      const lastLt = buffer.lastIndexOf('<');
      if (lastLt !== -1 && buffer.length - lastLt < 50) {
         if (lastLt > 0) {
             events.push({ type: ParserEventType.TEXT, content: buffer.slice(0, lastLt) });
             buffer = buffer.slice(lastLt);
         }
         return; 
      }

      events.push({ type: ParserEventType.TEXT, content: buffer });
      buffer = '';
    }
  }

  function handleThinkingState(events: ParserEvent[]): void {
    const endTag = TAGS.THINKING_END;
    const endIdx = buffer.indexOf(endTag);

    if (endIdx !== -1) {
      if (endIdx > 0) {
        events.push({ type: ParserEventType.THINKING_CONTENT, content: buffer.slice(0, endIdx) });
      }
      buffer = buffer.slice(endIdx + endTag.length);
      state = StreamState.TEXT;
      events.push({ type: ParserEventType.THINKING_END });
    } else {
      const lastLt = buffer.lastIndexOf('<');
      if (lastLt !== -1 && buffer.length - lastLt < endTag.length) {
        if (lastLt > 0) {
            events.push({ type: ParserEventType.THINKING_CONTENT, content: buffer.slice(0, lastLt) });
            buffer = buffer.slice(lastLt);
        }
        return;
      }
      
      events.push({ type: ParserEventType.THINKING_CONTENT, content: buffer });
      buffer = '';
    }
  }

  function handleSandboxState(events: ParserEvent[]): void {
    const fileStart = buffer.indexOf(TAGS.FILE_START);
    const sandboxEnd = buffer.indexOf(TAGS.SANDBOX_END);

    let nextTagIndex = -1;
    let nextState: StreamState | null = null;
    let isEnd = false;

    if (fileStart !== -1 && (sandboxEnd === -1 || fileStart < sandboxEnd)) {
      nextTagIndex = fileStart;
      nextState = StreamState.FILE;
    } else if (sandboxEnd !== -1) {
      nextTagIndex = sandboxEnd;
      isEnd = true;
    }

    if (nextTagIndex !== -1) {
      buffer = buffer.slice(nextTagIndex);

      if (isEnd) {
        buffer = buffer.slice(TAGS.SANDBOX_END.length);
        state = StreamState.TEXT;
        events.push({ type: ParserEventType.SANDBOX_END });
      } else if (nextState === StreamState.FILE) {
        const tagEnd = buffer.indexOf('>');
        if (tagEnd !== -1) {
          const tagContent = buffer.slice(0, tagEnd + 1);
          const pathMatch = tagContent.match(/path="([^"]*)"/);
          
          if (pathMatch) {
            const rawPath = pathMatch[1] as string;
            const normalizedPath = path.posix.normalize(rawPath).replace(/^(\.\.{1,2}(\/|\\|$))+/, '');
            
            state = StreamState.FILE;
            events.push({ type: ParserEventType.FILE_START, path: normalizedPath });
          } else {
             events.push({ type: ParserEventType.ERROR, message: 'Invalid file tag: missing path' });
          }
          buffer = buffer.slice(tagEnd + 1);
        }
      }
    } else {
      const lastLt = buffer.lastIndexOf('<');
       if (lastLt === -1 && buffer.length > bufferSize) {
           buffer = ''; 
       }
    }
  }

  function handleFileState(events: ParserEvent[]): void {
    const endTag = TAGS.FILE_END;
    const endIdx = buffer.indexOf(endTag);

    if (endIdx !== -1) {
      if (endIdx > 0) {
        events.push({ type: ParserEventType.FILE_CONTENT, content: buffer.slice(0, endIdx) });
      }
      buffer = buffer.slice(endIdx + endTag.length);
      state = StreamState.SANDBOX;
      events.push({ type: ParserEventType.FILE_END });
    } else {
      const lastLt = buffer.lastIndexOf('<');
      if (lastLt !== -1 && buffer.length - lastLt < endTag.length) {
         if (lastLt > 0) {
             events.push({ type: ParserEventType.FILE_CONTENT, content: buffer.slice(0, lastLt) });
             buffer = buffer.slice(lastLt);
         }
         return;
      }
      
      events.push({ type: ParserEventType.FILE_CONTENT, content: buffer });
      buffer = '';
    }
  }

  function process(chunk: string): ParserEvent[] {
    buffer += chunk;
    const events: ParserEvent[] = [];

    let loopGuard = 0;
    const maxIterations = (buffer.length + 1) * 2;

    while (buffer.length > 0 && loopGuard < maxIterations) {
      loopGuard++;
      
      if (state === StreamState.TEXT) {
        handleTextState(events);
      } else if (state === StreamState.THINKING) {
        handleThinkingState(events);
      } else if (state === StreamState.SANDBOX) {
        handleSandboxState(events);
      } else if (state === StreamState.FILE) {
        handleFileState(events);
      }
      
      if (buffer.length < bufferSize && !containsPartialTag(buffer)) {
         break;
      }
    }

    return events;
  }

  function flush(): ParserEvent[] {
    const events: ParserEvent[] = [];
    if (buffer.length > 0) {
      if (state === StreamState.TEXT) {
        events.push({ type: ParserEventType.TEXT, content: buffer });
      } else if (state === StreamState.THINKING) {
        events.push({ type: ParserEventType.THINKING_CONTENT, content: buffer });
        events.push({ type: ParserEventType.THINKING_END });
      } else if (state === StreamState.FILE) {
        events.push({ type: ParserEventType.FILE_CONTENT, content: buffer });
        events.push({ type: ParserEventType.FILE_END });
        events.push({ type: ParserEventType.SANDBOX_END });
      } else if (state === StreamState.SANDBOX) {
        events.push({ type: ParserEventType.SANDBOX_END });
      }
      buffer = '';
    } else {
       if (state === StreamState.THINKING) {
          events.push({ type: ParserEventType.THINKING_END });
       } else if (state === StreamState.FILE) {
          events.push({ type: ParserEventType.FILE_END });
          events.push({ type: ParserEventType.SANDBOX_END });
       } else if (state === StreamState.SANDBOX) {
          events.push({ type: ParserEventType.SANDBOX_END });
       }
    }
    state = StreamState.TEXT;
    return events;
  }

  return { process, flush };
}