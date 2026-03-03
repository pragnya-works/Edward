import { describe, expect, it } from "vitest";
import { ensureError } from "../../utils/error.js";

describe("ensureError", () => {
  it("returns Error instances as-is", () => {
    const source = new Error("boom");
    expect(ensureError(source)).toBe(source);
  });

  it("creates an Error from a string", () => {
    const result = ensureError("plain failure");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("plain failure");
  });

  it("converts object errors and preserves stack when provided", () => {
    const result = ensureError({ message: "object failure", stack: "stack-trace" });
    expect(result.message).toBe("object failure");
    expect(result.stack).toBe("stack-trace");
  });

  it("falls back to unknown error message for nullish values", () => {
    expect(ensureError(null).message).toBe("An unknown error occurred");
    expect(ensureError(undefined).message).toBe("An unknown error occurred");
  });
});
