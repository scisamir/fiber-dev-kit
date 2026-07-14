# Fiber Dev Kit Minimal Example

This example shows how the Fiber Dev Kit packages fit together in a developer workflow:

- `@fiber-dev-kit/cli` starts and manages local Fiber nodes.
- `@fiber-dev-kit/core` reads node health, peers, channels, payments, and structured alerts.
- `@fiber-dev-kit/test-client` runs route preflight checks and payment assertions.

It is designed for docs, demos, and hackathon judging.

## 1. Install

From this workspace:

```bash
npm install
npm run build --workspaces --if-present
```

From a fresh project after the packages are published:

```bash
npm install @fiber-dev-kit/cli@0.1.0 @fiber-dev-kit/core@0.1.0 @fiber-dev-kit/test-client@0.1.0
```

## 2. Start Two Local Nodes

Use the CLI to create two managed local Fiber nodes and open a channel:

```bash
npm --workspace fiber-dev-kit-example run setup
```

Equivalent direct command:

```bash
fiber start --nodes 2 --channel 200
```

Check the local topology:

```bash
npm --workspace fiber-dev-kit-example run status
```

## 3. Run the Core + Test Client Demo

```bash
npm --workspace fiber-dev-kit-example run demo
```

The demo:

- reads the CLI node state from `~/.fiber-dev-kit/state.json`;
- uses `FiberClient` from `@fiber-dev-kit/core` to inspect each node;
- uses `evaluateAlerts()` from `@fiber-dev-kit/core` to turn low-level node state into actionable alerts;
- uses `FiberNetwork` from `@fiber-dev-kit/test-client` to wait for RPC readiness;
- runs a route confidence preflight before sending;
- optionally sends a payment and asserts the result.

Force a payment attempt even when the preflight says the route is weak:

```bash
npm --workspace fiber-dev-kit-example run demo:force
```

## 4. Try a CLI Payment

```bash
npm --workspace fiber-dev-kit-example run pay
```

Equivalent direct command:

```bash
fiber pay --from a --to b --amount 1
```

## Environment Overrides

The demo discovers CLI-managed nodes automatically. You can also provide endpoints manually:

```bash
FIBER_NODE_A=http://127.0.0.1:8227 FIBER_NODE_B=http://127.0.0.1:8237 npm --workspace fiber-dev-kit-example run demo
```

Useful variables:

- `FIBER_DEV_KIT_HOME`: overrides the CLI state directory. Default: `~/.fiber-dev-kit`.
- `FIBER_NODE_A`: overrides node `a` RPC URL.
- `FIBER_NODE_B`: overrides node `b` RPC URL.
- `FIBER_DEMO_AMOUNT_CKB`: payment amount for route preflight and payment attempts. Default: `1`.
- `FIBER_FORCE_PAYMENT=1`: sends even when route confidence is low.

## What This Proves

The CLI removes the painful setup step of building and wiring Fiber nodes manually. `core` gives developers structured RPC access and diagnostics. `test-client` turns those primitives into repeatable payment checks that can run locally or in CI.
