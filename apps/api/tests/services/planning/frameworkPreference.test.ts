import { describe, expect, test } from "vitest";
import { detectExplicitFrameworkPreference } from "../../../services/planning/frameworkPreference.js";

describe("frameworkPreference", () => {
  test("returns undefined for undefined or empty input", () => {
    expect(detectExplicitFrameworkPreference(undefined)).toBeUndefined();
    expect(detectExplicitFrameworkPreference("")).toBeUndefined();
  });

  test("detects explicit Next.js phrasing", () => {
    expect(
      detectExplicitFrameworkPreference("Please build this as a Next.js app"),
    ).toBe("nextjs");
    expect(
      detectExplicitFrameworkPreference("Need this in next js with App Router"),
    ).toBe("nextjs");
  });

  test("detects explicit Vite React phrasing", () => {
    expect(
      detectExplicitFrameworkPreference("Create this with vite react"),
    ).toBe("vite-react");
  });

  test("detects explicit Vanilla phrasing", () => {
    expect(
      detectExplicitFrameworkPreference("Use plain HTML, CSS, and JS only"),
    ).toBe("vanilla");
  });

  test("matches framework names case-insensitively", () => {
    expect(
      detectExplicitFrameworkPreference("Please make this in NEXT.JS"),
    ).toBe("nextjs");
    expect(
      detectExplicitFrameworkPreference("Can we build this with Vite-React?"),
    ).toBe("vite-react");
  });

  test("returns undefined when multiple frameworks are mentioned", () => {
    expect(
      detectExplicitFrameworkPreference("Can this be either Next.js or Vite?"),
    ).toBeUndefined();
  });

  test("ignores negated framework mentions", () => {
    expect(
      detectExplicitFrameworkPreference("Please do not use Next.js"),
    ).toBeUndefined();
    expect(
      detectExplicitFrameworkPreference("Use Vite React, no vanilla"),
    ).toBe("vite-react");
  });
});
