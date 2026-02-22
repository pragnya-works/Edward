import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getClientIp } from "../../middleware/securityTelemetry.js";

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: undefined,
    socket: { remoteAddress: undefined },
    headers: {},
    ...overrides,
  } as Request;
}

describe("getClientIp", () => {
  it("returns req.ip from Express", () => {
    const req = makeRequest({
      ip: "203.0.113.9",
      headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.9" },
    });

    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to socket remote address when req.ip is missing", () => {
    const req = makeRequest({
      socket: { remoteAddress: "192.0.2.44" } as Request["socket"],
    });

    expect(getClientIp(req)).toBe("192.0.2.44");
  });

  it("returns unknown when no IP information is available", () => {
    const req = makeRequest({
      ip: "",
      socket: { remoteAddress: undefined } as Request["socket"],
    });

    expect(getClientIp(req)).toBe("unknown");
  });
});
