import type { HexString, Script } from "./common";

/** Fiber Bitcoin-style bech32m prefixes: mainnet, testnet, devnet. */
export type InvoiceCurrency = "Fibb" | "Fibt" | "Fibd";

export type HashAlgorithm = "Sha256" | "Ckbhash";

export interface NewInvoiceParams {
  /** Amount in shannons (hex) or CKB (number) — ergonomic methods accept CKB and convert. */
  amount: HexString;
  currency: InvoiceCurrency;
  description?: string;
  /** If set, `paymentHash` must be absent. If both are absent, a random preimage is generated. */
  paymentPreimage?: HexString;
  /** Hold invoice: hash is known, preimage is revealed later via `settleInvoice`. */
  paymentHash?: HexString;
  /** Expiry in seconds. */
  expiry?: number;
  fallbackAddress?: string;
  /** Final HTLC timeout in ms. Min 16 hours, max 14 days. */
  finalExpiryDelta?: number;
  udtTypeScript?: Script;
  hashAlgorithm?: HashAlgorithm;
  allowMpp?: boolean;
  allowTrampolineRouting?: boolean;
}

interface InvoiceAttrDescription {
  description: string;
}
interface InvoiceAttrExpiry {
  final_htlc_minimum_expiry_delta: HexString;
}
interface InvoiceAttrPayee {
  payee_public_key: HexString;
}
type InvoiceAttr = InvoiceAttrDescription | InvoiceAttrExpiry | InvoiceAttrPayee | Record<string, unknown>;

export interface CkbInvoiceData {
  attrs: InvoiceAttr[];
  payment_hash: HexString;
  timestamp: HexString;
}

export interface CkbInvoice {
  amount: HexString;
  currency: InvoiceCurrency;
  data: CkbInvoiceData;
  signature: string;
}

export interface NewInvoiceResult {
  invoice: CkbInvoice;
  invoice_address: string;
}

/** `Open` confirmed live; `Cancelled`/`Paid`/`Expired` per the RPC's documented invoice lifecycle. */
export type InvoiceStatus = "Open" | "Cancelled" | "Paid" | "Expired";

export interface GetInvoiceResult {
  invoice: CkbInvoice;
  invoice_address: string;
  status: InvoiceStatus;
}

export interface ParseInvoiceParams {
  invoice: string;
}

export interface ParseInvoiceResult {
  invoice: CkbInvoice;
}

export interface CancelInvoiceParams {
  paymentHash: HexString;
}

export interface SettleInvoiceParams {
  paymentHash: HexString;
  paymentPreimage: HexString;
}
