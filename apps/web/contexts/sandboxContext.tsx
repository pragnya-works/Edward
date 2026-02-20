"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import type { BuildErrorReport } from "@/lib/api";

interface SandboxFile {
  path: string;
  content: string;
  isComplete: boolean;
}

export enum SandboxMode {
  CODE = "code",
  PREVIEW = "preview",
}

export enum BuildStatus {
  IDLE = "idle",
  QUEUED = "queued",
  BUILDING = "building",
  SUCCESS = "success",
  FAILED = "failed",
}

interface SandboxState {
  isOpen: boolean;
  mode: SandboxMode;
  files: SandboxFile[];
  activeFilePath: string | null;
  previewUrl: string | null;
  buildStatus: BuildStatus;
  buildError: string | null;
  fullErrorReport: BuildErrorReport | null;
  isStreaming: boolean;
  streamingFilePath: string | null;
  localEdits: Map<string, string>;
  isSearchOpen: boolean;
}

interface SandboxContextValue {
  isOpen: boolean;
  mode: SandboxMode;
  files: SandboxFile[];
  activeFilePath: string | null;
  previewUrl: string | null;
  buildStatus: BuildStatus;
  buildError: string | null;
  fullErrorReport: BuildErrorReport | null;
  isStreaming: boolean;
  streamingFilePath: string | null;
  localEdits: Map<string, string>;
  isSearchOpen: boolean;
  openSandbox: () => void;
  closeSandbox: () => void;
  toggleSandbox: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  setMode: (mode: SandboxMode) => void;
  setActiveFile: (path: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  updateFile: (file: SandboxFile) => void;
  setFiles: (files: SandboxFile[]) => void;
  startStreaming: (filePath: string) => void;
  stopStreaming: () => void;
  clearFiles: () => void;
  setLocalEdit: (path: string, content: string) => void;
  clearLocalEdit: (path: string) => void;
  clearAllLocalEdits: () => void;
  getFileContent: (path: string) => string;
  setBuildStatus: (status: BuildStatus) => void;
  setBuildError: (error: string | null) => void;
  setFullErrorReport: (report: BuildErrorReport | null) => void;
}

const SandboxContext = createContext<SandboxContextValue | null>(null);

const INITIAL_SANDBOX_STATE: SandboxState = {
  isOpen: false,
  mode: SandboxMode.CODE,
  files: [],
  activeFilePath: null,
  previewUrl: null,
  buildStatus: BuildStatus.IDLE,
  buildError: null,
  fullErrorReport: null,
  isStreaming: false,
  streamingFilePath: null,
  localEdits: new Map(),
  isSearchOpen: false,
};

enum SandboxActionType {
  OPEN = "OPEN",
  CLOSE = "CLOSE",
  TOGGLE = "TOGGLE",
  SET_MODE = "SET_MODE",
  SET_ACTIVE_FILE = "SET_ACTIVE_FILE",
  SET_PREVIEW_URL = "SET_PREVIEW_URL",
  UPDATE_FILE = "UPDATE_FILE",
  SET_FILES = "SET_FILES",
  START_STREAMING = "START_STREAMING",
  STOP_STREAMING = "STOP_STREAMING",
  CLEAR_FILES = "CLEAR_FILES",
  SET_LOCAL_EDIT = "SET_LOCAL_EDIT",
  CLEAR_LOCAL_EDIT = "CLEAR_LOCAL_EDIT",
  CLEAR_ALL_LOCAL_EDITS = "CLEAR_ALL_LOCAL_EDITS",
  SET_BUILD_STATUS = "SET_BUILD_STATUS",
  SET_BUILD_ERROR = "SET_BUILD_ERROR",
  SET_FULL_ERROR_REPORT = "SET_FULL_ERROR_REPORT",
  OPEN_SEARCH = "OPEN_SEARCH",
  CLOSE_SEARCH = "CLOSE_SEARCH",
  TOGGLE_SEARCH = "TOGGLE_SEARCH",
}

type SandboxAction =
  | { type: SandboxActionType.OPEN }
  | { type: SandboxActionType.CLOSE }
  | { type: SandboxActionType.TOGGLE }
  | { type: SandboxActionType.SET_MODE; mode: SandboxMode }
  | { type: SandboxActionType.SET_ACTIVE_FILE; path: string | null }
  | { type: SandboxActionType.SET_PREVIEW_URL; url: string | null }
  | { type: SandboxActionType.UPDATE_FILE; file: SandboxFile }
  | { type: SandboxActionType.SET_FILES; files: SandboxFile[] }
  | { type: SandboxActionType.START_STREAMING; filePath: string }
  | { type: SandboxActionType.STOP_STREAMING }
  | { type: SandboxActionType.CLEAR_FILES }
  | {
    type: SandboxActionType.SET_LOCAL_EDIT;
    path: string;
    content: string;
  }
  | { type: SandboxActionType.CLEAR_LOCAL_EDIT; path: string }
  | { type: SandboxActionType.CLEAR_ALL_LOCAL_EDITS }
  | { type: SandboxActionType.SET_BUILD_STATUS; status: BuildStatus }
  | { type: SandboxActionType.SET_BUILD_ERROR; error: string | null }
  | {
    type: SandboxActionType.SET_FULL_ERROR_REPORT;
    report: BuildErrorReport | null;
  }
  | { type: SandboxActionType.OPEN_SEARCH }
  | { type: SandboxActionType.CLOSE_SEARCH }
  | { type: SandboxActionType.TOGGLE_SEARCH };

function sanitizePreviewUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

function sandboxReducer(state: SandboxState, action: SandboxAction): SandboxState {
  switch (action.type) {
    case SandboxActionType.OPEN:
      return { ...state, isOpen: true };
    case SandboxActionType.CLOSE:
      return { ...state, isOpen: false };
    case SandboxActionType.TOGGLE:
      return { ...state, isOpen: !state.isOpen };
    case SandboxActionType.SET_MODE:
      return { ...state, mode: action.mode };
    case SandboxActionType.SET_ACTIVE_FILE:
      return { ...state, activeFilePath: action.path };
    case SandboxActionType.SET_PREVIEW_URL: {
      const previewUrl = sanitizePreviewUrl(action.url);
      return {
        ...state,
        previewUrl,
      };
    }
    case SandboxActionType.UPDATE_FILE: {
      const existingIndex = state.files.findIndex((f) => f.path === action.file.path);
      if (existingIndex >= 0) {
        const files = [...state.files];
        files[existingIndex] = action.file;
        return { ...state, files };
      }
      return { ...state, files: [...state.files, action.file] };
    }
    case SandboxActionType.SET_FILES:
      return { ...state, files: action.files };
    case SandboxActionType.START_STREAMING:
      return {
        ...state,
        isStreaming: true,
        streamingFilePath: action.filePath,
        activeFilePath: action.filePath,
      };
    case SandboxActionType.STOP_STREAMING:
      return {
        ...state,
        isStreaming: false,
        streamingFilePath: null,
      };
    case SandboxActionType.CLEAR_FILES:
      return {
        ...state,
        files: [],
        activeFilePath: null,
        previewUrl: null,
        buildStatus: BuildStatus.IDLE,
        buildError: null,
        fullErrorReport: null,
        localEdits: new Map(),
      };
    case SandboxActionType.SET_LOCAL_EDIT: {
      const localEdits = new Map(state.localEdits);
      localEdits.set(action.path, action.content);
      return { ...state, localEdits };
    }
    case SandboxActionType.CLEAR_LOCAL_EDIT: {
      const localEdits = new Map(state.localEdits);
      localEdits.delete(action.path);
      return { ...state, localEdits };
    }
    case SandboxActionType.CLEAR_ALL_LOCAL_EDITS:
      return { ...state, localEdits: new Map() };
    case SandboxActionType.SET_BUILD_STATUS:
      return { ...state, buildStatus: action.status };
    case SandboxActionType.SET_BUILD_ERROR:
      return { ...state, buildError: action.error };
    case SandboxActionType.SET_FULL_ERROR_REPORT:
      return { ...state, fullErrorReport: action.report };
    case SandboxActionType.OPEN_SEARCH:
      return { ...state, isSearchOpen: true };
    case SandboxActionType.CLOSE_SEARCH:
      return { ...state, isSearchOpen: false };
    case SandboxActionType.TOGGLE_SEARCH:
      return { ...state, isSearchOpen: !state.isSearchOpen };
    default:
      return state;
  }
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function SandboxProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sandboxReducer, INITIAL_SANDBOX_STATE);

