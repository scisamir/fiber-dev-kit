import type { Diagnosis, HexString, NetworkMode, PaymentResult } from "@fiber-dev-kit/core";
import { FiberTestClient } from "./test-client";
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
export declare class FiberNetwork {
    private readonly clients;
    private readonly pubkeys;
    private readonly pollIntervalMs;
    private readonly timeoutMs;
    readonly simulate: NetworkSimulations;
    constructor(config: FiberNetworkConfig);
    node(alias: string): FiberTestClient;
    /** Waits until every configured node's RPC is reachable. Does not start any process. */
    start(): Promise<void>;
    pubkeyOf(alias: string): Promise<HexString>;
    /** Connects `fromAlias` to `toAlias` by pubkey/address, unless already peered. */
    connect(fromAlias: string, toAlias: string): Promise<void>;
    /** Connects (if needed), opens a channel, and waits until it's `ChannelReady` on the funder's side. */
    openChannel(fromAlias: string, toAlias: string, capacityCkb: number): Promise<HexString>;
    /** Creates an invoice on `toAlias` and pays it from `fromAlias`. */
    pay(fromAlias: string, toAlias: string, amountCkb: number, opts?: {
        description?: string;
    }): Promise<PaymentResult>;
}
/** Named failure-scenario helpers, built from primitives already in `core`. */
declare class NetworkSimulations {
    private readonly network;
    constructor(network: FiberNetwork);
    /** Drains `channelId`'s outbound capacity from `fromAlias`, then overpays past it. */
    insufficientLiquidity(fromAlias: string, toAlias: string, channelId: HexString): Promise<SimulationResult>;
    /** Pays a node with no route to it (never connected, no channel path). */
    unreachablePeer(fromAlias: string, targetAlias: string, amountCkb: number): Promise<SimulationResult>;
    /** Creates a 1-second-expiry invoice, waits it out, then tries to pay it. */
    expiredInvoice(fromAlias: string, toAlias: string, amountCkb: number): Promise<SimulationResult>;
    private attempt;
}
export {};
