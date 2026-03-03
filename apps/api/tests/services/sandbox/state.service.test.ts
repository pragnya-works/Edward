import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxInstance } from "../../../services/sandbox/types.service.js";

const mocks = vi.hoisted(() => {
  const pipeline = {
    set: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  return {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => pipeline),
    pipelineRef: pipeline,
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock("../../../lib/redis.js", () => ({
  redis: {
    set: mocks.set,
    get: mocks.get,
    del: mocks.del,
    pipeline: mocks.pipeline,
  },
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

describe("sandbox state service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockReset();
    mocks.set.mockResolvedValue("OK");
    mocks.del.mockResolvedValue(1);
    mocks.pipelineRef.set.mockReturnThis();
    mocks.pipelineRef.pexpire.mockReturnThis();
    mocks.pipelineRef.exec.mockResolvedValue([]);
  });

  it("saves sandbox snapshot and chat indexes", async () => {
    const { saveSandboxState } = await import("../../../services/sandbox/state.service.js");

    const sandbox: SandboxInstance = {
      id: "sb-1",
      containerId: "ctr-1",
      expiresAt: Date.now() + 60000,
      userId: "user-1",
      chatId: "chat-1",
      scaffoldedFramework: "nextjs",
      requestedPackages: ["zod"],
    };

    await saveSandboxState(sandbox);

    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect(mocks.pipelineRef.set).toHaveBeenCalledTimes(3);
    const statePayload = JSON.parse(mocks.pipelineRef.set.mock.calls[0]?.[1] as string);
    expect(statePayload).toMatchObject({
      id: "sb-1",
      chatId: "chat-1",
      scaffoldedFramework: "nextjs",
      requestedPackages: ["zod"],
    });
  });

  it("does not write framework index when scaffolded framework is absent", async () => {
    const { saveSandboxState } = await import("../../../services/sandbox/state.service.js");

    await saveSandboxState({
      id: "sb-plain",
      containerId: "ctr-plain",
      expiresAt: Date.now() + 60_000,
      userId: "user-plain",
      chatId: "chat-plain",
    });

    expect(mocks.pipelineRef.set).toHaveBeenCalledTimes(2);
  });

  it("throws a stable persistence error when redis write fails", async () => {
    const { saveSandboxState } = await import("../../../services/sandbox/state.service.js");

    mocks.pipelineRef.exec.mockResolvedValueOnce([
      [new Error("redis write failed"), null],
    ]);

    await expect(
      saveSandboxState({
        id: "sb-1",
        containerId: "ctr-1",
        expiresAt: Date.now() + 60000,
        userId: "user-1",
        chatId: "chat-1",
      }),
    ).rejects.toThrow("Failed to persist sandbox state");

    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("returns null and deletes corrupted sandbox state", async () => {
    const { getSandboxState } = await import("../../../services/sandbox/state.service.js");

    mocks.get.mockResolvedValueOnce("{not-json");

    const state = await getSandboxState("sb-corrupt");

    expect(state).toBeNull();
    expect(mocks.del).toHaveBeenCalledWith("edward:sandbox:sb-corrupt");
  });

  it("returns a cloned sandbox state when payload is valid", async () => {
    const { getSandboxState } = await import("../../../services/sandbox/state.service.js");

    mocks.get.mockResolvedValueOnce(
      JSON.stringify({
        id: "sb-2",
        containerId: "ctr-2",
        expiresAt: 123,
        userId: "user-2",
        chatId: "chat-2",
        requestedPackages: ["react"],
      }),
    );

    const state = await getSandboxState("sb-2");

    expect(state).toEqual({
      id: "sb-2",
      containerId: "ctr-2",
      expiresAt: 123,
      userId: "user-2",
      chatId: "chat-2",
      requestedPackages: ["react"],
      scaffoldedFramework: undefined,
    });

    state?.requestedPackages?.push("vite");
    expect(mocks.get).toHaveBeenCalledWith("edward:sandbox:sb-2");
  });

  it("drops invalid sandbox payloads with missing required fields", async () => {
    const { getSandboxState } = await import("../../../services/sandbox/state.service.js");

    mocks.get.mockResolvedValueOnce(
      JSON.stringify({
        id: "sb-invalid",
        containerId: "ctr-invalid",
        expiresAt: 123,
        chatId: "chat-invalid",
      }),
    );

    const state = await getSandboxState("sb-invalid");

    expect(state).toBeNull();
    expect(mocks.del).toHaveBeenCalledWith("edward:sandbox:sb-invalid");
  });

  it("loads active sandbox state by chat id", async () => {
    const { getActiveSandboxState } = await import("../../../services/sandbox/state.service.js");

    mocks.get
      .mockResolvedValueOnce("sb-3")
      .mockResolvedValueOnce(
        JSON.stringify({
          id: "sb-3",
          containerId: "ctr-3",
          expiresAt: 456,
          userId: "user-3",
          chatId: "chat-3",
        }),
      );

    const state = await getActiveSandboxState("chat-3");

    expect(state?.id).toBe("sb-3");
    expect(mocks.get).toHaveBeenNthCalledWith(1, "edward:chat:sandbox:chat-3");
    expect(mocks.get).toHaveBeenNthCalledWith(2, "edward:sandbox:sb-3");
  });

  it("returns null when sandbox lookup by chat id fails", async () => {
    const { getActiveSandboxState } = await import("../../../services/sandbox/state.service.js");

    mocks.get.mockRejectedValueOnce(new Error("redis lookup failed"));

    await expect(getActiveSandboxState("chat-err")).resolves.toBeNull();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("refreshes TTL for sandbox and optional chat index", async () => {
    const { refreshSandboxTTL } = await import("../../../services/sandbox/state.service.js");

    await refreshSandboxTTL("sb-4", "chat-4");

    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect(mocks.pipelineRef.pexpire).toHaveBeenCalledTimes(2);
    expect(mocks.pipelineRef.exec).toHaveBeenCalledTimes(1);
  });

  it("refreshes only sandbox TTL when chat id is not provided", async () => {
    const { refreshSandboxTTL } = await import("../../../services/sandbox/state.service.js");

    await refreshSandboxTTL("sb-ttl-only");

    expect(mocks.pipelineRef.pexpire).toHaveBeenCalledTimes(1);
    expect(mocks.pipelineRef.pexpire).toHaveBeenCalledWith(
      "edward:sandbox:sb-ttl-only",
      expect.any(Number),
    );
  });

  it("returns framework value on successful lookup", async () => {
    const { getChatFramework } = await import("../../../services/sandbox/state.service.js");

    mocks.get.mockResolvedValueOnce("nextjs");

    await expect(getChatFramework("chat-framework")).resolves.toBe("nextjs");
  });

  it("returns null for framework lookup errors", async () => {
    const { getChatFramework } = await import("../../../services/sandbox/state.service.js");

    mocks.get.mockRejectedValueOnce(new Error("redis down"));

    await expect(getChatFramework("chat-5")).resolves.toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalled();
  });
});
