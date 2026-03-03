import {
  StreamState,
  type ParserEvent,
} from "../../schemas/chat.schema.js";
import {
  ParserEventType,
} from "@edward/shared/streamEvents";
import {
  MAX_BUFFER_SIZE,
  MAX_ITERATIONS,
  type ParserContext,
} from "./parser.shared.js";
import {
  emitContentEvent,
  handleFileState,
  handleInstallState,
  parseInstallContent,
} from "./parser.content.js";
import {
  handleSandboxState,
  handleTextState,
  handleThinkingState,
} from "./parser.textSandbox.js";

export function createStreamParser() {
  const context: ParserContext = {
    state: StreamState.TEXT,
    buffer: "",
  };

  function handleState(events: ParserEvent[]): void {
    switch (context.state) {
      case StreamState.TEXT:
        handleTextState(context, events);
        break;
      case StreamState.THINKING:
        handleThinkingState(context, events);
        break;
      case StreamState.SANDBOX:
        handleSandboxState(context, events);
        break;
      case StreamState.FILE:
        handleFileState(context, events);
        break;
      case StreamState.INSTALL:
        handleInstallState(context, events);
        break;
    }
  }

  function process(chunk: string): ParserEvent[] {
    if (!chunk || typeof chunk !== "string") {
      return [];
    }

    context.buffer += chunk;

    if (context.buffer.length > MAX_BUFFER_SIZE) {
      context.buffer = context.buffer.slice(context.buffer.length - MAX_BUFFER_SIZE);
    }

    const events: ParserEvent[] = [];
    let prevLen = -1;
    let iterations = 0;

    while (
      context.buffer.length > 0 &&
      context.buffer.length !== prevLen &&
      iterations < MAX_ITERATIONS
    ) {
      prevLen = context.buffer.length;
      handleState(events);
      iterations++;
    }

    if (iterations >= MAX_ITERATIONS) {
      events.push({
        type: ParserEventType.ERROR,
        message:
          "Parser exceeded maximum iterations - possible infinite loop detected",
        code: "parser_iterations_exceeded",
        severity: "fatal",
      });
      context.buffer = "";
      context.state = StreamState.TEXT;
    }

    return events;
  }

  function flush(): ParserEvent[] {
    const events: ParserEvent[] = [];

    if (context.buffer.length > 0) {
      switch (context.state) {
        case StreamState.TEXT:
          emitContentEvent(events, ParserEventType.TEXT, context.buffer);
          break;

        case StreamState.THINKING:
          emitContentEvent(events, ParserEventType.THINKING_CONTENT, context.buffer);
          events.push({ type: ParserEventType.THINKING_END });
          break;

        case StreamState.FILE:
          emitContentEvent(events, ParserEventType.FILE_CONTENT, context.buffer);
          events.push(
            { type: ParserEventType.FILE_END },
            { type: ParserEventType.SANDBOX_END },
          );
          break;

        case StreamState.SANDBOX:
          events.push({ type: ParserEventType.SANDBOX_END });
          break;

        case StreamState.INSTALL: {
          const content = context.buffer.trim();
          if (content) {
            const parsed = parseInstallContent(content);
            events.push({
              type: ParserEventType.INSTALL_CONTENT,
              dependencies: parsed.dependencies,
              framework: parsed.framework,
            });
          }
          events.push({ type: ParserEventType.INSTALL_END });
          break;
        }
      }
      context.buffer = "";
    }

    context.state = StreamState.TEXT;
    return events;
  }

  return { process, flush };
}
