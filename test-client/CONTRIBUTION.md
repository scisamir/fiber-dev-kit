# Contributing to @fiber-dev-kit/test-client

Thanks for helping improve the Fiber Dev Kit test client.

## Scope

This package provides programmable test helpers for Fiber payment and channel flows. It should make local testnets and CI checks easier without hiding important Fiber behavior.

Typical changes include:

- Multi-node test orchestration.
- Payment and channel assertions.
- Polling utilities.
- Route confidence checks.
- Terminal output improvements.

## Local Development

From the workspace root:

```bash
npm install
npm run build --workspace @fiber-dev-kit/test-client
npm run typecheck --workspace @fiber-dev-kit/test-client
npm test --workspace @fiber-dev-kit/test-client
```

## Guidelines

- Keep assertions deterministic and useful for failing Fiber payment tests.
- Do not swallow failures silently. Return structured diagnostics where possible.
- Keep terminal formatting readable in both local terminals and CI logs.
- Add tests for new polling behavior, assertions, and failure paths.
- Use `@fiber-dev-kit/core` for shared RPC, diagnostics, amount, and route logic instead of duplicating it here.

## Release Notes

When changing test behavior, document any assertion semantics that changed. Include examples for new helpers.
