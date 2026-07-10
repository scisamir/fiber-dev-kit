# Fiber Dev Kit Commands

The npm package is `@fiber-dev-kit/cli` and exposes one command: `fiber`.

Install it with:

```bash
npm install -g @fiber-dev-kit/cli
```

The CLI has two modes:

- Single-node mode uses `FIBER_HOME` or `~/.fiber-node`.
- Dev-kit mode uses `FIBER_DEV_KIT_HOME` or `~/.fiber-dev-kit` and manages labeled nodes such as `a`, `b`, `c`, `d`, and `e`.

Generated keys are for local development. Do not use them for production funds.

## Quick Starts

Create two local nodes and open a funded channel:

```bash
fiber start --nodes 2 --channel 200
fiber status --watch
fiber pay --from a --to b --amount 1
```

Create one local node and connect it to an external node:

```bash
fiber start --nodes 1
fiber accounts --node a
fiber connect --node a --address /ip4/1.2.3.4/tcp/8228/p2p/QmPeer...
fiber channel open --node a --peer 03abc... --amount 200 --wait 180
```

## `fiber version`

Prints the bundled `fnn` and `fnn-cli` versions.

```bash
fiber version
```

Use this when confirming which Fiber binary release the npm package is running.

## `fiber doctor`

Runs the guided recovery checklist.

```bash
fiber doctor
```

It checks:

- bundled `fnn`
- bundled `fnn-cli`
- `ckb-cli` on PATH
- node-a and node-b RPC health
- node-b peer address
- CKB RPC health
- node wallet funding
- stale channels
- channels stuck in `NegotiatingFunding`

When a check fails, it prints the next suggested fix.

## `fiber start`

Starts Fiber.

Single node:

```bash
fiber start
fiber start --background
fiber start --dry-run
fiber start -- --ckb-node-rpc-url http://127.0.0.1:8114
```

Two-node dev kit:

```bash
fiber start --nodes 2 --channel 200
fiber start --nodes 2 --channel 200 --wait 300
fiber start --nodes 1
```

What it does in dev-kit mode:

- creates per-node homes under `~/.fiber-dev-kit/nodes`
- creates local dev CKB keys
- creates Fiber base directories
- starts bundled `fnn` processes
- assigns non-conflicting RPC and P2P ports
- connects node-a to node-b when both exist
- opens a channel when `--channel` is provided
- waits for `ChannelReady` until the wait timeout

Options:

- `--nodes <n>` creates managed nodes. Supported labels are `a` through `e`.
- `--channel <ckb>` opens a channel from node-a to node-b using a CKB amount.
- `--wait <seconds>` controls startup and channel wait time. Default is `180`.
- `--dry-run` prints the planned node layout without starting processes.
- `--background` starts single-node mode in the background.
- `--` passes all remaining arguments to `fnn`.

## `fiber connect`

Connects a managed dev-kit node to another Fiber peer.

```bash
fiber connect --node a --address /ip4/1.2.3.4/tcp/8228/p2p/QmPeer...
fiber connect --node a --pubkey 03abc...
fiber connect --node a --pubkey 03abc... --addr-type tcp
fiber connect --node a --address /ip4/1.2.3.4/tcp/8228/p2p/QmPeer... --dry-run
```

What it does:

- reads the selected node from dev-kit state
- calls `fnn-cli peer connect_peer`
- saves a record in `state.json` under `externalPeers`

Options:

- `--node <label>` selects the local managed node. Default is `a`.
- `--address <multiaddr>` connects by multiaddr. It must include `/p2p/<peer-id>`.
- `--pubkey <pubkey>` connects by Fiber peer public key when the node can resolve it from graph data.
- `--addr-type <tcp|ws|wss>` filters address type when connecting by pubkey.
- `--save false` or `--no-save` prevents saving the peer address.
- `--dry-run` prints the underlying `fnn-cli` command.

## `fiber channel open`

Opens a channel from one managed node to a connected peer.

```bash
fiber channel open --node a --peer 03abc... --amount 200
fiber channel open --node a --peer 03abc... --amount 200 --wait 180
fiber channel open --node a --peer 03abc... --shannons 20000000000
fiber channel open --node a --peer 03abc... --amount 200 --public true
```

What it does:

- calls `fnn-cli channel open_channel`
- converts `--amount` from CKB to shannons
- saves a record in `state.json` under `externalChannels`
- optionally waits until the channel reaches `ChannelReady`

