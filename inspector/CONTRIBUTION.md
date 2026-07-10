# Contributing to @fiber-dev-kit/inspector

Thanks for helping improve the Fiber Dev Kit inspector.

## Scope

This package provides a local dashboard for Fiber node diagnostics. It is focused on local development, node health, channel visibility, alerts, and payment traces.

Typical changes include:

- Inspector CLI behavior.
- Local node discovery.
- Health polling.
- Alert display.
- Payment trace visualization.
- Topology UI improvements.

## Local Development

From the workspace root:

```bash
npm install
npm run build --workspace @fiber-dev-kit/inspector
npm run typecheck --workspace @fiber-dev-kit/inspector
npm run start --workspace @fiber-dev-kit/inspector -- a=http://127.0.0.1:8227
```

For multiple nodes:

```bash
npm run start --workspace @fiber-dev-kit/inspector -- a=http://127.0.0.1:8227 b=http://127.0.0.1:8237 --port=3030
```

## Guidelines

- Keep the inspector useful for local operators and developers. It is not a full public network explorer.
- Avoid noisy terminal logging from repeated polling failures. Surface repeated problems in the UI.
- Make alert messages actionable.
- Keep UI text compact and operational.
- Use `@fiber-dev-kit/core` for shared diagnostics and alert logic.
- Verify that the published package includes both `dist` and `public` assets.

## Release Notes

When changing the UI or CLI behavior, document the command, flag, or workflow impact in the pull request or release notes.
