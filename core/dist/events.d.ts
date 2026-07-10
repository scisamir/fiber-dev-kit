import { type Diagnosis } from "./diagnostics";
import type { FiberClient } from "./client";
import type { Channel } from "./types/channel";
import type { PaymentResult } from "./types/payment";
export type FiberEvent = {
    type: "channel.opened";
    channel: Channel;
} | {
    type: "channel.updated";
    channel: Channel;
} | {
    type: "channel.closed";
    channel: Channel;
} | {
    type: "payment.created";
    payment: PaymentResult;
} | {
    type: "payment.updated";
    payment: PaymentResult;
} | {
    type: "payment.succeeded";
    payment: PaymentResult;
} | {
    type: "payment.failed";
    payment: PaymentResult;
    diagnosis: Diagnosis | null;
};
export interface FiberEventClientConfig {
    client: FiberClient;
    /** How often to poll `listChannels`/`listPayments` for changes, in ms. Default: 1000. */
    pollIntervalMs?: number;
    /**
     * Called when a poll cycle fails (transient RPC/network error). Polling continues on the
     * next interval regardless — a single flaky call must never take down a long-running
     * consumer (the inspector server, a CI test run). Default: swallowed silently.
     */
    onError?: (error: unknown) => void;
}
/**
 * FNN's RPC exposes no server-push subscription channel for clients (the node's WebSocket
 * support is for the Fiber peer-to-peer transport, not for RPC event delivery). This client
 * approximates live events by polling `listChannels`/`listPayments` on an interval and
 * diffing snapshots, so downstream consumers (the inspector UI, test-client assertions) can
 * still subscribe to a typed event stream.
 */
export declare class FiberEventClient {
    private readonly client;
    private readonly pollIntervalMs;
    private readonly onError;
    private readonly handlers;
    private timer;
    private lastChannels;
    private lastPayments;
    private polling;
    constructor(config: FiberEventClientConfig);
    start(): void;
    stop(): void;
    /** Subscribes to an event type. Returns an unsubscribe function. */
    on(type: FiberEvent["type"], handler: (event: FiberEvent) => void): () => void;
    private emit;
    private poll;
    private pollChannels;
    private pollPayments;
}
