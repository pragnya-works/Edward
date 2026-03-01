import { describe, expect, test } from "vitest";
import { validateGeneratedOutput } from "../../../../services/planning/validators/postgenValidator.js";

describe("Post-Generation Validator", () => {
  test("should detect missing entry points", () => {
    const output = {
      framework: "nextjs",
      files: new Map([["src/app/page.tsx", "content"]]),
      declaredPackages: [],
    };
    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((violation) => violation.type === "missing-entry-point"),
    ).toBe(true);
  });

  test("should detect markdown fences in files", () => {
    const output = {
      framework: "nextjs",
      files: new Map([
        ["src/app/layout.tsx", 'import "./globals.css"'],
        ["src/app/page.tsx", "```tsx\nexport default function Page() {}\n```"],
      ]),
      declaredPackages: [],
    };
    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((violation) => violation.type === "markdown-fence"),
    ).toBe(true);
  });

  test("should validate with Next.js rules when declared framework is vite-react but Next.js entrypoints are emitted", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "src/lib/seo.ts",
          'export const STATIC_OG_IMAGE_URL = "https://assets.pragnyaa.in/home/OG.png";',
        ],
        [
          "src/app/layout.tsx",
          `
import { STATIC_OG_IMAGE_URL } from "../lib/seo";
import "./globals.css";
export const metadata = {
  metadataBase: new URL("https://example.com"),
  title: "Demo",
  description: "Demo app",
  alternates: { canonical: "/" },
  openGraph: { title: "Demo", description: "Demo app", images: [STATIC_OG_IMAGE_URL] },
  twitter: { card: "summary_large_image", title: "Demo", description: "Demo app", images: [STATIC_OG_IMAGE_URL] },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "https://assets.pragnyaa.in/home/favicon_io/favicon.ico" }],
    apple: [{ url: "https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" }],
  },
  manifest: "https://assets.pragnyaa.in/home/favicon_io/site.webmanifest",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
        ],
        ["src/app/page.tsx", "export default function Page() { return <main>Demo</main>; }"],
        ["src/app/globals.css", "body { margin: 0; }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(true);
    expect(
      result.violations.some(
        (violation) => violation.message.includes("framework: vite-react"),
      ),
    ).toBe(false);
  });

  test("should detect missing packages", () => {
    const output = {
      framework: "nextjs",
      files: new Map([
        ["src/app/layout.tsx", 'import "./globals.css"'],
        ["src/app/page.tsx", 'import { motion } from "framer-motion"'],
      ]),
      declaredPackages: [],
    };
    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some((violation) => violation.type === "missing-package"),
    ).toBe(true);
  });

  test("should detect orphaned relative imports", () => {
    const output = {
      framework: "nextjs",
      files: new Map([
        ["src/app/layout.tsx", 'import "./globals.css"'],
        ["src/app/page.tsx", 'import { Button } from "../components/Button"'],
      ]),
      declaredPackages: [],
    };
    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some((violation) => violation.type === "orphaned-import"),
    ).toBe(true);
  });

  test("should pass valid output", () => {
    const output = {
      framework: "nextjs",
      files: new Map([
        [
          "src/app/layout.tsx",
          'import "./globals.css"; export default function Layout({ children }) { return children }',
        ],
        [
          "src/app/page.tsx",
          'import { Button } from "./ui"; export default function Page() { return <Button /> }',
        ],
        ["src/app/ui.tsx", "export function Button() { return <button /> }"],
        ["src/app/globals.css", "/* styles */"],
      ]),
      declaredPackages: ["framer-motion"],
    };
    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  test("should require README.md in generate mode", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      files: new Map([
        ["src/main.tsx", 'import "./index.css"'],
        ["src/App.tsx", "export default function App() { return null }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some(
        (violation) =>
          violation.type === "missing-project-file" &&
          violation.file === "README.md",
      ),
    ).toBe(true);
  });

  test("should pass generate mode when README.md is present", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "index.html",
          `
<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="Demo app" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://edwardd.app/" />
    <meta property="og:title" content="Demo" />
    <meta property="og:description" content="Demo app" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Demo" />
    <meta name="twitter:description" content="Demo app" />
    <meta name="twitter:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <link rel="icon" href="https://assets.pragnyaa.in/home/favicon_io/favicon.ico" />
    <link rel="apple-touch-icon" href="https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" />
    <link rel="manifest" href="https://assets.pragnyaa.in/home/favicon_io/site.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
        ],
        [
          "src/main.tsx",
          'import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\ncreateRoot(document.getElementById("root")!).render(<App />);',
        ],
        ["src/index.css", "/* styles */"],
        ["src/App.tsx", "export default function App() { return <main>Demo</main> }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  test("should fail generate mode when canonical URL is root-relative in html", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "index.html",
          `
<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="Demo app" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="/" />
    <meta property="og:title" content="Demo" />
    <meta property="og:description" content="Demo app" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Demo" />
    <meta name="twitter:description" content="Demo app" />
    <meta name="twitter:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <link rel="icon" href="https://assets.pragnyaa.in/home/favicon_io/favicon.ico" />
    <link rel="apple-touch-icon" href="https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" />
    <link rel="manifest" href="https://assets.pragnyaa.in/home/favicon_io/site.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
        ],
        [
          "src/main.tsx",
          'import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\ncreateRoot(document.getElementById("root")!).render(<App />);',
        ],
        ["src/index.css", "/* styles */"],
        ["src/App.tsx", "export default function App() { return <main>Demo</main> }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.type === "invalid-canonical-url",
      ),
    ).toBe(true);
  });

  test("should not warn when vite/vanilla OG image tags use non-canonical URLs", () => {
    const output = {
      framework: "vanilla",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "index.html",
          `
<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="Demo app" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://edwardd.app/" />
    <meta property="og:title" content="Demo" />
    <meta property="og:description" content="Demo app" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://images.unsplash.com/random" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Demo" />
    <meta name="twitter:description" content="Demo app" />
    <meta name="twitter:image" content="https://example.com/og.png" />
    <link rel="icon" href="https://assets.pragnyaa.in/home/favicon_io/favicon.ico" />
    <link rel="apple-touch-icon" href="https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" />
    <link rel="manifest" href="https://assets.pragnyaa.in/home/favicon_io/site.webmanifest" />
  </head>
  <body>
    <main>Demo</main>
  </body>
</html>
`,
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(true);
    expect(
      result.violations.some(
        (violation) => violation.type === "missing-seo-branding",
      ),
    ).toBe(false);
  });

  test("should not require .gitignore in vanilla generate mode", () => {
    const output = {
      framework: "vanilla",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "index.html",
          `
<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="Demo app" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://edwardd.app/" />
    <meta property="og:title" content="Demo" />
    <meta property="og:description" content="Demo app" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Demo" />
    <meta name="twitter:description" content="Demo app" />
    <meta name="twitter:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <link rel="icon" href="https://assets.pragnyaa.in/home/favicon_io/favicon.ico" />
    <link rel="apple-touch-icon" href="https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" />
    <link rel="manifest" href="https://assets.pragnyaa.in/home/favicon_io/site.webmanifest" />
  </head>
  <body>
    <main>Demo</main>
  </body>
</html>
`,
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some(
        (violation) =>
          violation.type === "missing-project-file" &&
          violation.file === ".gitignore",
      ),
    ).toBe(false);
    expect(result.valid).toBe(true);
  });

  test("should detect imports placed after executable code", () => {
    const output = {
      framework: "vite-react",
      mode: "edit" as const,
      files: new Map([
        [
          "src/main.tsx",
          'const boot = true;\nimport { createRoot } from "react-dom/client";\nif (boot) console.log("boot");',
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some((violation) => violation.type === "import-placement"),
    ).toBe(true);
  });

  test("should reject generate mode when root component renders null", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "index.html",
          `
<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="Demo app" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://edwardd.app/" />
    <meta property="og:title" content="Demo" />
    <meta property="og:description" content="Demo app" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Demo" />
    <meta name="twitter:description" content="Demo app" />
    <meta name="twitter:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <link rel="icon" href="https://assets.pragnyaa.in/home/favicon_io/favicon.ico" />
    <link rel="apple-touch-icon" href="https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" />
    <link rel="manifest" href="https://assets.pragnyaa.in/home/favicon_io/site.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
        ],
        [
          "src/main.tsx",
          'import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\ncreateRoot(document.getElementById("root")!).render(<App />);',
        ],
        ["src/index.css", "/* styles */"],
        ["src/App.tsx", "export default function App() { return null; }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((violation) => violation.type === "logic-quality"),
    ).toBe(true);
  });

  test("should warn (not fail) nextjs generate mode when Edward favicon branding is missing", () => {
    const output = {
      framework: "nextjs",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "src/lib/seo.ts",
          'export const STATIC_OG_IMAGE_URL = "https://assets.pragnyaa.in/home/OG.png";',
        ],
        [
          "src/app/robots.ts",
          "export default function robots() { return { rules: [{ userAgent: '*', allow: '/' }] }; }",
        ],
        [
          "src/app/sitemap.ts",
          "export default function sitemap() { return [{ url: 'https://example.com', lastModified: new Date() }]; }",
        ],
        [
          "src/app/layout.tsx",
          `
import "./globals.css";
export const metadata = {
  metadataBase: new URL("https://example.com"),
  title: "Demo",
  description: "Demo app",
  alternates: { canonical: "/" },
  openGraph: { title: "Demo", description: "Demo app" },
  twitter: { card: "summary_large_image", title: "Demo", description: "Demo app" },
  robots: { index: true, follow: true },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
        ],
        ["src/app/page.tsx", "export default function Page() { return <main>Demo</main>; }"],
        ["src/app/globals.css", "body { margin: 0; }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(true);
    expect(
      result.violations.some(
        (violation) => violation.type === "missing-seo-branding",
      ),
    ).toBe(true);
    expect(
      result.violations.some(
        (violation) =>
          violation.type === "missing-seo-branding" &&
          violation.severity === "warning",
      ),
    ).toBe(true);
  });

  test("should pass nextjs generate mode when Edward favicon branding is present", () => {
    const output = {
      framework: "nextjs",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "src/lib/seo.ts",
          'export const STATIC_OG_IMAGE_URL = "https://assets.pragnyaa.in/home/OG.png";',
        ],
        [
          "src/app/layout.tsx",
          `
import { STATIC_OG_IMAGE_URL } from "../lib/seo";
import "./globals.css";
export const metadata = {
  metadataBase: new URL("https://example.com"),
  title: "Demo",
  description: "Demo app",
  alternates: { canonical: "/" },
  openGraph: { title: "Demo", description: "Demo app", images: [STATIC_OG_IMAGE_URL] },
  twitter: { card: "summary_large_image", title: "Demo", description: "Demo app", images: [STATIC_OG_IMAGE_URL] },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon.ico" },
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" }],
  },
  manifest: "https://assets.pragnyaa.in/home/favicon_io/site.webmanifest",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
        ],
        ["src/app/page.tsx", "export default function Page() { return <main>Demo</main>; }"],
        ["src/app/globals.css", "body { margin: 0; }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some(
        (violation) => violation.type === "missing-seo-branding",
      ),
    ).toBe(false);
  });

  test("should not warn when nextjs generate mode uses inline OG image URLs", () => {
    const output = {
      framework: "nextjs",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "src/lib/seo.ts",
          'export const STATIC_OG_IMAGE_URL = "https://assets.pragnyaa.in/home/OG.png";',
        ],
        [
          "src/app/layout.tsx",
          `
import "./globals.css";
export const metadata = {
  metadataBase: new URL("https://example.com"),
  title: "Demo",
  description: "Demo app",
  alternates: { canonical: "/" },
  openGraph: { title: "Demo", description: "Demo app", images: ["https://assets.pragnyaa.in/home/OG.png"] },
  twitter: { card: "summary_large_image", title: "Demo", description: "Demo app", images: ["https://assets.pragnyaa.in/home/OG.png"] },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon.ico" },
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" }],
  },
  manifest: "https://assets.pragnyaa.in/home/favicon_io/site.webmanifest",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
        ],
        ["src/app/page.tsx", "export default function Page() { return <main>Demo</main>; }"],
        ["src/app/globals.css", "body { margin: 0; }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(true);
    expect(
      result.violations.some(
        (violation) => violation.type === "missing-seo-branding",
      ),
    ).toBe(false);
  });

  test("should not warn when nextjs generate mode has non-canonical src/lib/seo.ts OG image export", () => {
    const output = {
      framework: "nextjs",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "src/lib/seo.ts",
          'export const STATIC_OG_IMAGE_URL = "https://example.com/og.png";',
        ],
        [
          "src/app/layout.tsx",
          `
import { STATIC_OG_IMAGE_URL } from "../lib/seo";
import "./globals.css";
export const metadata = {
  metadataBase: new URL("https://example.com"),
  title: "Demo",
  description: "Demo app",
  alternates: { canonical: "/" },
  openGraph: { title: "Demo", description: "Demo app", images: [STATIC_OG_IMAGE_URL] },
  twitter: { card: "summary_large_image", title: "Demo", description: "Demo app", images: [STATIC_OG_IMAGE_URL] },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon.ico" },
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "https://assets.pragnyaa.in/home/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" }],
  },
  manifest: "https://assets.pragnyaa.in/home/favicon_io/site.webmanifest",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
        ],
        ["src/app/page.tsx", "export default function Page() { return <main>Demo</main>; }"],
        ["src/app/globals.css", "body { margin: 0; }"],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(true);
    expect(
      result.violations.some((violation) => violation.type === "missing-seo-branding"),
    ).toBe(false);
  });

  test("should resolve directory imports to index.js files", () => {
    const output = {
      framework: "vite-react",
      mode: "edit" as const,
      files: new Map([
        [
          "src/App.tsx",
          'import Components from "./components";\nexport default function App() { return <Components />; }',
        ],
        [
          "src/components/index.js",
          "export default function Components() { return null; }",
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some((violation) => violation.type === "orphaned-import"),
    ).toBe(false);
  });

  test("should flag default imports from zustand as logic-quality violations", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [
          "index.html",
          `
<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="Demo app" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://edwardd.app/" />
    <meta property="og:title" content="Demo" />
    <meta property="og:description" content="Demo app" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Demo" />
    <meta name="twitter:description" content="Demo app" />
    <meta name="twitter:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <link rel="icon" href="https://assets.pragnyaa.in/home/favicon_io/favicon.ico" />
    <link rel="apple-touch-icon" href="https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" />
    <link rel="manifest" href="https://assets.pragnyaa.in/home/favicon_io/site.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
        ],
        [
          "src/main.tsx",
          'import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\ncreateRoot(document.getElementById("root")!).render(<App />);',
        ],
        ["src/index.css", "/* styles */"],
        [
          "src/App.tsx",
          'import create from "zustand";\nexport default function App() { const useStore = create(() => ({})); return <main>{String(Boolean(useStore))}</main>; }',
        ],
      ]),
      declaredPackages: ["zustand"],
    };

    const result = validateGeneratedOutput(output);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some(
        (violation) =>
          violation.type === "logic-quality" &&
          violation.file === "src/App.tsx" &&
          violation.message.includes('default import from "zustand"'),
      ),
    ).toBe(true);
  });

  test("should detect TODO stubs inside block comments", () => {
    const output = {
      mode: "edit" as const,
      files: new Map([
        [
          "src/lib.ts",
          "/* TODO: wire analytics pipeline */\nexport function ready() { return true; }",
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some(
        (violation) =>
          violation.type === "logic-quality" &&
          violation.file === "src/lib.ts" &&
          violation.message.includes("stub comments"),
      ),
    ).toBe(true);
  });

  test("should not treat URL strings containing todo-like text as comments", () => {
    const output = {
      mode: "edit" as const,
      files: new Map([
        [
          "src/App.tsx",
          'const docsUrl = "https://example.com/guides/todo-items";\nexport default function App() { return <main>Done</main>; }',
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some(
        (violation) =>
          violation.type === "logic-quality" &&
          violation.file === "src/App.tsx" &&
          violation.message.includes("stub comments"),
      ),
    ).toBe(false);
  });

  test("should not double-report a single FIXME comment", () => {
    const output = {
      mode: "edit" as const,
      files: new Map([
        [
          "src/App.tsx",
          "// FIXME: finish wiring this section\nexport default function App() { return <main>Done</main>; }",
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    const appLogicViolations = result.violations.filter(
      (violation) =>
        violation.type === "logic-quality" && violation.file === "src/App.tsx",
    );

    expect(appLogicViolations).toHaveLength(1);
    expect(appLogicViolations[0]?.message).toContain("placeholder markers");
  });

  test("should flag dashboard outputs that only initialize empty array state", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      intentType: "dashboard",
      files: new Map([
        ["README.md", "# Demo"],
        [
          "index.html",
          `
<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="Dashboard app" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://edwardd.app/" />
    <meta property="og:title" content="Dashboard" />
    <meta property="og:description" content="Dashboard app" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Dashboard" />
    <meta name="twitter:description" content="Dashboard app" />
    <meta name="twitter:image" content="https://assets.pragnyaa.in/home/OG.png" />
    <link rel="icon" href="https://assets.pragnyaa.in/home/favicon_io/favicon.ico" />
    <link rel="apple-touch-icon" href="https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png" />
    <link rel="manifest" href="https://assets.pragnyaa.in/home/favicon_io/site.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
        ],
        [
          "src/main.tsx",
          'import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\ncreateRoot(document.getElementById("root")!).render(<App />);',
        ],
        ["src/index.css", "/* styles */"],
        [
          "src/App.tsx",
          'import { useState } from "react";\nexport default function App() { const [rows] = useState([]); return <main>{rows.length}</main>; }',
        ],
      ]),
      declaredPackages: [],
    };

    const result = validateGeneratedOutput(output);
    expect(
      result.violations.some(
        (violation) => violation.type === "feature-skeleton",
      ),
    ).toBe(true);
  });
});
