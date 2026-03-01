import { describe, expect, test } from "vitest";
import { detectExplicitFrameworkPreference } from "../../../services/planning/frameworkPreference.js";

describe("frameworkPreference", () => {
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

  test("returns undefined when multiple frameworks are mentioned", () => {
    expect(
      detectExplicitFrameworkPreference("Can this be either Next.js or Vite?"),
    ).toBeUndefined();
  });
});