  const openSandbox = useCallback(
    () => dispatch({ type: SandboxActionType.OPEN }),
    [],
  );
  const closeSandbox = useCallback(
    () => dispatch({ type: SandboxActionType.CLOSE }),
    [],
  );
  const toggleSandbox = useCallback(
    () => dispatch({ type: SandboxActionType.TOGGLE }),
    [],
  );

  const openSearch = useCallback(
    () => dispatch({ type: SandboxActionType.OPEN_SEARCH }),
    [],
  );
  const closeSearch = useCallback(
    () => dispatch({ type: SandboxActionType.CLOSE_SEARCH }),
    [],
  );
  const toggleSearch = useCallback(
    () => dispatch({ type: SandboxActionType.TOGGLE_SEARCH }),
    [],
  );

  const setMode = useCallback((mode: SandboxMode) => {
    dispatch({ type: SandboxActionType.SET_MODE, mode });
  }, []);

  const setActiveFile = useCallback((path: string | null) => {
    dispatch({ type: SandboxActionType.SET_ACTIVE_FILE, path });
  }, []);

  const setPreviewUrl = useCallback((url: string | null) => {
    dispatch({ type: SandboxActionType.SET_PREVIEW_URL, url });
  }, []);

  const updateFile = useCallback((file: SandboxFile) => {
    dispatch({ type: SandboxActionType.UPDATE_FILE, file });
  }, []);

