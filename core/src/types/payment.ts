import type { HexString, Script } from "./common";

export interface HopHint {
  pubkey: HexString;
  channelOutpoint: string;
  feeRate: HexString;
  tlcExpiryDelta: HexString;
}

export interface SendPaymentParams {
  /** Pubkey of the payment target node. Obtainable via `info()` or `graph_nodes`. */
  targetPubkey?: HexString;
  /** Amount in shannons (hex) or CKB (number) for non-UDT payments. Defaults to the invoice amount if unset. */
  amount?: HexString;
  /** Hash used in the payment's HTLC. Required unless `keysend` or an invoice supplies one. */
  paymentHash?: HexString;
  finalTlcExpiryDelta?: number;
  tlcExpiryLimit?: number;
  /** Encoded invoice string (`invoice_address` from `createInvoice`). */
  invoice?: string;
  /** Payment timeout in seconds. */
  timeout?: number;
  maxFeeAmount?: HexString;
  maxFeeRate?: number;
  maxParts?: number;
  trampolineHops?: HexString[];
  keysend?: boolean;
  udtTypeScript?: Script;
  /** Allow a circular self-payment, used for channel rebalancing. */
  allowSelfPayment?: boolean;
  customRecords?: Record<string, HexString>;
  hopHints?: HopHint[];
  /** Dry-run: validate routing/fees without sending. */
  dryRun?: boolean;
}

/**
 * Payment lifecycle status. `Created` and `Success` confirmed against a real end-to-end
 * testnet payment; `Inflight`/`Failed` per the RPC's `--status` filter on `list_payments`
 * and standard Lightning-style payment lifecycles.
 */
export type PaymentStatus = "Created" | "Inflight" | "Success" | "Failed";

/** Confirmed live: `payment_hash`, `status`, `created_at`, `fee`. */
export interface PaymentResult {
  payment_hash: HexString;
  status: PaymentStatus;
  created_at: HexString;
  fee: HexString;
  last_updated_at?: HexString;
  failed_error?: string;
}

export interface GetPaymentParams {
  paymentHash: HexString;
}

export interface ListPaymentsParams {
  status?: PaymentStatus;
  limit?: number;
  after?: HexString;
}

export interface ListPaymentsResult {
  payments: PaymentResult[];
  last_cursor: HexString | null;
}
