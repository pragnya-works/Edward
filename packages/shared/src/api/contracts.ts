import type {
  ConnectGithubData,
  CreateGithubBranchData,
  GithubRepoStatusData,
  SyncGithubData,
} from "@edward/shared/github/types";


export interface ApiSuccessResponse<TData = unknown> {
  message: string;
  data: TData;
  timestamp: string;
}

export interface BuildError {
  id: string;
  headline: string;
  type: string;
  severity: "critical" | "error" | "warning";
  stage: string;
  confidence: number;
  error: {
    file: string;
    line: number;
    column?: number;
    message: string;
    code?: string;
    snippet: string;
    fullContent?: string;
    target?: string;
    stackTrace?: string[];
  };
  context: {
    packageJson?: Record<string, unknown>;
    tsConfig?: Record<string, unknown>;
    importChain?: Array<{ file: string; line: number; importPath: string }>;
    recentChanges?: string[];
  };
  relatedErrors: string[];
  relatedFiles: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  suggestion?: string;
  timestamp: string;
}

export interface BuildErrorReport {
  failed: true;
  headline: string;
  summary: {
    totalErrors: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    uniqueTypes: string[];
    stage: string;
  };
  errors: BuildError[];
  rootCause?: BuildError;
  framework?: string;
  command: string;
  rawOutput: string;
  userFacing?: {
    shortMessage: string;
    pinpoint: {
      file: string;
      line: number;
      column?: number;
      code?: string;
      type?: string;
      confidence?: number;
    };
    probableCause: string;
    pinpointContext: string;
    preciseFix: string;
    nextStep: string;
  };
  processedAt: string;
  duration: number;
}

export enum BuildRecordStatus {
  QUEUED = "queued",
  BUILDING = "building",
  SUCCESS = "success",
  FAILED = "failed",
}

export interface BuildStatusResponse {
  message: string;
  data: {
    chatId: string;
    build: {
      id: string;
      status: BuildRecordStatus;
      previewUrl: string | null;
      buildDuration: number | null;
      errorReport: BuildErrorReport | null;
      createdAt: string;
    } | null;
  };
}

export interface PromptEnhanceResponse {
  message: string;
  data: {
    enhancedPrompt: string;
    provider: "openai" | "gemini";
    model: string;
  };
}

export interface RebuildResponse {
  message: string;
  data: {
    chatId: string;
    build: {
      id: string;
      status: BuildRecordStatus;
      previewUrl: string | null;
      buildDuration: number | null;
      errorReport: BuildErrorReport | null;
      createdAt: string;
    };
  };
}

export interface ActiveRunResponse {
  message: string;
  data: {
    chatId: string;
    run: {
      id: string;
      status: "queued" | "running";
      state: string;
      currentTurn: number;
      createdAt: string;
      startedAt: string | null;
      userMessageId: string;
      assistantMessageId: string;
    } | null;
  };
}

export interface SandboxFileContract {
  path: string;
  content: string;
  isComplete: boolean;
}

export interface SandboxFilesResponse {
  message: string;
  data: {
    chatId: string;
    sandboxId: string;
    files: SandboxFileContract[];
    totalFiles: number;
  };
}

export interface SubdomainAvailabilityResponse {
  message: string;
  data: {
    subdomain: string;
    available: boolean;
    reason?: string;
  };
}

export interface UpdateSubdomainResponse {
  message: string;
  data: {
    subdomain: string;
    previewUrl: string;
  };
}



export type GithubRepoStatusResponse = ApiSuccessResponse<GithubRepoStatusData>;
export type ConnectGithubResponse = ApiSuccessResponse<ConnectGithubData>;
export type CreateGithubBranchResponse =
  ApiSuccessResponse<CreateGithubBranchData>;
export type SyncGithubResponse = ApiSuccessResponse<SyncGithubData>;
