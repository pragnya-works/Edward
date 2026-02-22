import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "../config.js";

describe("parseTrustProxy", () => {
  it("uses fallback when TRUST_PROXY is missing", () => {
    expect(parseTrustProxy(undefined, true)).toBe(1);
    expect(parseTrustProxy(undefined, false)).toBe(false);
  });

  it("handles explicit booleans", () => {
    expect(parseTrustProxy("true", false)).toBe(1);
    expect(parseTrustProxy("false", true)).toBe(false);
  });

  it("parses numeric hop counts only when fully numeric", () => {
    expect(parseTrustProxy("0", true)).toBe(0);
    expect(parseTrustProxy("2", false)).toBe(2);
  });

  it("preserves proxy IP and CIDR values as strings", () => {
    expect(parseTrustProxy("127.0.0.1", false)).toBe("127.0.0.1");
    expect(parseTrustProxy("10.0.0.0/8", false)).toBe("10.0.0.0/8");
  });

  it("parses comma-separated proxy allowlists into arrays", () => {
    expect(parseTrustProxy("loopback, 127.0.0.1", false)).toEqual([
      "loopback",
      "127.0.0.1",
    ]);
  });
});
