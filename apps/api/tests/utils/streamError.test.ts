import { describe, expect, it, vi, beforeEach } from "vitest";
import { HttpStatus } from "../../utils/constants.js";

const sendErrorMock = vi.fn();
const sendSSEErrorMock = vi.fn();

vi.mock("../../utils/response.js", () => ({
  sendError: sendErrorMock,
}));

vi.mock("../../services/sse-utils/service.js", () => ({
  sendSSEError: sendSSEErrorMock,
}));

describe("sendStreamError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends standard error before headers are sent", async () => {
    const { sendStreamError } = await import("../../utils/streamError.js");
    const res = {
      headersSent: false,
      writable: true,
      writableEnded: false,
      end: vi.fn(),
    } as const;

    sendStreamError(res as never, HttpStatus.BAD_REQUEST, "bad request");

    expect(sendErrorMock).toHaveBeenCalledWith(
      res,
      HttpStatus.BAD_REQUEST,
      "bad request",
    );
    expect(sendSSEErrorMock).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it("sends SSE error and ends stream when headers are already sent", async () => {
    const { sendStreamError } = await import("../../utils/streamError.js");
    const res = {
      headersSent: true,
      writable: true,
      writableEnded: false,
      end: vi.fn(),
    } as const;

    sendStreamError(res as never, HttpStatus.INTERNAL_SERVER_ERROR, "boom");

    expect(sendSSEErrorMock).toHaveBeenCalledWith(res, "boom", {
      code: "stream_error",
    });
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(sendErrorMock).not.toHaveBeenCalled();
  });
});
