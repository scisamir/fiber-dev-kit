# @fiber-dev-kit/core

Network-aware TypeScript helpers for working with Fiber Network Node JSON-RPC APIs.

This package is not a replacement for official Fiber SDKs. It is support infrastructure for local node diagnostics, test automation, and hackathon-grade developer tooling.

## Install

```bash
npm install @fiber-dev-kit/core
```

## Usage

```ts
import {
  FiberClient,
  diagnosePaymentFailure,
  evaluateNodeAlerts,
  routeConfidence,
} from "@fiber-dev-kit/core";

const node = new FiberClient({
  name: "a",
  url: "http://127.0.0.1:8227",
});

const info = await node.getInfo();
const peers = await node.listPeers();
const channels = await node.listChannels();

const alerts = evaluateNodeAlerts({
  name: "a",
  info,
  peers,
  channels,
});

const confidence = await routeConfidence({
  from: node,
  to: "0372...",
  amount: "1",
});

try {
  await node.sendPayment({ invoice: "..." });
} catch (error) {
  console.error(diagnosePaymentFailure(error));
}
```

## What it provides

- A small Fiber JSON-RPC client.
- Amount conversion helpers for CKB/shannons.
- Payment failure diagnosis helpers.
- Node and channel alert rules.
- Route confidence and `canPay` style reports for local testing.
- Typed Fiber node, channel, invoice, and payment shapes used by the devkit packages.

## Requirements

- Node.js 18 or newer.
- A reachable Fiber node JSON-RPC endpoint.

## License

MIT
