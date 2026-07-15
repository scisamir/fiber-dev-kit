# Fiber Dev Kit Docs

This folder contains the hosted documentation site for Fiber Dev Kit.

The docs explain the four packages in this repository:

- `@fiber-dev-kit/cli`: npm-installed Fiber node launcher and diagnostics CLI.
- `@fiber-dev-kit/core`: typed TypeScript client for Fiber node JSON-RPC.
- `@fiber-dev-kit/test-client`: programmatic helpers for payment/channel testing.
- `@fiber-dev-kit/inspector`: browser dashboard for local node health, channels, and payments.

## Local Development

Install dependencies from this folder:

```bash
npm install
```

Run the docs site locally:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Build

```bash
npm run build
```

## Deployment

The docs are a standard Next.js app and can be deployed to Vercel, Netlify, or any Node.js host that supports Next.js.

Set this environment variable in production:

```bash
NEXT_PUBLIC_SITE_URL=https://your-docs-domain.example
```

If `NEXT_PUBLIC_SITE_URL` is not set, metadata falls back to `http://localhost:3000` for local builds.

## Notes

The docs are informational only. The CLI and SDK packages are published from the repository root workspaces, not from this docs package.
