import { diagnose, diagnosePayment, FiberError } from "@fiber-dev-kit/core";
import type { Diagnosis, HexString, NetworkMode, PaymentResult } from "@fiber-dev-kit/core";
import { FiberTestClient } from "./test-client";
import { pollUntilResolved, sleep } from "./poller";

export interface NetworkNodeConfig {
  nodeUrl: string;
  network?: Exclude<NetworkMode, "mainnet">;
}

/** Alias (e.g. `"a"`, `"b"`) → an already-running node's RPC URL or config. */
export type NetworkTopology = Record<string, string | NetworkNodeConfig>;

export interface FiberNetworkConfig {
  nodes: NetworkTopology;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface SimulationResult {
  payment: PaymentResult | null;
  diagnosis: Diagnosis | null;
}

/**
 * Multi-node test orchestration. Wraps one `FiberTestClient` per alias and never spawns or
 * manages `fnn` processes — point it at nodes that are already running (via the fiber-devkit
 * CLI, manually, or however your team's launcher of the day works).
 */
export class FiberNetwork {
  private readonly clients = new Map<string, FiberTestClient>();
  private readonly pubkeys = new Map<string, HexString>();
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  readonly simulate: NetworkSimulations;

  constructor(config: FiberNetworkConfig) {
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    for (const [alias, nodeConfig] of Object.entries(config.nodes)) {
      const resolved = typeof nodeConfig === "string" ? { nodeUrl: nodeConfig } : nodeConfig;
      this.clients.set(
        alias,
        new FiberTestClient({ ...resolved, pollIntervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs }),
      );
    }
    this.simulate = new NetworkSimulations(this);
  }

  node(alias: string): FiberTestClient {
    const client = this.clients.get(alias);
    if (!client) {
      throw new Error(`FiberNetwork: no node registered under alias "${alias}". Known aliases: ${[...this.clients.keys()].join(", ") || "(none)"}`);
    }
    return client;
  }

  /** Waits until every configured node's RPC is reachable. Does not start any process. */
  async start(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map((client) =>
        pollUntilResolved(
          () => client.rpc.info().then(() => true, () => false),
          (ok) => ok,
          { intervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs },
        ),
      ),
    );
  }

  async pubkeyOf(alias: string): Promise<HexString> {
    let pubkey = this.pubkeys.get(alias);
    if (!pubkey) {
      const info = await this.node(alias).rpc.info();
      pubkey = info.pubkey;
      this.pubkeys.set(alias, pubkey);
    }
    return pubkey;
  }

  /** Connects `fromAlias` to `toAlias` by pubkey/address, unless already peered. */
  async connect(fromAlias: string, toAlias: string): Promise<void> {
    const from = this.node(fromAlias);
    const toInfo = await this.node(toAlias).rpc.info();
    const alreadyConnected = (await from.rpc.listPeers()).some((peer) => peer.pubkey === toInfo.pubkey);
    if (alreadyConnected) return;

    const address = toInfo.addresses[0];
    if (!address) {
      throw new Error(
        `connect(): node "${toAlias}" has no advertised address in info().addresses. ` +
          `It may not be listening publicly — connect it manually with a known multiaddr instead.`,
      );
    }
    await from.rpc.connectPeer({ address });
  }

  /** Connects (if needed), opens a channel, and waits until it's `ChannelReady` on the funder's side. */
  async openChannel(fromAlias: string, toAlias: string, capacityCkb: number): Promise<HexString> {
    await this.connect(fromAlias, toAlias);
    const from = this.node(fromAlias);
    const toPubkey = await this.pubkeyOf(toAlias);

    await from.rpc.openChannel({ pubkey: toPubkey, fundingAmount: capacityCkb });

    const ready = await pollUntilResolved(
      () => from.rpc.listChannels({ pubkey: toPubkey }),
      (channels) => channels.some((c) => c.state.state_name === "ChannelReady"),
      { intervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs },
    );
    return ready.find((c) => c.state.state_name === "ChannelReady")!.channel_id;
  }

  /** Creates an invoice on `toAlias` and pays it from `fromAlias`. */
  async pay(fromAlias: string, toAlias: string, amountCkb: number, opts: { description?: string } = {}): Promise<PaymentResult> {
    const to = this.node(toAlias);
    const from = this.node(fromAlias);
    const { invoice_address } = await to.rpc.createInvoice({
      amount: amountCkb,
      description: opts.description ?? `${fromAlias} -> ${toAlias}`,
    });
    return from.pay({ invoice: invoice_address });
  }
}

/** Named failure-scenario helpers, built from primitives already in `core`. */
class NetworkSimulations {
  constructor(private readonly network: FiberNetwork) {}

  /** Drains `channelId`'s outbound capacity from `fromAlias`, then overpays past it. */
  async insufficientLiquidity(fromAlias: string, toAlias: string, channelId: HexString): Promise<SimulationResult> {
    const from = this.network.node(fromAlias);
    const toPubkey = await this.network.pubkeyOf(toAlias);
    const { local } = await from.getChannelBalance(channelId);

    if (local > 1) {
      await from.drainChannel(channelId, toPubkey);
    }

    return this.attempt(() => this.network.pay(fromAlias, toAlias, local + 1));
  }

  /** Pays a node with no route to it (never connected, no channel path). */
  async unreachablePeer(fromAlias: string, targetAlias: string, amountCkb: number): Promise<SimulationResult> {
    const from = this.network.node(fromAlias);
    const targetPubkey = await this.network.pubkeyOf(targetAlias);
    return this.attempt(() => from.pay({ to: targetPubkey, amount: amountCkb }));
  }

  /** Creates a 1-second-expiry invoice, waits it out, then tries to pay it. */
  async expiredInvoice(fromAlias: string, toAlias: string, amountCkb: number): Promise<SimulationResult> {
    const to = this.network.node(toAlias);
    const from = this.network.node(fromAlias);
    const { invoice_address } = await to.rpc.createInvoice({
      amount: amountCkb,
      expiry: 1,
      description: "simulate.expiredInvoice",
    });
    await sleep(1_500);
    return this.attempt(() => from.pay({ invoice: invoice_address }));
  }

  private async attempt(send: () => Promise<PaymentResult>): Promise<SimulationResult> {
    try {
      const payment = await send();
      return { payment, diagnosis: diagnosePayment(payment) };
    } catch (err) {
      if (FiberError.is(err)) {
        return { payment: null, diagnosis: diagnose(err) };
      }
      throw err;
    }
  }
}
