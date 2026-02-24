import { describe, expect, it } from "vitest";
import { prepareGithubFilesWithReadme } from "../../services/github/readme.utils.js";
import type { GithubFile } from "@edward/octokit";

function findReadme(files: GithubFile[]): GithubFile | undefined {
  return files.find((file) => file.path === "README.md");
}

describe("github README enrichment", () => {
  it("creates a README when missing", () => {
    const files: GithubFile[] = [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "task-board",
            scripts: {
              dev: "next dev",
              build: "next build",
              start: "next start",
            },
            dependencies: {
              next: "16.1.6",
              react: "^19.2.3",
              "react-dom": "^19.2.3",
            },
          },
          null,
          2,
        ),
      },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
      { path: "src/app/page.tsx", content: "export default function Page(){return <main/>}" },
    ];

    const result = prepareGithubFilesWithReadme(files, { repoName: "task-board" });
    const readme = findReadme(result.files);

    expect(result.readmeAction).toBe("created");
    expect(readme).toBeDefined();
    expect(readme?.content).toContain("# Task Board");
    expect(readme?.content).toContain("## Highlights");
    expect(readme?.content).toContain("## Tech Stack");
    expect(readme?.content).toContain("## Getting Started");
  });

  it("upgrades framework boilerplate README", () => {
    const files: GithubFile[] = [
      { path: "package.json", content: JSON.stringify({ name: "alpha-app" }) },
      {
        path: "README.md",
        content:
          "This is a [Next.js](https://nextjs.org) project bootstrapped with create-next-app.",
      },
    ];

    const result = prepareGithubFilesWithReadme(files, { repoName: "alpha-app" });
    const readme = findReadme(result.files);

    expect(result.readmeAction).toBe("upgraded");
    expect(readme?.content).toContain("## Tech Stack");
    expect(readme?.content).toContain("## Available Scripts");
  });

  it("keeps existing informative README", () => {
    const informative = [
      "# Product Atlas",
      "",
      "Product Atlas is an internal planning dashboard for roadmap and release tracking.",
      "",
      "## Highlights",
      "- Role-based dashboards for teams",
      "",
      "## Tech Stack",
      "- React + TypeScript",
      "",
      "## Getting Started",
      "1. Install dependencies",
      "",
      "## Available Scripts",
      "- npm run dev",
      "",
      "## Project Structure",
      "- src/components",
      "",
    ].join("\n");

    const files: GithubFile[] = [
      { path: "README.md", content: informative },
      { path: "package.json", content: JSON.stringify({ name: "product-atlas" }) },
    ];

    const result = prepareGithubFilesWithReadme(files, { repoName: "product-atlas" });
    const readme = findReadme(result.files);

    expect(result.readmeAction).toBe("kept");
    expect(readme?.content).toBe(informative);
  });
});
