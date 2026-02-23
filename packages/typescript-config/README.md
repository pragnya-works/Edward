# `@edward/typescript-config`

Shared TypeScript `tsconfig` presets for the Edward workspace.

## Presets

- `base.json`: strict shared defaults for Node/DOM targets
- `nextjs.json`: extends base; Next.js-friendly module settings + no emit
- `react-library.json`: extends base; `jsx: react-jsx` for component libraries

## Usage

In a package/app `tsconfig.json`:

```json
{
  "extends": "@edward/typescript-config/base.json"
}
```

Next.js app example:

```json
{
  "extends": "@edward/typescript-config/nextjs.json"
}
```

React library example:

```json
{
  "extends": "@edward/typescript-config/react-library.json"
}
```
