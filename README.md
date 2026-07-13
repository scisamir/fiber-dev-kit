# fiber-dev-kit

> **Gone in 60ms — Fiber Network Infrastructure Hackathon submission**
> Category 2: Node, Routing, Cross-Chain, and Diagnostics Infrastructure

Development tooling for running, inspecting, and testing [Fiber Network](https://www.fiber.world) nodes — without reading the protocol spec first.

The Fiber Node (FNN) exposes a capable JSON-RPC interface, but using it directly means managing hex-encoded amounts, snake_case parameters, raw error codes, and no push-event mechanism. **fiber-dev-kit** is the developer-experience layer above that interface: a typed RPC client, programmatic test helpers, a local web dashboard, and a CLI that starts real Fiber nodes from npm in one command.

---

## Table of contents

- [The problem this solves](#the-problem-this-solves)
- [Packages](#packages)
- [Quickstart](#quickstart)
- [Package details](#package-details)
  - [`@fiber-dev-kit/core`](#fiber-dev-kitcore)
    - [`FiberClient`](#fiberclient)
    - [`FiberEventClient`](#fibereventclient)
    - [`diagnose()` and `diagnosePayment()`](#diagnose-and-diagnosepayment)
    - [`evaluateAlerts()`](#evaluatealerts)
    - [Amount utilities](#amount-utilities)
  - [`@fiber-dev-kit/test-client`](#fiber-dev-kittest-client)
    - [`FiberTestClient`](#fibertestclient)
    - [`FiberNetwork`](#fibernetwork)
    - [Example: integration test with Vitest](#example-integration-test-with-vitest)
  - [`@fiber-dev-kit/inspector`](#fiber-dev-kitinspector)
    - [As a CLI tool](#as-a-cli-tool)
    - [As a library](#as-a-library)
    - [REST API](#rest-api)
    - [WebSocket](#websocket-ws)
  - [`@fiber-dev-kit/cli`](#fiber-dev-kitcli)
    - [Full command reference](#full-command-reference)
    - [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [End-to-end demo](#end-to-end-demo)
- [Running tests](#running-tests)
- [Publishing](#publishing)
- [Infrastructure gap addressed](#infrastructure-gap-addressed)
- [Requirements](#requirements)
- [License](#license)
- [Hackathon](#hackathon)

---

## The problem this solves

Getting a Fiber node running and making a first payment today requires:

- Downloading and building `fnn` from source or hunting for a release binary
- Hand-crafting JSON-RPC calls with hex-encoded shannon amounts (`"0x3B9ACA00"` for 1 CKB)
- Manually diffing `list_channels` output to detect state changes (no push events exist)
- Decoding numeric error codes with no documented taxonomy
- Writing your own retry, timeout, and diagnostic logic from scratch

fiber-dev-kit removes all of this from the critical path. A developer can go from nothing to a two-node local network with a funded channel and a working test payment in under five minutes.

---

## Packages

The repository is an npm workspace with four packages. Publish `core` first because `test-client` and `inspector` depend on it.

| Package                                       | npm          | What it does                                           |
| --------------------------------------------- | ------------ | ------------------------------------------------------ |
| [`@fiber-dev-kit/core`](./core)               | `0.1.0-rc.0` | Typed RPC client, event stream, diagnostics, alerts    |
| [`@fiber-dev-kit/test-client`](./test-client) | `0.1.0-rc.0` | Programmatic payment and channel test helpers          |
| [`@fiber-dev-kit/inspector`](./inspector)     | `0.1.0-rc.0` | Local web dashboard for node health and payment traces |
| [`@fiber-dev-kit/cli`](./cli)                 | `0.1.0`      | CLI that starts and manages local Fiber nodes from npm |

---

## Quickstart

### 1. Start a two-node local network

```bash
npm install -g @fiber-dev-kit/cli

# Start two Fiber nodes and open a 200 CKB channel between them
fiber start --nodes 2 --channel 200

# Watch live node and channel status
fiber status --watch
```

The CLI vendors the `fnn` and `fnn-cli` binaries — no Rust toolchain, no source build.

### 2. Send a test payment

```bash
fiber pay --from a --to b --amount 1
```

### 3. Open the inspector dashboard

```bash
fiber-dev-kit-inspector   # reads node URLs from CLI state automatically
# → Inspector: http://127.0.0.1:3030
```

### 4. Use the SDK in your own code

```bash
npm install @fiber-dev-kit/core
```

```ts
import { FiberClient, diagnose, evaluateAlerts } from "@fiber-dev-kit/core";

const fiber = new FiberClient("http://127.0.0.1:8227");

// Plain CKB amounts — no hex encoding
const { invoice_address } = await fiber.createInvoice({
  amount: 5, // 5 CKB, not "0x2FAF080"
  description: "coffee",
});

// Pay by invoice
const payment = await fiber.payInvoice(invoice_address);

// Typed errors you can catch by name
try {
  await fiber.sendPayment({
    targetPubkey: "0x...",
    amount: 100,
    keysend: true,
  });
} catch (err) {
  if (FiberError.is(err)) {
    const { code, summary, suggestion } = diagnose(err);
    // code: "INSUFFICIENT_LIQUIDITY"
    // summary: "The route has capacity in total, but not enough usable balance..."
    // suggestion: "Reduce the payment amount, open a larger channel..."
  }
}
```

---

## Package details

### `@fiber-dev-kit/core`

The foundation that all other packages build on. Requires Node.js ≥ 18.

#### `FiberClient`

An ergonomic typed client for the FNN JSON-RPC. Key design decisions:

- **Plain amounts**: accepts `number` (CKB) alongside `HexString` (shannons). `500` and `"0x1DCD6500"` both work.
- **camelCase API**: parameters and method names are camelCase; the client converts to snake_case on the wire.
- **Mainnet write guard**: configuring `network: "mainnet"` blocks fund-moving calls (`openChannel`, `sendPayment`, `shutdownChannel`, etc.) unless `allowMainnetWrites: true` is also set. This catches the most dangerous dev mistake — a test script accidentally pointed at the wrong node URL.
- **Structured errors**: all failures throw `FiberError` with a named `code`, never raw strings or opaque numbers.

```ts
const fiber = new FiberClient({
  nodeUrl: "http://127.0.0.1:8227",
  network: "testnet", // enables mainnet write guard
  authToken: "my-token", // optional Bearer auth
  timeoutMs: 15_000, // default: 30 000 ms
  defaultCurrency: "Fibt", // testnet bech32m prefix
});

// Node
await fiber.info();
await fiber.listPeers();
await fiber.connectPeer({ address: "/ip4/.../tcp/.../p2p/..." });

// Channels
await fiber.openChannel({ pubkey: "0x...", fundingAmount: 500 });
await fiber.listChannels({ includeClosed: true });
await fiber.shutdownChannel({ channelId: "0x..." });

// Invoices
const { invoice_address } = await fiber.createInvoice({
  amount: 10,
  description: "tip",
});
await fiber.parseInvoice(invoice_address);
await fiber.cancelInvoice("0x...");

// Payments
await fiber.payInvoice(invoice_address);
await fiber.sendPayment({ targetPubkey: "0x...", amount: 5, keysend: true });
await fiber.listPayments({ status: "Failed", limit: 20 });
```

#### `FiberEventClient`

FNN's RPC has no server-push subscription channel for clients. This class approximates a live event stream by polling `listChannels` and `listPayments` on a configurable interval, diffing snapshots, and emitting typed events. The inspector and test-client both consume it.

```ts
import { FiberEventClient } from "@fiber-dev-kit/core";

const events = new FiberEventClient({ client: fiber, pollIntervalMs: 1000 });

events.on("payment.succeeded", ({ payment }) => {
  console.log("paid:", payment.payment_hash);
});

events.on("payment.failed", ({ payment, diagnosis }) => {
  console.error(diagnosis?.summary);
});

events.on("channel.opened", ({ channel }) => {
  /* ... */
});
events.on("channel.closed", ({ channel }) => {
  /* ... */
});

events.start();
// later:
events.stop();
```

**Available event types:** `channel.opened`, `channel.updated`, `channel.closed`, `payment.created`, `payment.updated`, `payment.succeeded`, `payment.failed`.

#### `diagnose()` and `diagnosePayment()`

Translates raw FNN error strings into structured, actionable diagnoses. The pattern table is a living, appendable list of regex matches against real error text observed in practice — not an exhaustive enum, since FNN does not publish a stable error taxonomy.

```ts
import { diagnose, diagnosePayment, FiberError } from '@fiber-dev-kit/core';

// From a caught FiberError
try {
  await fiber.sendPayment({ ... });
} catch (err) {
  if (FiberError.is(err)) {
    const d = diagnose(err);
    // d.code:       "ROUTE_NOT_FOUND"
    // d.summary:    "No path could be found from this node to the target..."
    // d.suggestion: "Confirm the target node has at least one public channel..."
  }
}

// From a failed payment's failed_error field
const d = diagnosePayment(payment);  // null for non-failed payments
```

**Diagnosis codes:** `INSUFFICIENT_LIQUIDITY`, `ROUTE_NOT_FOUND`, `PEER_NOT_CONNECTED`, `PEER_UNREACHABLE`, `INVOICE_EXPIRED`, `INVOICE_ALREADY_PAID`, `INVOICE_CANCELLED`, `INVALID_PARAMS`, `TIMEOUT`, `UNKNOWN`.

#### `evaluateAlerts()`

Takes a snapshot of a node's current state and returns actionable operational alerts. Used by the inspector's alerts panel, the CLI's `fiber doctor`, and the demo script.

```ts
import { evaluateAlerts } from "@fiber-dev-kit/core";

const [node, peers, channels, payments] = await Promise.all([
  fiber.info(),
  fiber.listPeers(),
  fiber.listChannels({ includeClosed: true }),
  fiber.listPayments({ limit: 50 }),
]);

const alerts = evaluateAlerts({ nodeId: "a", node, peers, channels, payments });

for (const alert of alerts) {
  console.log(
    `[${alert.severity.toUpperCase()}] ${alert.code}: ${alert.summary}`,
  );
  console.log(`  → ${alert.suggestion}`);
}
```

**Alert codes:** `NODE_UNREACHABLE`, `ZERO_PEERS`, `NO_READY_CHANNELS`, `LOW_LOCAL_BALANCE`, `PAYMENT_FAILED`.

#### Amount utilities

```ts
import {
  ckbToShannonHex,
  shannonHexToCkb,
  formatAmount,
} from "@fiber-dev-kit/core";

ckbToShannonHex(1); // → "0x5f5e100"
shannonHexToCkb("0x5f5e100"); // → 1
formatAmount("0x5f5e100"); // → "1 CKB"
formatAmount("0x5f5e100", "shannon"); // → "100000000 shannon"
```

---

### `@fiber-dev-kit/test-client`

Programmatic test helpers for payment and channel flows. Built entirely on `@fiber-dev-kit/core` — no direct RPC calls of its own. Refuses `network: "mainnet"` at construction; it is for devnet and testnet only.

#### `FiberTestClient`

```ts
import { FiberTestClient } from "@fiber-dev-kit/test-client";

const client = new FiberTestClient({
  nodeUrl: "http://127.0.0.1:8227",
  pollIntervalMs: 500, // default
  timeoutMs: 10_000, // default
});

// Pay by invoice or keysend
await client.pay({ invoice: "..." });
await client.pay({ to: "0x...pubkey", amount: 5 });

// Dry-run without sending — returns null if it would fail
const result = await client.canPay({ invoice: "..." });

// Route confidence report — scored 0–100, labelled high/medium/low
const report = await client.routeConfidence({ to: "0x...", amount: 10 });
// report.canPay     → boolean (dry-run passed)
// report.score      → 0–100
// report.level      → "high" | "medium" | "low"
// report.reasons    → string[] — what the score is based on
// report.suggestions → string[] — what to fix
// report.diagnosis  → Diagnosis | null

// Poll until terminal state
const payment = await client.waitForPayment("0x...paymentHash");

// Test assertions (throw with diagnosis on failure)
await client.assertPaid("0x...");
await client.assertFailed("0x...");
await client.assertError("0x...", "INSUFFICIENT_LIQUIDITY");

// Channel helpers
const { local, remote } = await client.getChannelBalance("0x...channelId");
await client.drainChannel("0x...channelId", "0x...toPubkey");
```

The raw `FiberClient` and `FiberEventClient` are exposed as `client.rpc` and `client.events` for anything not covered by the test API.

#### `FiberNetwork`

```ts
import { FiberNetwork } from "@fiber-dev-kit/test-client";

const network = new FiberNetwork({
  nodes: {
    a: "http://127.0.0.1:8227",
    b: "http://127.0.0.1:8237",
  },
});

// Wait until every node's RPC is reachable
await network.start();

// Peer two nodes (no-op if already connected)
await network.connect("a", "b");

// Open a channel and wait for ChannelReady
const channelId = await network.openChannel("a", "b", 200);

// Create invoice on b, pay from a
const payment = await network.pay("a", "b", 5, { description: "test" });

// Named failure scenarios for testing error handling
const result = await network.simulate.insufficientLiquidity(
  "a",
  "b",
  channelId,
);
const result = await network.simulate.unreachablePeer("a", "c", 10);
const result = await network.simulate.expiredInvoice("a", "b", 5);
// result.payment   → PaymentResult | null
// result.diagnosis → Diagnosis | null
```

#### Example: integration test with Vitest

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { FiberNetwork } from "@fiber-dev-kit/test-client";

describe("payment flows", () => {
  const network = new FiberNetwork({
    nodes: { a: process.env.NODE_A!, b: process.env.NODE_B! },
  });

  beforeAll(() => network.start());

  it("routes a payment from a to b", async () => {
    const payment = await network.pay("a", "b", 1);
    await network.node("a").assertPaid(payment.payment_hash);
  });

  it("diagnoses insufficient liquidity correctly", async () => {
    const channelId = await network.openChannel("a", "b", 5);
    const { diagnosis } = await network.simulate.insufficientLiquidity(
      "a",
      "b",
      channelId,
    );
    expect(diagnosis?.code).toBe("INSUFFICIENT_LIQUIDITY");
  });
});
```

---

### `@fiber-dev-kit/inspector`

A local web dashboard served over HTTP with a WebSocket live-event feed. Designed to run alongside development nodes managed by the CLI, though it accepts any FNN RPC URL.

#### As a CLI tool

```bash
npm install -g @fiber-dev-kit/inspector

# Auto-reads node URLs from fiber CLI state (~/.fiber-dev-kit/state.json)
fiber-dev-kit-inspector

# Explicit node URLs
fiber-dev-kit-inspector a=http://127.0.0.1:8227 b=http://127.0.0.1:8237

# Custom port and host
fiber-dev-kit-inspector a=http://127.0.0.1:8227 --port=4000 --host=0.0.0.0
```

#### As a library

```ts
import { startInspector } from "@fiber-dev-kit/inspector";

const handle = await startInspector({
  nodes: [
    { id: "a", rpcUrl: "http://127.0.0.1:8227" },
    { id: "b", rpcUrl: "http://127.0.0.1:8237" },
  ],
  port: 3030, // default
  host: "127.0.0.1", // default
  pollIntervalMs: 1500, // default
});

console.log(`Inspector: http://${handle.host}:${handle.port}`);

// Later:
handle.stop();
```

#### REST API

| Endpoint            | Returns                                  |
| ------------------- | ---------------------------------------- |
| `GET /api/nodes`    | Health and info for every watched node   |
| `GET /api/channels` | Channel list from every node             |
| `GET /api/payments` | Recent payment history from every node   |
| `GET /api/alerts`   | `evaluateAlerts()` output for every node |

#### WebSocket (`/ws`)

Broadcasts live `FiberEventClient` events as JSON to every connected browser:

```json
{
  "nodeId": "a",
  "event": {
    "type": "payment.succeeded",
    "payment": { "payment_hash": "0x...", "status": "Success", ... }
  }
}
```

---

### `@fiber-dev-kit/cli`

Vendors the `fnn` and `fnn-cli` binaries (Linux x64, current testnet release) so developers can start real Fiber nodes from npm without a Rust toolchain. Manages node state — RPC ports, P2P ports, dev keys, peer connections, channel records — in `~/.fiber-dev-kit/state.json`.

```bash
npm install -g @fiber-dev-kit/cli
```

#### Full command reference

```
fiber version                                        # bundled fnn / fnn-cli versions
fiber doctor                                         # guided recovery checklist

# Node management
fiber start --nodes 2 --channel 200 [--wait 180]    # two-node dev kit + funded channel
fiber start [--background] [--dry-run] [-- FNN...]  # single node
fiber stop [--all]                                   # stop managed nodes

# Networking
fiber connect --node a --address <multiaddr>
fiber connect --node a --pubkey <pubkey>

# Channels
fiber channel open --node a --peer <pubkey> --amount 200 [--wait 180]
fiber channel list --node a [--pending] [--closed] [--json]

# Payments
fiber pay --from a --to b --amount 1 [--wait 60]

# Keys and accounts
fiber accounts [--node a] [--json]                  # address to fund, balance check
fiber keys export --node a --yes                    # dev key export (requires --yes)

# Monitoring
fiber status [--watch]                              # live node + channel status
fiber inspect                                       # terminal inspector

# Escape hatches
fiber node [FNN_ARGS...]                            # raw fnn binary passthrough
fiber cli  [FNN_CLI_ARGS...]                        # raw fnn-cli binary passthrough
```

#### Environment variables

| Variable                    | Default                       | Purpose                                           |
| --------------------------- | ----------------------------- | ------------------------------------------------- |
| `FIBER_DEV_KIT_HOME`        | `~/.fiber-dev-kit`            | Dev-kit state and node homes                      |
| `FIBER_HOME`                | `~/.fiber-node`               | Single-node runtime directory                     |
| `FIBER_RPC_URL`             | auto-detected                 | Single-node RPC URL override                      |
| `FIBER_CONFIG_TEMPLATE`     | `testnet.yml`                 | Config template (`testnet.yml` or `rpc-only.yml`) |
| `FIBER_SECRET_KEY_PASSWORD` | `password`                    | Dev key passphrase                                |
| `CKB_NODE_RPC_URL`          | `https://testnet.ckbapp.dev/` | CKB RPC for balance checks                        |

> **Warning:** The CLI generates local development CKB keys automatically. Do not use them for production funds.

---

## Architecture

```
┌─────────────────────────────────────────┐
│   Your app, wallet, or integration test  │
└──────────────────┬──────────────────────┘
                   │ imports
┌──────────────────▼──────────────────────┐
│         @fiber-dev-kit/test-client       │  FiberTestClient, FiberNetwork
│         @fiber-dev-kit/inspector         │  startInspector()
└──────────────────┬──────────────────────┘
                   │ imports
┌──────────────────▼──────────────────────┐
│            @fiber-dev-kit/core           │  FiberClient, FiberEventClient,
│                                          │  diagnose(), evaluateAlerts()
└──────────────────┬──────────────────────┘
                   │ JSON-RPC over HTTP
┌──────────────────▼──────────────────────┐
│         Fiber Network Node (FNN)         │
│           hex amounts · snake_case       │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│             CKB Blockchain               │
└─────────────────────────────────────────┘
```

`@fiber-dev-kit/cli` sits outside this chain — it manages the FNN process itself and exposes node URLs to the other packages via `state.json`.

---

## End-to-end demo

The [`examples/`](./examples) directory contains a self-contained demonstration script that exercises the full stack:

```bash
# Start nodes first
fiber start --nodes 2 --channel 200

# Run the demo
npm run demo
```

The script:

1. Resolves node URLs from CLI state or `FIBER_NODE_A` / `FIBER_NODE_B` env vars
2. Reads node health and evaluates alerts on both nodes
3. Runs `routeConfidence()` before attempting to send anything
4. Sends a payment if confidence is high, or explains why it skipped
5. Asserts the payment succeeded with a structured diagnosis if it did not

Pass `--force-payment` to send regardless of confidence score — useful for testing failure handling:

```bash
npm run demo -- --force-payment
```

---

## Running tests

```bash
npm run build --workspaces --if-present
npm test --workspaces --if-present
```

Tests use `vitest` with a mock `fetch` implementation — no live node required for unit tests. The `core` and `test-client` packages have full unit test coverage. Integration tests targeting a live two-node network use the `FiberNetwork` client against nodes started with `fiber start --nodes 2 --channel 200`.

---

## Publishing

Publish `core` first:

```bash
npm run build --workspaces --if-present
npm publish --workspace @fiber-dev-kit/core     --tag rc
npm publish --workspace @fiber-dev-kit/test-client --tag rc
npm publish --workspace @fiber-dev-kit/inspector   --tag rc
npm publish --workspace @fiber-dev-kit/cli         --access public
```

The `--tag rc` flag prevents prereleases from becoming the default `latest` install. Install the release candidate with:

```bash
npm install @fiber-dev-kit/core@rc
npm install @fiber-dev-kit/test-client@rc
npm install -g @fiber-dev-kit/inspector@rc
npm install -g @fiber-dev-kit/cli
```

---

## Infrastructure gap addressed

The Fiber Network infrastructure stack had:

- ✅ A working FNN node binary
- ✅ A raw JSON-RPC interface
- ❌ No ergonomic TypeScript client (hex amounts, no type safety, no error taxonomy)
- ❌ No event/subscription mechanism for channel and payment state changes
- ❌ No structured diagnostics for payment failures
- ❌ No programmatic test helpers for channel and payment flows
- ❌ No local developer dashboard
- ❌ No way to start a real Fiber node from npm without a Rust build

fiber-dev-kit addresses all six missing pieces. The goal is that a developer with no prior Fiber experience can install one npm package, run one command, and have a two-node network with a funded channel ready for testing — and that every subsequent tool they reach for (typed SDK, test assertions, live dashboard) already exists and is consistent with the CLI-managed network.

---

## Requirements

- Node.js ≥ 18
- Linux x64 (for the CLI's vendored binaries; `core`, `test-client`, and `inspector` are platform-independent)
- A funded CKB testnet address when opening channels (use `fiber accounts` to find the address to fund)

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Hackathon

Built for the **[Gone in 60ms: Fiber Network Infrastructure Hackathon](https://talk.nervos.org/t/gone-in-60ms-fiber-network-infrastructure-hackathon-announcement/10418)** — July 2026.

Submission category: **Node, Routing, Cross-Chain, and Diagnostics Infrastructure.**
