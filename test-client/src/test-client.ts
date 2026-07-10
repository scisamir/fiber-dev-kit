import { FiberClient, FiberEventClient, diagnose, diagnosePayment, FiberError, shannonHexToCkb } from "@fiber-dev-kit/core";
import type { Channel, Diagnosis, DiagnosisCode, HexString, NetworkMode, PaymentResult } from "@fiber-dev-kit/core";
import { pollUntilResolved } from "./poller";

export interface TestClientConfig {
  nodeUrl: string;
  /**
   * Mainnet is refused outright at runtime (throws in the constructor) — this client sends
   * real test/keysend payments and drains channels. Typed as the full `NetworkMode` (rather
   * than excluding `"mainnet"`) so that check isn't silently optimized away as dead code by
   * callers who do have `"mainnet"` in a variable's inferred type.
   */
  network?: NetworkMode;
  /** Default poll interval for `waitForPayment()`. Default: 500ms. */
  pollIntervalMs?: number;
  /** Default timeout for `waitForPayment()`. Default: 10000ms. */
  timeoutMs?: number;
}

export type PayParams = { invoice: string; amount?: never } | { to: HexString; amount: number };

export interface RouteConfidenceReport {
  canPay: boolean;
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
  suggestions: string[];
  dryRunPayment: PaymentResult | null;
  diagnosis: Diagnosis | null;
}

const TERMINAL_PAYMENT_STATUSES = new Set(["Success", "Failed"]);

/**
 * Single-node test API. Built entirely on `@fiber-dev-kit/core` — no RPC calls of its own.
 * Assumes the node at `nodeUrl` is already running; this package never spawns or manages
 * `fnn` processes (that's the CLI's job).
 */
export class FiberTestClient {
  readonly rpc: FiberClient;
  readonly events: FiberEventClient;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(config: TestClientConfig) {
    if (config.network === "mainnet") {
      throw new Error("FiberTestClient refuses network: \"mainnet\" — it exists for devnet/testnet testing only.");
    }
    this.pollIntervalMs = config.pollIntervalMs ?? 500;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.rpc = new FiberClient({ nodeUrl: config.nodeUrl, network: config.network ?? "devnet" });
    this.events = new FiberEventClient({ client: this.rpc, pollIntervalMs: this.pollIntervalMs });
  }

  /** Pays an invoice, or keysends directly to a pubkey with an explicit amount. */
  pay(params: PayParams): Promise<PaymentResult> {
    if ("invoice" in params) {
      return this.rpc.payInvoice(params.invoice);
    }
    return this.rpc.sendPayment({ targetPubkey: params.to, amount: params.amount, keysend: true });
  }

  /** Dry-runs a payment to check routability/fees without sending. Returns `null` if it wouldn't succeed. */
  async canPay(params: PayParams): Promise<PaymentResult | null> {
    try {
      if ("invoice" in params) {
        return await this.rpc.sendPayment({ invoice: params.invoice, dryRun: true });
      }
      return await this.rpc.sendPayment({ targetPubkey: params.to, amount: params.amount, keysend: true, dryRun: true });
    } catch {
      return null;
    }
  }

  /**
   * Produces a small route-confidence report from local health signals plus FNN's dry-run
   * payment result. It is a practical preflight check, not a full network graph score.
   */
  async routeConfidence(params: PayParams): Promise<RouteConfidenceReport> {
    const reasons: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const [peers, channels] = await Promise.all([
      this.rpc.listPeers().catch(() => []),
      this.rpc.listChannels({ includeClosed: true }).catch(() => []),
    ]);

    const readyChannels = channels.filter((channel) => channel.state.state_name === "ChannelReady");
    if (peers.length === 0) {
      score -= 30;
      reasons.push("Node has no connected peers.");
      suggestions.push("Connect to at least one reachable peer before testing routed payments.");
    }
    if (readyChannels.length === 0) {
      score -= 40;
      reasons.push("Node has no ChannelReady channels.");
      suggestions.push("Open a channel and wait for ChannelReady before sending payments.");
    }

    if ("to" in params) {
      score = applyKeysendLiquiditySignal(score, params, readyChannels, reasons, suggestions);
    }

    let dryRunPayment: PaymentResult | null = null;
    let diagnosis: Diagnosis | null = null;
    try {
      dryRunPayment =
        "invoice" in params
          ? await this.rpc.sendPayment({ invoice: params.invoice, dryRun: true })
          : await this.rpc.sendPayment({ targetPubkey: params.to, amount: params.amount, keysend: true, dryRun: true });
      reasons.push("FNN dry-run accepted the payment.");
      score = Math.max(score, 90);
    } catch (err) {
      score = Math.min(score - 30, 40);
      if (FiberError.is(err)) {
        diagnosis = diagnose(err);
        reasons.push(diagnosis.summary);
        suggestions.push(diagnosis.suggestion);
      } else {
        reasons.push(`Dry-run failed: ${(err as Error).message}`);
        suggestions.push("Inspect the thrown error and retry after correcting the route or invoice.");
      }
    }

    const normalizedScore = Math.max(0, Math.min(100, score));
    return {
      canPay: dryRunPayment !== null,
      score: normalizedScore,
      level: confidenceLevel(normalizedScore),
      reasons,
      suggestions: [...new Set(suggestions)],
      dryRunPayment,
      diagnosis,
    };
  }