  const setFiles = useCallback((files: SandboxFile[]) => {
    dispatch({ type: SandboxActionType.SET_FILES, files });
  }, []);

  const startStreaming = useCallback((filePath: string) => {
    dispatch({ type: SandboxActionType.START_STREAMING, filePath });
  }, []);

  const stopStreaming = useCallback(() => {
    dispatch({ type: SandboxActionType.STOP_STREAMING });
  }, []);

  const clearFiles = useCallback(() => {
    dispatch({ type: SandboxActionType.CLEAR_FILES });
  }, []);

  const setLocalEdit = useCallback((path: string, content: string) => {
    dispatch({ type: SandboxActionType.SET_LOCAL_EDIT, path, content });
  }, []);

  const clearLocalEdit = useCallback((path: string) => {
    dispatch({ type: SandboxActionType.CLEAR_LOCAL_EDIT, path });
  }, []);

  const clearAllLocalEdits = useCallback(() => {
    dispatch({ type: SandboxActionType.CLEAR_ALL_LOCAL_EDITS });
  }, []);

  const getFileContent = useCallback(
    (path: string): string => {
      const localEdit = state.localEdits.get(path);
      if (localEdit !== undefined) {
        return localEdit;
      }
      const file = state.files.find((f) => f.path === path);
      return file?.content ?? "";
    },
    [state.files, state.localEdits],
  );

  const setBuildStatus = useCallback((status: BuildStatus) => {
    dispatch({ type: SandboxActionType.SET_BUILD_STATUS, status });
  }, []);

  const setBuildError = useCallback((error: string | null) => {
    dispatch({ type: SandboxActionType.SET_BUILD_ERROR, error });
  }, []);

  const setFullErrorReport = useCallback((report: BuildErrorReport | null) => {
    dispatch({ type: SandboxActionType.SET_FULL_ERROR_REPORT, report });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "p") {
        return;
      }
      if (event.shiftKey) {
        return;
      }
      if (
        state.isOpen
      ) {
        event.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isOpen, toggleSearch]);

  const value = useMemo<SandboxContextValue>(
    () => ({
      isOpen: state.isOpen,
      mode: state.mode,
      files: state.files,
      activeFilePath: state.activeFilePath,
      previewUrl: state.previewUrl,
      buildStatus: state.buildStatus,
      buildError: state.buildError,
      fullErrorReport: state.fullErrorReport,
      isStreaming: state.isStreaming,
      streamingFilePath: state.streamingFilePath,
      localEdits: state.localEdits,
      isSearchOpen: state.isSearchOpen,
      openSandbox,
      closeSandbox,
      toggleSandbox,
      openSearch,
      closeSearch,
      toggleSearch,
      setMode,
      setActiveFile,
      setPreviewUrl,
      updateFile,
      setFiles,
      startStreaming,
      stopStreaming,
      clearFiles,
      setLocalEdit,
      clearLocalEdit,
      clearAllLocalEdits,
      getFileContent,
      setBuildStatus,
      setBuildError,
      setFullErrorReport,
    }),
    [
      state,
      openSandbox,
      closeSandbox,
      toggleSandbox,
      openSearch,
      closeSearch,
      toggleSearch,
      setMode,
      setActiveFile,
      setPreviewUrl,
      updateFile,
      setFiles,
      startStreaming,
      stopStreaming,
      clearFiles,
      setLocalEdit,
      clearLocalEdit,
      clearAllLocalEdits,
      getFileContent,
      setBuildStatus,
      setBuildError,
      setFullErrorReport,
    ],
  );

  return (
    <SandboxContext.Provider value={value}>{children}</SandboxContext.Provider>
  );
}

export function useSandbox() {
  const ctx = useContext(SandboxContext);
  if (!ctx) {
    throw new Error("useSandbox must be used within a SandboxProvider");
  }
  return ctx;
}
