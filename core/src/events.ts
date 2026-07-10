import { diagnosePayment, type Diagnosis } from "./diagnostics";
import type { FiberClient } from "./client";
import type { Channel } from "./types/channel";
import type { HexString } from "./types/common";
import type { PaymentResult } from "./types/payment";

export type FiberEvent =
  | { type: "channel.opened"; channel: Channel }
  | { type: "channel.updated"; channel: Channel }
  | { type: "channel.closed"; channel: Channel }
  | { type: "payment.created"; payment: PaymentResult }
  | { type: "payment.updated"; payment: PaymentResult }
  | { type: "payment.succeeded"; payment: PaymentResult }
  | { type: "payment.failed"; payment: PaymentResult; diagnosis: Diagnosis | null };

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
export class FiberEventClient {
  private readonly client: FiberClient;
  private readonly pollIntervalMs: number;
  private readonly onError: (error: unknown) => void;
  private readonly handlers = new Map<FiberEvent["type"], Set<(event: FiberEvent) => void>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastChannels = new Map<HexString, Channel>();
  private lastPayments = new Map<HexString, PaymentResult>();
  private polling = false;

  constructor(config: FiberEventClientConfig) {
    this.client = config.client;
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.onError = config.onError ?? (() => {});
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.pollIntervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Subscribes to an event type. Returns an unsubscribe function. */
  on(type: FiberEvent["type"], handler: (event: FiberEvent) => void): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  private emit(event: FiberEvent): void {
    for (const handler of this.handlers.get(event.type) ?? []) {
      handler(event);
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await Promise.all([this.pollChannels(), this.pollPayments()]);
    } catch (err) {
      this.onError(err);
    } finally {
      this.polling = false;
    }
  }

  private async pollChannels(): Promise<void> {
    const channels = await this.client.listChannels({ includeClosed: true });
    const seen = new Set<HexString>();

    for (const channel of channels) {
      seen.add(channel.channel_id);
      const previous = this.lastChannels.get(channel.channel_id);
      const state = channelStateName(channel);

      if (!previous) {
        this.emit({ type: "channel.opened", channel });
      } else if (channelStateName(previous) !== state) {
        this.emit({ type: state === "Closed" ? "channel.closed" : "channel.updated", channel });
      }
      this.lastChannels.set(channel.channel_id, channel);
    }

    for (const [id, channel] of this.lastChannels) {
      if (!seen.has(id)) {
        this.emit({ type: "channel.closed", channel });
        this.lastChannels.delete(id);
      }
    }
  }

  private async pollPayments(): Promise<void> {
    const payments = await this.client.listPayments({ limit: 50 });

    for (const payment of payments) {
      const previous = this.lastPayments.get(payment.payment_hash);
      if (!previous) {
        this.emit({ type: "payment.created", payment });
      } else if (previous.status !== payment.status) {
        this.emit({ type: "payment.updated", payment });
        if (payment.status === "Success") this.emit({ type: "payment.succeeded", payment });
        if (payment.status === "Failed") {
          this.emit({ type: "payment.failed", payment, diagnosis: diagnosePayment(payment) });
        }
      }
      this.lastPayments.set(payment.payment_hash, payment);
    }
  }
}

function channelStateName(channel: Channel): string {
  return channel.state.state_name;
}
