import { FiberClient, FiberEventClient } from "@fiber-dev-kit/core";
import type { Diagnosis, DiagnosisCode, HexString, NetworkMode, PaymentResult } from "@fiber-dev-kit/core";
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
export type PayParams = {
    invoice: string;
    amount?: never;
} | {
    to: HexString;
    amount: number;
};
export interface RouteConfidenceReport {
    canPay: boolean;
    score: number;
    level: "high" | "medium" | "low";
    reasons: string[];
    suggestions: string[];
    dryRunPayment: PaymentResult | null;
    diagnosis: Diagnosis | null;
}
/**
 * Single-node test API. Built entirely on `@fiber-dev-kit/core` — no RPC calls of its own.
 * Assumes the node at `nodeUrl` is already running; this package never spawns or manages
 * `fnn` processes (that's the CLI's job).
 */
export declare class FiberTestClient {
    readonly rpc: FiberClient;
    readonly events: FiberEventClient;
    private readonly pollIntervalMs;
    private readonly timeoutMs;
    constructor(config: TestClientConfig);
    /** Pays an invoice, or keysends directly to a pubkey with an explicit amount. */
    pay(params: PayParams): Promise<PaymentResult>;
    /** Dry-runs a payment to check routability/fees without sending. Returns `null` if it wouldn't succeed. */
    canPay(params: PayParams): Promise<PaymentResult | null>;
    /**
     * Produces a small route-confidence report from local health signals plus FNN's dry-run
     * payment result. It is a practical preflight check, not a full network graph score.
     */
    routeConfidence(params: PayParams): Promise<RouteConfidenceReport>;
    waitForPayment(paymentHash: HexString): Promise<PaymentResult>;
    assertPaid(paymentHash: HexString): Promise<PaymentResult>;
    assertFailed(paymentHash: HexString): Promise<PaymentResult>;
    /** Asserts a payment failed for a specific, structured reason (see `diagnose()` in core). */
    assertError(paymentHash: HexString, expectedCode: DiagnosisCode): Promise<Diagnosis>;
    getChannelBalance(channelId: HexString): Promise<{
        local: number;
        remote: number;
    }>;
    /** Pays `to` repeatedly until this channel's outbound capacity is exhausted (minus 1 CKB for fees). */
    drainChannel(channelId: HexString, to: HexString): Promise<void>;
}
