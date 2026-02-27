import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../services/registry/package.registry.js", () => ({
  resolvePackages: vi.fn(),
}));

import { resolvePackages } from "../../../../services/registry/package.registry.js";
import { resolveDependencies } from "../../../../services/planning/resolvers/dependency.resolver.js";

describe("resolveDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes package specs and preserves explicit requested versions", async () => {
    vi.mocked(resolvePackages).mockResolvedValueOnce({
      valid: [
        { name: "react", valid: true, version: "19.2.3" },
        { name: "zod", valid: true, version: "3.25.76" },
      ],
      invalid: [],
      conflicts: [],
    });

    const result = await resolveDependencies(["zod@^3.25.0"], "vite-react");

    const firstCallArg = vi.mocked(resolvePackages).mock.calls[0]?.[0] ?? [];
    expect(firstCallArg).toContain("zod");
    expect(firstCallArg.some((name) => name.includes("@"))).toBe(false);
    expect(result.resolved.find((pkg) => pkg.name === "zod")?.version).toBe(
      "^3.25.0",
    );
  });

  it("reports failures only for user-requested packages", async () => {
    vi.mocked(resolvePackages).mockResolvedValueOnce({
      valid: [],
      invalid: [
        { name: "react-dom", valid: false, error: "missing peer" },
        { name: "bad-lib", valid: false, error: "not found" },
      ],
      conflicts: [],
    });

    const result = await resolveDependencies(["bad-lib"], "vite-react");

    expect(result.failed).toEqual([
      {
        name: "bad-lib",
        version: "",
        valid: false,
        error: "not found",
      },
    ]);
  });
});
