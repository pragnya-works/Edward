import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { ParserEventType } from "@edward/shared/streamEvents";
import type { ChatRequestContext } from "./requestContext.js";
import { getLatestBuildRecord } from "./build.repository.js";

export interface BuildStatusSummary {
  id: string;
  status: BuildRecordStatus;
  previewUrl: string | null;
  buildDuration: number | null;
  errorReport: unknown;
  createdAt: Date;
}

export type BuildStreamEvent =
  | {
    type: ParserEventType.BUILD_STATUS;
    chatId: string;
    status: BuildRecordStatus;
    buildId?: string;
    runId?: string;
    previewUrl?: string | null;
    errorReport?: unknown;
  }
  | {
    type: ParserEventType.PREVIEW_URL;
    url: string;
    chatId: string;
    runId?: string;
  };

interface BuildStreamPayload {
  buildId?: string;
  runId?: string;
  status?: BuildRecordStatus;
  previewUrl?: string | null;
  errorReport?: unknown;
}

export async function getBuildStatusUseCase(
  context: ChatRequestContext,
): Promise<BuildStatusSummary | null> {
  const latestBuild = await getLatestBuildRecord(context.chatId);
  if (!latestBuild) {
    return null;
  }

  return {
    id: latestBuild.id,
    status: toBuildRecordStatus(latestBuild.status),
    previewUrl: latestBuild.previewUrl,
    buildDuration: latestBuild.buildDuration,
    errorReport: latestBuild.errorReport,
    createdAt: latestBuild.createdAt,
  };
}

export async function getBuildBootstrapEventsUseCase(
  context: ChatRequestContext,
): Promise<BuildStreamEvent[]> {
  const latestBuild = await getLatestBuildRecord(context.chatId);
  if (!latestBuild) {
    return [];
  }

  const events: BuildStreamEvent[] = [
    {
      type: ParserEventType.BUILD_STATUS,
      chatId: context.chatId,
      status: toBuildRecordStatus(latestBuild.status),
      buildId: latestBuild.id,
      previewUrl: latestBuild.previewUrl,
      errorReport: latestBuild.errorReport,
    },
  ];

  if (latestBuild.previewUrl) {
    events.push({
      type: ParserEventType.PREVIEW_URL,
      url: latestBuild.previewUrl,
      chatId: context.chatId,
    });
  }

  return events;
}

export function parseBuildStreamPayload(
  params: {
    payload: string;
    context: ChatRequestContext;
  },
): {
  events: BuildStreamEvent[];
  terminal: boolean;
} {
  const parsed = JSON.parse(params.payload) as BuildStreamPayload;
  if (!parsed.status) {
    return {
      events: [],
      terminal: false,
    };
  }

  const events: BuildStreamEvent[] = [
    {
      type: ParserEventType.BUILD_STATUS,
      chatId: params.context.chatId,
      status: parsed.status,
      buildId: parsed.buildId,
      runId: parsed.runId,
      previewUrl: parsed.previewUrl,
      errorReport: parsed.errorReport,
    },
  ];

  if (parsed.previewUrl) {
    events.push({
      type: ParserEventType.PREVIEW_URL,
      url: parsed.previewUrl,
      chatId: params.context.chatId,
      runId: parsed.runId,
    });
  }

  return {
    events,
    terminal: isTerminalBuildStatus(parsed.status),
  };
}

function isTerminalBuildStatus(status: BuildRecordStatus): boolean {
  return status === BuildRecordStatus.SUCCESS || status === BuildRecordStatus.FAILED;
}

function toBuildRecordStatus(status: string): BuildRecordStatus {
  switch (status) {
    case BuildRecordStatus.QUEUED:
      return BuildRecordStatus.QUEUED;
    case BuildRecordStatus.BUILDING:
      return BuildRecordStatus.BUILDING;
    case BuildRecordStatus.SUCCESS:
      return BuildRecordStatus.SUCCESS;
    case BuildRecordStatus.FAILED:
      return BuildRecordStatus.FAILED;
    default:
      return BuildRecordStatus.FAILED;
  }
}
