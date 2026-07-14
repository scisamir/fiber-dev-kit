# @fiber-dev-kit/core

Network-aware TypeScript helpers for working with Fiber Network Node JSON-RPC APIs.

This package is not a replacement for official Fiber SDKs. It is support infrastructure for local node diagnostics, test automation, and hackathon-grade developer tooling.

## Install

```bash
npm install @fiber-dev-kit/core@0.1.0
```

## Usage

```ts
import {
  FiberClient,
  diagnose,
  evaluateAlerts,
  FiberError,
} from "@fiber-dev-kit/core";

const node = new FiberClient({
  nodeUrl: "http://127.0.0.1:8227",
  network: "testnet",
});

const info = await node.info();
const peers = await node.listPeers();
const channels = await node.listChannels({ includeClosed: true });
const payments = await node.listPayments({ limit: 20 });

const alerts = evaluateAlerts({
  nodeId: "a",
  node: info,
  peers,
  channels,
  payments,
});

const { invoice_address } = await node.createInvoice({
  amount: 1,
  description: "demo",
});

try {
  await node.payInvoice(invoice_address);
} catch (error) {
  if (FiberError.is(error)) {
    console.error(diagnose(error));
  }
}
```

## What it provides

- A small Fiber JSON-RPC client.
- Amount conversion helpers for CKB/shannons.
- Payment failure diagnosis helpers.
- Node and channel alert rules.
- Event polling helpers for channel and payment changes.
- Typed Fiber node, channel, invoice, and payment shapes used by the devkit packages.

## Requirements

- Node.js 18 or newer.
- A reachable Fiber node JSON-RPC endpoint.

## License

MIT
