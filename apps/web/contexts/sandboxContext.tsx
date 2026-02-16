"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import type { BuildErrorReport } from "@/lib/api";

export interface SandboxFile {
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
  openSandbox: () => void;
  closeSandbox: () => void;
  toggleSandbox: () => void;
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

export function SandboxProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setModeState] = useState<SandboxMode>(SandboxMode.CODE);
  const [files, setFilesState] = useState<SandboxFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrlState] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>(
    BuildStatus.IDLE,
  );
  const [buildError, setBuildError] = useState<string | null>(null);
  const [fullErrorReport, setFullErrorReport] =
    useState<BuildErrorReport | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingFilePath, setStreamingFilePath] = useState<string | null>(
    null,
  );
  const [localEdits, setLocalEdits] = useState<Map<string, string>>(new Map());

  const openSandbox = useCallback(() => setIsOpen(true), []);
  const closeSandbox = useCallback(() => setIsOpen(false), []);
  const toggleSandbox = useCallback(() => setIsOpen((prev) => !prev), []);

  const setMode = useCallback(
    (newMode: SandboxMode) => setModeState(newMode),
    [],
  );

  const setActiveFile = useCallback((path: string | null) => {
    setActiveFilePath(path);
  }, []);

  const setPreviewUrl = useCallback((url: string | null) => {
    let sanitizedUrl = url;
    if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
      sanitizedUrl = `https://${url}`;
    }
    setPreviewUrlState(sanitizedUrl);
    if (sanitizedUrl) {
      setModeState(SandboxMode.PREVIEW);
      setBuildStatus(BuildStatus.SUCCESS);
    }
  }, []);

  const updateFile = useCallback((file: SandboxFile) => {
    setFilesState((prev) => {
      const existingIndex = prev.findIndex((f) => f.path === file.path);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = file;
        return updated;
      }
      return [...prev, file];
    });
  }, []);

  const setFiles = useCallback((newFiles: SandboxFile[]) => {
    setFilesState(newFiles);
  }, []);

  const startStreaming = useCallback((filePath: string) => {
    setIsStreaming(true);
    setStreamingFilePath(filePath);
    setActiveFilePath(filePath);
  }, []);

  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    setStreamingFilePath(null);
  }, []);

  const clearFiles = useCallback(() => {
    setFilesState([]);
    setActiveFilePath(null);
    setPreviewUrlState(null);
    setBuildStatus(BuildStatus.IDLE);
    setBuildError(null);
    setFullErrorReport(null);
    setLocalEdits(new Map());
  }, []);

  const setLocalEdit = useCallback((path: string, content: string) => {
    setLocalEdits((prev) => {
      const next = new Map(prev);
      next.set(path, content);
      return next;
    });
  }, []);

  const clearLocalEdit = useCallback((path: string) => {
    setLocalEdits((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const clearAllLocalEdits = useCallback(() => {
    setLocalEdits(new Map());
  }, []);

  const getFileContent = useCallback(
    (path: string): string => {
      const localEdit = localEdits.get(path);
      if (localEdit !== undefined) {
        return localEdit;
      }
      const file = files.find((f) => f.path === path);
      return file?.content ?? "";
    },
    [files, localEdits],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key === "p"
      ) {
        event.preventDefault();
        toggleSandbox();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSandbox]);

  const value = useMemo<SandboxContextValue>(
    () => ({
      isOpen,
      mode,
      files,
      activeFilePath,
      previewUrl,
      buildStatus,
      isStreaming,
      streamingFilePath,
      localEdits,
      openSandbox,
      closeSandbox,
      toggleSandbox,
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
      buildError,
      setBuildError,
      fullErrorReport,
      setFullErrorReport,
    }),
    [
      isOpen,
      mode,
      files,
      activeFilePath,
      previewUrl,
      buildStatus,
      buildError,
      fullErrorReport,
      isStreaming,
      streamingFilePath,
      localEdits,
      openSandbox,
      closeSandbox,
      toggleSandbox,
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
