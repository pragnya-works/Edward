import { describe, expect, it } from "vitest";
import {
  formatPackageSpec,
  normalizePackageSpecs,
  packageNamesFromSpecs,
  parsePackageSpec,
  toPackageName,
} from "../../../services/packages/packageSpec.js";

describe("packageSpec utils", () => {
  it("parses unscoped and scoped package specs", () => {
    expect(parsePackageSpec("react@19.2.3")).toEqual({
      name: "react",
      version: "19.2.3",
    });
    expect(parsePackageSpec("@vitejs/plugin-react@4.3.4")).toEqual({
      name: "@vitejs/plugin-react",
      version: "4.3.4",
    });
  });

  it("normalizes and deduplicates specs by package name", () => {
    const normalized = normalizePackageSpecs([
      "react",
      "react@^19.2.3",
      "@types/react",
      "@types/react@^19.2.9",
    ]);

    expect(normalized).toEqual(["react@^19.2.3", "@types/react@^19.2.9"]);
  });

  it("extracts package names from specs", () => {
    expect(packageNamesFromSpecs(["react@19.2.3", "react", "zod@^3.0.0"])).toEqual([
      "react",
      "zod",
    ]);
    expect(toPackageName("@radix-ui/react-slot@^1.2.3")).toBe(
      "@radix-ui/react-slot",
    );
    expect(formatPackageSpec("react", "^19.2.3")).toBe("react@^19.2.3");
  });
});