  waitForPayment(paymentHash: HexString): Promise<PaymentResult> {
    return pollUntilResolved(
      () => this.rpc.getPayment(paymentHash),
      (payment) => TERMINAL_PAYMENT_STATUSES.has(payment.status),
      { intervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs },
    );
  }

  async assertPaid(paymentHash: HexString): Promise<PaymentResult> {
    const payment = await this.waitForPayment(paymentHash);
    if (payment.status !== "Success") {
      const diagnosis = diagnosePayment(payment);
      throw new Error(
        `Expected payment ${paymentHash} to succeed, got status "${payment.status}"` +
          (diagnosis ? ` — ${diagnosis.summary} (${diagnosis.suggestion})` : ""),
      );
    }
    return payment;
  }

  async assertFailed(paymentHash: HexString): Promise<PaymentResult> {
    const payment = await this.waitForPayment(paymentHash);
    if (payment.status !== "Failed") {
      throw new Error(`Expected payment ${paymentHash} to fail, got status "${payment.status}"`);
    }
    return payment;
  }

  /** Asserts a payment failed for a specific, structured reason (see `diagnose()` in core). */
  async assertError(paymentHash: HexString, expectedCode: DiagnosisCode): Promise<Diagnosis> {
    const payment = await this.assertFailed(paymentHash);
    const diagnosis = diagnosePayment(payment);
    if (!diagnosis) {
      throw new Error(
        `Payment ${paymentHash} failed, but FNN reported no failure reason (failed_error was empty) — ` +
          `cannot verify it matches "${expectedCode}".`,
      );
    }
    if (diagnosis.code !== expectedCode) {
      throw new Error(
        `Expected payment ${paymentHash} to fail with "${expectedCode}", got "${diagnosis.code}": ${diagnosis.summary}`,
      );
    }
    return diagnosis;
  }

  async getChannelBalance(channelId: HexString): Promise<{ local: number; remote: number }> {
    const channels = await this.rpc.listChannels({ includeClosed: true });
    const channel = channels.find((c) => c.channel_id === channelId);
    if (!channel) {
      throw new Error(`getChannelBalance(): no channel with id ${channelId} found on this node.`);
    }
    return { local: shannonHexToCkb(channel.local_balance), remote: shannonHexToCkb(channel.remote_balance) };
  }

  /** Pays `to` repeatedly until this channel's outbound capacity is exhausted (minus 1 CKB for fees). */
  async drainChannel(channelId: HexString, to: HexString): Promise<void> {
    const { local } = await this.getChannelBalance(channelId);
    const amount = Math.floor(local) - 1;
    if (amount <= 0) return;
    const result = await this.pay({ to, amount });
    await this.waitForPayment(result.payment_hash);
  }
}

function applyKeysendLiquiditySignal(
  score: number,
  params: Extract<PayParams, { to: HexString }>,
  readyChannels: Channel[],
  reasons: string[],
  suggestions: string[],
): number {
  const candidateChannels = readyChannels.filter((channel) => !channel.peer_id || channel.peer_id === params.to);
  if (candidateChannels.length === 0) return score;

  const bestLocalBalance = Math.max(...candidateChannels.map((channel) => shannonHexToCkb(channel.local_balance)));
  if (bestLocalBalance < params.amount) {
    reasons.push(`Best matching channel has ${bestLocalBalance} CKB outbound balance, below the ${params.amount} CKB payment.`);
    suggestions.push("Reduce the payment amount, rebalance the channel, or open more outbound liquidity.");
    return score - 25;
  }

  reasons.push(`A ready channel has enough local balance for ${params.amount} CKB before fees.`);
  return score;
}

function confidenceLevel(score: number): RouteConfidenceReport["level"] {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}
