# @scisamir/fiber-node

Run a prebuilt Fiber Network Node from npm.

This first package is a Linux x64 MVP. It vendors the current `fnn` and
`fnn-cli` release binaries so users do not need to download the Fiber source
tree or wait for a Rust build.

## Install

```bash
npm install -g @scisamir/fiber-node
```

## Use

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

## Commands

```bash
fiber version
fiber start [--background|-b] [--dry-run] [-- FNN_ARGS...]
fiber node [FNN_ARGS...]
fiber cli [FNN_CLI_ARGS...]
fiber status
fiber stop
```
