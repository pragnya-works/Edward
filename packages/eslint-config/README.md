# `@edward/eslint-config`

Shared ESLint flat-config presets for the Edward workspace.

## Presets

- `@edward/eslint-config/base` (or package root): base JS/TS + Turbo rules
- `@edward/eslint-config/next-js`: base + Next.js + React hooks
- `@edward/eslint-config/react-internal`: base + React hooks for React libs/apps

## Files

- `base.js`: core shared rules and ignore patterns
- `next.js`: Next.js-focused config
- `react-internal.js`: React-focused config (non-Next)

## Usage

Example `eslint.config.mjs`:

```js
import { nextJsConfig } from "@edward/eslint-config/next-js";

export default nextJsConfig;
```

or

```js
import { config } from "@edward/eslint-config/base";

export default config;
```
