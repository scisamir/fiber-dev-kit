# @fiber-dev-kit/inspector

Local dashboard for inspecting Fiber node health, channels, alerts, and payment traces.

The inspector is focused on local development and operator diagnostics. It is not a full public Fiber network explorer.

## Install

```bash
npm install -g @fiber-dev-kit/inspector
```

## Usage

```bash
fiber-dev-kit-inspector a=http://127.0.0.1:8227 b=http://127.0.0.1:8237 --port=3030
```

Then open:

```text
http://127.0.0.1:3030
```

If you also use `@fiber-dev-kit/cli`, the inspector can discover local devkit nodes from the CLI state file when no node arguments are provided:

```bash
fiber-dev-kit-inspector
```

## What it provides

- Local Fiber node health view.
- Peer and channel status.
- Alert rules for unhealthy nodes, missing peers, and weak payment readiness.
- Payment failure diagnosis display.
- Lightweight topology graph for connected local nodes and channels.

## Requirements

- Node.js 18 or newer.
- One or more reachable Fiber node JSON-RPC endpoints.

## License

MIT
