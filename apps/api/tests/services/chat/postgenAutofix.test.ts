import { describe, expect, it } from "vitest";
import { ChatAction } from "../../../services/planning/schemas.js";
import {
  applyDeterministicPostgenAutofixes,
} from "../../../controllers/chat/session/orchestrator/postgenAutofix.js";

describe("postgenAutofix", () => {
  it("does not apply deterministic postgen autofix in generate mode for nextjs", async () => {
    const files = new Map<string, string>([
      [
        "src/app/layout.tsx",
        `
import "./globals.css";

export const metadata = {
  title: "Demo",
  openGraph: { title: "Demo" },
  twitter: { card: "summary_large_image" },
};
`,
      ],
    ]);

    const applied = await applyDeterministicPostgenAutofixes({
      framework: "nextjs",
      mode: ChatAction.GENERATE,
      generatedFiles: files,
      chatId: "chat-1",
      runId: "run-1",
    });

    expect(applied).toHaveLength(0);
    const updatedLayout = files.get("src/app/layout.tsx") || "";
    expect(updatedLayout).toContain(
      "openGraph: { title: \"Demo\" },",
    );
    expect(updatedLayout).toContain(
      "twitter: { card: \"summary_large_image\" },",
    );
  });

  it("does not apply deterministic postgen autofix in generate mode for vanilla", async () => {
    const files = new Map<string, string>([
      [
        "index.html",
        `
<!doctype html>
<html>
  <head>
    <meta property="og:image" content="https://images.unsplash.com/random" />
    <meta name="twitter:image" content="https://example.com/og.png" />
  </head>
  <body></body>
</html>
`,
      ],
    ]);

    const applied = await applyDeterministicPostgenAutofixes({
      framework: "vanilla",
      mode: ChatAction.GENERATE,
      generatedFiles: files,
      chatId: "chat-1",
      runId: "run-1",
    });

    expect(applied).toHaveLength(0);
    const updated = files.get("index.html") || "";
    expect(updated).toContain(
      '<meta property="og:image" content="https://images.unsplash.com/random" />',
    );
    expect(updated).toContain(
      '<meta name="twitter:image" content="https://example.com/og.png" />',
    );
  });

  it("rewrites root-relative canonical href to an absolute URL for vite/vanilla generate mode", async () => {
    const files = new Map<string, string>([
      [
        "index.html",
        `
<!doctype html>
<html>
  <head>
    <link rel="canonical" href="/" />
  </head>
  <body></body>
</html>
`,
      ],
    ]);

    const applied = await applyDeterministicPostgenAutofixes({
      framework: "vite-react",
      mode: ChatAction.GENERATE,
      generatedFiles: files,
      chatId: "chat-1",
      runId: "run-1",
    });

    expect(applied).toContain("index.html:canonical-href");
    const updated = files.get("index.html") || "";
    expect(updated).toContain(
      '<link rel="canonical" href="https://edwardd.app/" />',
    );
  });

  it("does not apply autofix outside generate mode", async () => {
    const files = new Map<string, string>([
      ["src/app/layout.tsx", 'export const metadata = { openGraph: {}, twitter: {} };'],
    ]);

    const applied = await applyDeterministicPostgenAutofixes({
      framework: "nextjs",
      mode: ChatAction.FIX,
      generatedFiles: files,
      chatId: "chat-1",
      runId: "run-1",
    });

    expect(applied).toHaveLength(0);
    expect(files.get("src/app/layout.tsx")).toBe(
      'export const metadata = { openGraph: {}, twitter: {} };',
    );
  });

  it("rewrites zustand default imports to named imports", async () => {
    const files = new Map<string, string>([
      [
        "src/store/useCart.ts",
        [
          "'use client';",
          "import create from 'zustand';",
          "",
          "export const useCart = create(() => ({}));",
        ].join("\n"),
      ],
    ]);

    const applied = await applyDeterministicPostgenAutofixes({
      framework: "vite-react",
      mode: ChatAction.GENERATE,
      generatedFiles: files,
      chatId: "chat-1",
      runId: "run-1",
    });

    expect(applied).toContain("src/store/useCart.ts:zustand-default-import");
    expect(files.get("src/store/useCart.ts")).toContain(
      "import { create } from 'zustand';",
    );
  });

  it("rewrites aliased default zustand imports alongside named imports", async () => {
    const files = new Map<string, string>([
      [
        "src/store/useCart.ts",
        [
          "'use client';",
          "import cartStore, { shallow } from \"zustand\";",
          "",
          "export const useCart = cartStore(() => ({}));",
          "export { shallow };",
        ].join("\n"),
      ],
    ]);

    const applied = await applyDeterministicPostgenAutofixes({
      framework: "nextjs",
      mode: ChatAction.EDIT,
      generatedFiles: files,
      chatId: "chat-1",
      runId: "run-1",
    });

    expect(applied).toContain("src/store/useCart.ts:zustand-default-import");
    expect(files.get("src/store/useCart.ts")).toContain(
      'import { create as cartStore, shallow } from "zustand";',
    );
  });

  it("preserves default import identifier even when create is already in named imports", async () => {
    const files = new Map<string, string>([
      [
        "src/store/useCart.ts",
        [
          "'use client';",
          "import cartStore, { create, shallow } from \"zustand\";",
          "",
          "export const useCart = cartStore(() => ({}));",
          "export { create, shallow };",
        ].join("\n"),
      ],
    ]);

    await applyDeterministicPostgenAutofixes({
      framework: "nextjs",
      mode: ChatAction.EDIT,
      generatedFiles: files,
      chatId: "chat-1",
      runId: "run-1",
    });

    expect(files.get("src/store/useCart.ts")).toContain(
      'import { create as cartStore, create, shallow } from "zustand";',
    );
  });
});
