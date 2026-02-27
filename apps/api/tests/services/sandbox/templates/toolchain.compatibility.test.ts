import { describe, expect, it } from "vitest";
import { evaluateFrameworkToolchainCompatibility } from "../../../../services/sandbox/templates/toolchain.compatibility.js";

describe("toolchain compatibility", () => {
  it("passes for Vite 5 on Node 20.18.x", () => {
    const result = evaluateFrameworkToolchainCompatibility({
      framework: "vite-react",
      nodeVersion: "20.18.0",
      packageJson: {
        devDependencies: {
          vite: "^5.4.21",
        },
      },
    });

    expect(result.compatible).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when Vite major requires newer Node", () => {
    const result = evaluateFrameworkToolchainCompatibility({
      framework: "vite-react",
      nodeVersion: "20.18.0",
      packageJson: {
        devDependencies: {
          vite: "^7.3.1",
        },
      },
    });

    expect(result.compatible).toBe(false);
    expect(result.issues.join("\n")).toContain(
      "Vite 7.x requires Node.js >= 20.19.0",
    );
  });

  it("fails when framework minimum Node is not met", () => {
    const result = evaluateFrameworkToolchainCompatibility({
      framework: "nextjs",
      nodeVersion: "18.20.0",
      packageJson: {
        dependencies: {
          next: "^16.1.6",
        },
      },
    });

    expect(result.compatible).toBe(false);
    expect(result.issues.join("\n")).toContain("nextjs requires Node.js");
  });

  it("passes for compatible Node and pinned toolchain", () => {
    const result = evaluateFrameworkToolchainCompatibility({
      framework: "vite-react",
      nodeVersion: "22.12.0",
      packageJson: {
        dependencies: {
          react: "^19.2.3",
        },
        devDependencies: {
          vite: "^5.4.21",
        },
      },
    });

    expect(result.compatible).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
