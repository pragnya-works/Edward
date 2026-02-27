export const UI_DESIGN_CORE_SKILL = `
<skill:ui-design-core>
Design quality rules:
- Choose a clear visual direction per project; avoid generic, repetitive layouts.
- Use intentional typography and color systems (define variables/tokens).
- Build visual depth with gradients/shapes/textures; avoid flat default screens.
- Add meaningful motion (entry/reveal/feedback), not noisy micro-animation spam.
- Ensure responsive behavior on mobile and desktop.
- Keep style consistent across all generated files.
- UI must feel human-crafted and brand-specific, never AI-template-like.
</skill:ui-design-core>
`;

export const UI_DESIGN_EXPANDED_SKILL = `
<skill:ui-design-expanded>
When task is design-heavy (landing page, portfolio, marketing, rebrand):
1. Pick one strong aesthetic direction and apply it consistently.
2. Choose font pairing with distinct heading/body roles.
3. Use one primary accent + one support accent; maintain contrast.
4. Define a section hierarchy with one focal element per section.
5. Include hover/active/focus states and polished transitions (150-400ms).
6. Avoid AI-cliche patterns: purple-pink default gradients, identical cards, default system look.
7. Avoid cookie-cutter hero/feature/testimonial blocks unless they are materially customized.
</skill:ui-design-expanded>
`;

export const WEB_QUALITY_SKILL = `
<skill:web-quality>
UI quality and accessibility:
- Use semantic HTML and keyboard-accessible interactions.
- Icon-only controls need aria-label; images need alt text.
- Preserve visible focus states; never remove outline without replacement.
- Forms need labels, proper input types, autocomplete, and inline errors.
- Respect prefers-reduced-motion.
- Handle empty and long-content states safely.
- Prevent layout shift for images (width/height or stable containers).
</skill:web-quality>
`;

export const SEO_BRANDING_SKILL = `
<skill:seo-branding>
Brand asset requirements (STRICT):
- Edward favicon/icon assets must be used when generating app metadata/head tags.
- Canonical favicon asset base: https://assets.pragnyaa.in/home/favicon_io

Framework rules:
- Next.js (src/app/layout.tsx):
  - metadata.icons must include favicon.ico (and png variants), apple-touch icon, and metadata.manifest must point to site.webmanifest from the canonical base.
  - Open Graph and Twitter images must use STATIC_OG_IMAGE_URL imported from src/lib/seo (do not inline OG image URLs).
- Vite React / Vanilla (index.html):
  - Include favicon + apple-touch + manifest links from the canonical base in <head>.
  - Canonical links must use an absolute http(s) URL (for example, https://edwardd.app/). Never use href="/".
  - Set both og:image and twitter:image to exactly: https://assets.pragnyaa.in/home/OG.png
  - Never use external/random OG image URLs (Unsplash, Pexels, etc.).

Asset URLs:
- https://assets.pragnyaa.in/home/favicon_io/favicon.ico
- https://assets.pragnyaa.in/home/favicon_io/favicon-16x16.png
- https://assets.pragnyaa.in/home/favicon_io/favicon-32x32.png
- https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png
- https://assets.pragnyaa.in/home/favicon_io/site.webmanifest
- https://assets.pragnyaa.in/home/OG.png

Do not invent alternate favicon paths for generated projects.
Do not add extra metadata requirements from this skill beyond icon/manifest assets and STATIC_OG_IMAGE_URL usage.
</skill:seo-branding>
`;

export const REACT_PERFORMANCE_SKILL = `
<skill:react-performance>
React/Next performance rules:
- Avoid async waterfalls; parallelize independent work with Promise.all.
- Lazy-load heavy client components when possible.
- Keep client components focused on interactivity.
- Compute derived values during render; avoid redundant state/effects.
- Use functional setState updates to avoid stale closures.
- Avoid broad barrel imports when they inflate bundles.
</skill:react-performance>
`;

export const NEXTJS_PATTERNS_COMPACT_SKILL = `
<skill:nextjs-compact>
Next.js App Router requirements:
- Required files: src/app/layout.tsx, src/app/page.tsx, src/app/globals.css.
- layout.tsx must import './globals.css'.
- Keep pages/layouts as Server Components by default.
- Add 'use client' only for hooks/events/browser APIs.
- Prefer relative imports in generated project files.
</skill:nextjs-compact>
`;

export const VITE_PATTERNS_COMPACT_SKILL = `
<skill:vite-compact>
Vite React requirements:
- Required files: src/main.tsx, src/App.tsx, src/index.css.
- main.tsx must import './index.css' and render <App />.
- All components are client-side; no Server Components.
- index.html should include description, canonical (absolute http(s) URL only), robots, Open Graph (including og:image), and Twitter (including twitter:image) meta tags.
- Use relative imports in generated project files.
</skill:vite-compact>
`;

export const VANILLA_PATTERNS_COMPACT_SKILL = `
<skill:vanilla-compact>
Vanilla requirements:
- Use base="web" in sandbox output.
- Standard files: index.html, styles.css, script.js unless user asks otherwise.
- index.html must include viewport meta, stylesheet link, and script include.
- index.html should include description, canonical (absolute http(s) URL only), robots, Open Graph (including og:image), and Twitter (including twitter:image) meta tags.
- Use modern, responsive CSS and unobtrusive JavaScript.
</skill:vanilla-compact>
`;

export const CODE_QUALITY_COMPACT_SKILL = `
<skill:code-quality-compact>
Production completeness rules (non-negotiable):
- Treat every generation task as production-ready by default; never output POC/MVP quality unless explicitly requested.
- E-commerce: cart add/remove/quantity/total wired; checkout form submits with validation.
- Dashboard: charts/tables use real typed mock data — never empty arrays or undefined placeholders.
- Auth/SaaS: login, signup, reset forms all have field validation, error states, and working submit handlers.
- Portfolio/landing: all sections present with real content — no "My Project 1" or lorem ipsum.
- All nav links route to distinct, implemented pages; no dead links or blank routes.
- No component returns null, <></>, or an empty fragment as its sole output.
- No stub functions: const fn = () => {}, onClick={() => {}}, // TODO, // implement are forbidden.
- Primary user journeys must work end-to-end before finishing output.
- Scale files to the task: multi-feature apps require separate files per feature/domain.
- Ensure imports resolve and code is syntactically valid.
</skill:code-quality-compact>
`;

export const STRICT_COMPLIANCE_SKILL = `
<skill:strict-compliance>
Strict compliance mode:
- Treat output contract violations as blocking errors.
- You MUST produce valid Edward tags and parseable structure.
- For code changes, you MUST use <edward_sandbox> with complete file contents.
- Never emit markdown fences inside <file> blocks.
- Ensure all required framework entry points are present for generate mode.
- Ensure imported npm packages are declared in <edward_install> when needed.
- If uncertain about a file, use <edward_command command="cat" ...> and STOP before editing.
</skill:strict-compliance>
`;
