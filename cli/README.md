# @fiber-dev-kit/cli

Fiber Dev Kit CLI for running Fiber nodes quickly from npm.

This first package is a Linux x64 MVP. It vendors the current `fnn` and
`fnn-cli` release binaries so users do not need to download the Fiber source
tree or wait for a Rust build.

## Install

```bash
npm install -g @fiber-dev-kit/cli
```

## Use

Run diagnostics:

```bash
fiber doctor
```

Start a two-node dev kit and try to open a channel:

```bash
fiber start --nodes 2 --channel 200
```

The CLI checks node-a's CKB balance before attempting the channel. For local
two-node channels it also checks node-b can participate. Fund the addresses
shown by `fiber accounts`, then verify with:

```bash
fiber balance
```

Start only one managed node, then connect it to an external Fiber node:

```bash
fiber start --nodes 1
fiber connect --node a --address /ip4/1.2.3.4/tcp/8228/p2p/QmPeer...
fiber channel open --node a --peer 03abc... --amount 200 --wait 180
```

Watch node and channel status:

```bash
fiber status --watch
```

Send a test payment:

```bash
fiber pay --from a --to b --amount 1
```

Show generated node accounts and funding addresses:

```bash
fiber accounts
fiber accounts --node a
fiber balance
fiber balance --node a
```

Export local dev keys only when you explicitly need them:

```bash
fiber keys export --node a --yes
```

Open the browser inspector:

```bash
fiber inspect
fiber inspect --port=3030
```

You can still run a single Fiber node:

```bash
fiber start
```

In another terminal:

```bash
fiber cli info
```

`fiber start` forwards original `fnn` options after `--`, so the npm wrapper
does not lock users into the bundled defaults:

```bash
fiber start -- --rpc-biscuit-public-key <public-key>
fiber start -- --ckb-node-rpc-url http://127.0.0.1:8114
fiber start -- --fiber-announced-node-name my-node
fiber start -- --fiber-listening-addr /ip4/0.0.0.0/tcp/8228
```

Environment variables supported by `fnn` also work:

```bash
RPC_BISCUIT_PUBLIC_KEY=<public-key> fiber start
CKB_NODE_RPC_URL=http://127.0.0.1:8114 fiber start
```

For exact passthrough to the original node binary, use:

```bash
fiber node --help
fiber node -c ./config.yml -d ./data --rpc-biscuit-public-key <public-key>
```

The runtime directory defaults to `~/.fiber-node`. Override it with:

```bash
FIBER_HOME=/tmp/my-fiber-node fiber start
```

The node identity public key is derived from the Fiber private key stored under
the Fiber base directory. To use an existing node identity, reuse that base
directory or provide your own with `--fiber-base-dir` / `FIBER_BASE_DIR`.

The default config template is `testnet.yml`. For an offline RPC-only smoke
test, run:

```bash
FIBER_CONFIG_TEMPLATE=rpc-only.yml fiber start
```

The bundled testnet template listens on a random P2P port by default so local
development nodes do not collide with each other.

The wrapper also picks a free local RPC port starting at `8227` when the default
port is busy, then remembers it so `fiber cli ...` connects to the same node.
Set `FIBER_RPC_URL`, `RPC_LISTENING_ADDR`, or pass `--rpc-listening-addr` if you
need a specific RPC address.

The launcher creates a random dev CKB key on first start and uses
`FIBER_SECRET_KEY_PASSWORD=password` unless you set your own environment value.
Do not use the generated key for production funds.

CLI output uses Chalk colors for status, warnings, and errors. Set `NO_COLOR=1`
if you need plain output in logs or scripts.

## Commands

Full command docs live in [`docs/commands.md`](./docs/commands.md).

```bash
fiber version
fiber doctor
fiber start --nodes 2 --channel 200 [--wait 180]
fiber start [--background|-b] [--dry-run] [-- FNN_ARGS...]
fiber connect --node a --address <multiaddr>
fiber connect --node a --pubkey <peer-pubkey>
fiber peer disconnect --node a --pubkey <peer-pubkey>
fiber address --node a [--host <public-ip>]
fiber channel open --node a --peer <peer-pubkey> --amount 200
fiber channel list --node a
fiber pay --from a --to b --amount 1
fiber accounts [--node a] [--json]
fiber balance [--node a] [--json]
fiber keys export --node a --yes
fiber status [--watch]
fiber inspect
fiber node [FNN_ARGS...]
fiber cli [FNN_CLI_ARGS...]
fiber stop [--all]
```
