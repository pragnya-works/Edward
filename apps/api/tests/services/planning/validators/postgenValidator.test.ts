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

  test("should require README.md and .gitignore in generate mode", () => {
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
    expect(
      result.violations.some(
        (violation) =>
          violation.type === "missing-project-file" &&
          violation.file === ".gitignore",
      ),
    ).toBe(true);
  });

  test("should pass generate mode when README.md and .gitignore are present", () => {
    const output = {
      framework: "vite-react",
      mode: "generate" as const,
      files: new Map([
        ["README.md", "# Demo"],
        [".gitignore", "node_modules"],
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
        [".gitignore", "node_modules"],
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
});
