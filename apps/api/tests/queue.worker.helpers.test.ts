import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSandboxState: vi.fn(),
  createErrorReport: vi.fn(),
}));

vi.mock("../services/sandbox/state.service.js", () => ({
  getSandboxState: mocks.getSandboxState,
}));

vi.mock("../services/diagnostics/errorReport.js", () => ({
  createErrorReport: mocks.createErrorReport,
}));

describe("queue.worker helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null report when no error payload exists", async () => {
    const { createErrorReportIfPossible } = await import("../queue.worker.helpers.js");
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await createErrorReportIfPossible("sb-1", undefined, logger);

    expect(result).toEqual({ errorReport: null });
    expect(mocks.getSandboxState).not.toHaveBeenCalled();
    expect(mocks.createErrorReport).not.toHaveBeenCalled();
  });

  it("returns null report when sandbox has no active container", async () => {
    const { createErrorReportIfPossible } = await import("../queue.worker.helpers.js");
    const logger = { info: vi.fn(), warn: vi.fn() };
    mocks.getSandboxState.mockResolvedValueOnce({ id: "sb-1", containerId: null });

    const result = await createErrorReportIfPossible("sb-1", "build failed", logger);

    expect(result).toEqual({ errorReport: null });
    expect(mocks.getSandboxState).toHaveBeenCalledWith("sb-1");
    expect(mocks.createErrorReport).not.toHaveBeenCalled();
  });

  it("creates an error report when sandbox context is available", async () => {
    const { createErrorReportIfPossible } = await import("../queue.worker.helpers.js");
    const logger = { info: vi.fn(), warn: vi.fn() };
    const report = {
      summary: { totalErrors: 2, uniqueTypes: ["missing_import"] },
      errors: [{ id: "err-1" }],
    };

    mocks.getSandboxState.mockResolvedValueOnce({
      id: "sb-2",
      containerId: "ctr-2",
      scaffoldedFramework: "nextjs",
    });
    mocks.createErrorReport.mockResolvedValueOnce(report);

    const result = await createErrorReportIfPossible("sb-2", "Cannot find module", logger);

    expect(result).toEqual({ errorReport: report });
    expect(mocks.createErrorReport).toHaveBeenCalledWith(
      "ctr-2",
      "Cannot find module",
      "nextjs",
    );
    expect(logger.info).toHaveBeenCalledWith(
      {
        sandboxId: "sb-2",
        errorCount: 2,
        processed: 1,
        types: ["missing_import"],
      },
      "[Worker] Error report created",
    );
  });

  it("swallows diagnostics failures and logs a warning", async () => {
    const { createErrorReportIfPossible } = await import("../queue.worker.helpers.js");
    const logger = { info: vi.fn(), warn: vi.fn() };

    mocks.getSandboxState.mockResolvedValueOnce({
      id: "sb-3",
      containerId: "ctr-3",
      scaffoldedFramework: "vite",
    });
    mocks.createErrorReport.mockRejectedValueOnce(new Error("diagnostics failed"));

    const result = await createErrorReportIfPossible("sb-3", "stacktrace", logger);

    expect(result).toEqual({ errorReport: null });
    expect(logger.warn).toHaveBeenCalledWith(
      {
        error: expect.any(Error),
        sandboxId: "sb-3",
      },
      "[Worker] Error report creation failed",
    );
  });
});
