# Contributing to @fiber-dev-kit/core

Thanks for helping improve the Fiber Dev Kit core package.

## Scope

This package contains the shared TypeScript foundation for the devkit:

- Fiber JSON-RPC client helpers.
- Fiber node, peer, channel, invoice, and payment types.
- Amount conversion utilities.
- Payment diagnostics.
- Node alert rules.
- Route confidence helpers.

Keep changes focused on shared behavior that belongs below the inspector and test client packages.

## Local Development

From the workspace root:

```bash
npm install
npm run build --workspace @fiber-dev-kit/core
npm run typecheck --workspace @fiber-dev-kit/core
npm test --workspace @fiber-dev-kit/core
```

## Guidelines

- Preserve the public API unless the version is being intentionally bumped for a breaking change.
- Add or update tests for diagnostics, amount conversion, RPC wrapping, alert rules, and route confidence behavior.
- Keep Fiber RPC types close to the node API shape. Add ergonomic wrapper types separately when needed.
- Avoid introducing browser-only dependencies. This package targets Node.js 18 and newer.
- Prefer small, explicit helpers over broad abstractions.

## Release Notes

When changing behavior, document the user-facing impact in the pull request or release notes. Include migration notes for renamed exports, changed error codes, or changed amount handling.