Options:

- `--node <label>` selects the local managed node. Default is `a`.
- `--peer <pubkey>` or `--pubkey <pubkey>` selects the remote Fiber node.
- `--amount <ckb>` funds the channel with a CKB amount.
- `--shannons <integer>` funds the channel with a raw shannon amount.
- `--funding-amount <integer>` passes the original raw `fnn-cli` funding amount.
- `--wait <seconds>` waits for a ready or failed channel state.
- `--public <true|false>` forwards the Fiber public channel flag.
- `--one-way <true|false>` forwards the Fiber one-way channel flag.
- `--funding-fee-rate <integer>` forwards the funding fee rate.
- `--commitment-fee-rate <integer>` forwards the commitment fee rate.
- `--dry-run` prints the underlying `fnn-cli` command.

The peer should be connected first with `fiber connect`.

## `fiber channel list`

Lists channels for one managed node.

```bash
fiber channel list --node a
fiber channel list --node a --peer 03abc...
fiber channel list --node a --pending
fiber channel list --node a --closed
fiber channel list --node a --json
```

Options:

- `--node <label>` selects the local managed node. Default is `a`.
- `--peer <pubkey>` filters channels by peer public key.
- `--pending` shows only pending channels.
- `--closed` includes closed channels.
- `--json` prints raw channel JSON.

## `fiber pay`

Creates an invoice on one managed node and pays it from another.

```bash
fiber pay --from a --to b --amount 1
fiber pay --from a --to b --amount 1 --wait 120
```

What it does:

- creates an invoice on the receiver
- pays from the sender
- polls recent payments for success or failure
- records the last payment in dev-kit state

Options:

- `--from <label>` selects the paying node. Default is `a`.
- `--to <label>` selects the receiving node. Default is `b`.
- `--amount <ckb>` pays a CKB amount.
- `--currency <code>` forwards the invoice currency. Default is `Fibt`.
- `--timeout <seconds>` forwards payment timeout. Default is `60`.
- `--wait <seconds>` waits for success or failure. Default is `60`.

## `fiber accounts`

Shows generated node accounts, key paths, funding lock script, addresses, and capacity checks when available.

```bash
fiber accounts
fiber accounts --node a
fiber accounts --node a --json
```

Use this after starting a dev-kit node so you know which address to fund.

## `fiber keys export`

Prints local development secrets for recovery or migration.

```bash
fiber keys export --node a --yes
```

This command refuses to print secrets unless `--yes` is provided. Treat the output as sensitive.

## `fiber status`

Prints current dev-kit node, peer, channel, and last payment status.

```bash
fiber status
fiber status --watch
```

Without dev-kit state, it falls back to the single-node runtime and reports process and RPC readiness.

## `fiber inspect`

Prints a terminal inspector for the two-node dev kit.

```bash
fiber inspect
```

It shows:

- node-a and node-b topology
- channel state
- last payment summary
- failure hints for common channel states

## `fiber node`

Runs the bundled `fnn` binary directly.

```bash
fiber node --help
fiber node -c ./config.yml -d ./data --rpc-biscuit-public-key <public-key>
```

Use this when the wrapper does not expose a Fiber option yet.

## `fiber cli`

Runs the bundled `fnn-cli` binary.

```bash
fiber cli info
fiber cli channel list_channels
fiber cli peer list_peers
```

If `--url` is not provided, it uses the remembered single-node RPC URL or `FIBER_RPC_URL`.

## `fiber stop`

Stops Fiber processes started by this package.

```bash
fiber stop
fiber stop --all
```

Use `fiber stop` for the single-node background process. Use `fiber stop --all` for managed dev-kit nodes.

## Environment

- `FIBER_HOME` sets the single-node runtime directory. Default: `~/.fiber-node`.
- `FIBER_DEV_KIT_HOME` sets the dev-kit runtime directory. Default: `~/.fiber-dev-kit`.
- `FIBER_RPC_URL` selects or remembers the single-node RPC URL.
- `FIBER_CONFIG_TEMPLATE` selects a bundled config or local config file. Default: `testnet.yml`.
- `FIBER_SECRET_KEY_PASSWORD` sets the node key password. Default: `password`.
- `CKB_NODE_RPC_URL` sets the CKB RPC used by diagnostics and balance checks. Default: `https://testnet.ckbapp.dev/`.
- `RPC_LISTENING_ADDR` can force the single-node RPC listen address.
