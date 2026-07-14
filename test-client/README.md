# @fiber-dev-kit/test-client

Programmatic test helpers for Fiber payment, channel, and routing flows.

The test client builds on `@fiber-dev-kit/core` and is intended for local testnets, CI smoke tests, hackathon demos, and repeatable Fiber payment experiments.

## Install

```bash
npm install @fiber-dev-kit/test-client@0.1.0
```

## Usage

```ts
import { FiberNetwork } from "@fiber-dev-kit/test-client";

const network = new FiberNetwork({
  nodes: {
    a: "http://127.0.0.1:8227",
    b: "http://127.0.0.1:8237",
  },
});

await network.start();

const bPubkey = await network.pubkeyOf("b");
const report = await network.node("a").routeConfidence({ to: bPubkey, amount: 1 });

console.log(report);

const payment = await network.pay("a", "b", 1);
await network.node("a").assertPaid(payment.payment_hash);
```

## What it provides

- Multi-node test wrapper around Fiber RPC clients.
- Payment and channel assertions.
- Polling utilities for async Fiber state transitions.
- Pretty terminal output for local test runs.
- Route confidence checks backed by `@fiber-dev-kit/core`.

## Requirements

- Node.js 18 or newer.
- Published `@fiber-dev-kit/core` matching this package version.
- One or more reachable Fiber node JSON-RPC endpoints.

## License

MIT
