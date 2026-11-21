import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes warnings with the scope", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("scope", "something odd");
    expect(warn).toHaveBeenCalledWith("[scope] something odd");
  });

  it("includes context on warnings when provided", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("scope", "something odd", { chatId: "c1" });
    expect(warn).toHaveBeenCalledWith("[scope] something odd", { chatId: "c1" });
  });

  it("logs the error object together with context", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("boom");
    logger.error("scope", "failed", cause, { chatId: "c1" });
    expect(error).toHaveBeenCalledWith("[scope] failed", {
      chatId: "c1",
      error: cause,
    });
  });
});
