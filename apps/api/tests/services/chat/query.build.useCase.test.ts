import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { ParserEventType } from "@edward/shared/streamEvents";

const getLatestBuildRecordMock = vi.fn();

vi.mock("../../../services/chat/query/build.repository.js", () => ({
  getLatestBuildRecord: getLatestBuildRecordMock,
}));

describe("build query use-case", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("emits bootstrap build-status and preview-url events", async () => {
    getLatestBuildRecordMock.mockResolvedValue({
      id: "build-1",
      status: BuildRecordStatus.SUCCESS,
      previewUrl: "https://preview.example.com",
      buildDuration: 1234,
      errorReport: null,
      createdAt: new Date("2026-03-03T00:00:00.000Z"),
    });

    const { getBuildBootstrapEventsUseCase } = await import(
      "../../../services/chat/query/build.useCase.js"
    );

    const events = await getBuildBootstrapEventsUseCase({
      chatId: "chat-1",
      userId: "user-1",
    });

    expect(events).toEqual([
      {
        type: ParserEventType.BUILD_STATUS,
        chatId: "chat-1",
        status: BuildRecordStatus.SUCCESS,
        buildId: "build-1",
        previewUrl: "https://preview.example.com",
        errorReport: null,
      },
      {
        type: ParserEventType.PREVIEW_URL,
        url: "https://preview.example.com",
        chatId: "chat-1",
      },
    ]);
  });

  it("parses a success build stream payload into deterministic events", async () => {
    const { parseBuildStreamPayload } = await import(
      "../../../services/chat/query/build.useCase.js"
    );

    const parsed = parseBuildStreamPayload({
      payload: JSON.stringify({
        buildId: "build-2",
        runId: "run-2",
        status: BuildRecordStatus.SUCCESS,
        previewUrl: "https://preview-two.example.com",
        errorReport: null,
      }),
      context: {
        chatId: "chat-2",
        userId: "user-2",
      },
    });

    expect(parsed).toEqual({
      events: [
        {
          type: ParserEventType.BUILD_STATUS,
          chatId: "chat-2",
          status: BuildRecordStatus.SUCCESS,
          buildId: "build-2",
          runId: "run-2",
          previewUrl: "https://preview-two.example.com",
          errorReport: null,
        },
        {
          type: ParserEventType.PREVIEW_URL,
          url: "https://preview-two.example.com",
          chatId: "chat-2",
          runId: "run-2",
        },
      ],
      terminal: true,
    });
  });

  it("returns no events when status is absent in stream payload", async () => {
    const { parseBuildStreamPayload } = await import(
      "../../../services/chat/query/build.useCase.js"
    );

    const parsed = parseBuildStreamPayload({
      payload: JSON.stringify({
        buildId: "build-3",
        runId: "run-3",
      }),
      context: {
        chatId: "chat-3",
        userId: "user-3",
      },
    });

    expect(parsed).toEqual({
      events: [],
      terminal: false,
    });
  });
});
