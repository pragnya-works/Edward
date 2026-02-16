import { INITIAL_STREAM_STATE, type MetaEvent, type StreamState, type StreamedFile } from "@/lib/chatTypes";

export type StreamAction =
  | { type: "RESET" }
  | { type: "START_STREAMING" }
  | { type: "STOP_STREAMING" }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_META"; meta: MetaEvent }
  | { type: "APPEND_TEXT"; text: string }
  | { type: "START_THINKING" }
  | { type: "APPEND_THINKING"; text: string }
  | { type: "END_THINKING"; duration: number | null }
  | { type: "START_FILE"; file: StreamedFile }
  | { type: "APPEND_FILE_CONTENT"; path: string; content: string }
  | { type: "COMPLETE_FILE"; path: string }
  | { type: "SET_INSTALLING_DEPS"; deps: string[] }
  | { type: "SET_SANDBOXING"; isSandboxing: boolean }
  | { type: "SET_COMMAND"; command: StreamState["command"] }
  | { type: "SET_METRICS"; metrics: StreamState["metrics"] }
  | { type: "SET_PREVIEW_URL"; url: string };

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "RESET":
      return INITIAL_STREAM_STATE;
    case "START_STREAMING":
      return { ...INITIAL_STREAM_STATE, isStreaming: true };
    case "STOP_STREAMING":
      return { ...state, isStreaming: false };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_META":
      return { ...state, meta: action.meta };
    case "APPEND_TEXT":
      return { ...state, streamingText: state.streamingText + action.text };
    case "START_THINKING":
      return { ...state, isThinking: true, thinkingDuration: null };
    case "APPEND_THINKING":
      return { ...state, thinkingText: state.thinkingText + action.text };
    case "END_THINKING":
      return { ...state, isThinking: false, thinkingDuration: action.duration };
    case "START_FILE":
      return { ...state, activeFiles: [...state.activeFiles, action.file] };
    case "APPEND_FILE_CONTENT":
      return {
        ...state,
        activeFiles: state.activeFiles.map((file) =>
          file.path === action.path
            ? { ...file, content: file.content + action.content }
            : file,
        ),
      };
    case "COMPLETE_FILE": {
      const file = state.activeFiles.find((activeFile) => activeFile.path === action.path);
      if (!file) return state;
      return {
        ...state,
        activeFiles: state.activeFiles.filter((activeFile) => activeFile.path !== action.path),
        completedFiles: [...state.completedFiles, { ...file, isComplete: true }],
      };
    }
    case "SET_INSTALLING_DEPS":
      return { ...state, installingDeps: action.deps };
    case "SET_SANDBOXING":
      return { ...state, isSandboxing: action.isSandboxing };
    case "SET_COMMAND":
      return { ...state, command: action.command };
    case "SET_METRICS":
      return { ...state, metrics: action.metrics };
    case "SET_PREVIEW_URL":
      return { ...state, previewUrl: action.url };
    default:
      return state;
  }
}