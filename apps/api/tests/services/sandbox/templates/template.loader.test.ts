import { describe, expect, it } from "vitest";
import { loadTemplateFiles } from "../../../../services/sandbox/templates/template.loader.js";

describe("template loader", () => {
  it("loads vite-react template files from docker/templates", async () => {
    const files = await loadTemplateFiles("vite-react");

    expect(files["package.json"]).toContain('"build": "vite build"');
    expect(files["index.html"]).toContain('<div id="root"></div>');
    expect(files["vite.config.ts"]).toContain("outDir: 'dist'");
    expect(files["src/index.css"]).toBeTypeOf("string");
  });

  it("returns a fresh copy so callers cannot mutate cached templates", async () => {
    const first = await loadTemplateFiles("vite-react");
    first["package.json"] = "mutated";

    const second = await loadTemplateFiles("vite-react");

    expect(second["package.json"]).not.toBe("mutated");
    expect(second["package.json"]).toContain('"name": "edward-vite-react"');
  });

  it("throws for unknown frameworks", async () => {
    await expect(loadTemplateFiles("unknown-framework")).rejects.toThrow(
      /No template configuration found for framework/,
    );
  });
});
