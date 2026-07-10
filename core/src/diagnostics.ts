import { FiberError } from "./errors";
import type { PaymentResult } from "./types/payment";

export type DiagnosisCode =
  | "INSUFFICIENT_LIQUIDITY"
  | "ROUTE_NOT_FOUND"
  | "PEER_NOT_CONNECTED"
  | "PEER_UNREACHABLE"
  | "INVOICE_EXPIRED"
  | "INVOICE_ALREADY_PAID"
  | "INVOICE_CANCELLED"
  | "INVALID_PARAMS"
  | "TIMEOUT"
  | "UNKNOWN";

export interface Diagnosis {
  code: DiagnosisCode;
  /** Plain-English explanation of what likely happened. */
  summary: string;
  /** A concrete next step to try. */
  suggestion: string;
}

interface Pattern {
  code: DiagnosisCode;
  test: RegExp;
  summary: string;
  suggestion: string;
}

/**
 * Heuristic message/data patterns mapped from FNN error text observed in practice (RPC
 * `-32602 Invalid params` responses, CLI error output). FNN does not publish a stable error
 * taxonomy, so this table is deliberately a living, appendable list rather than an exhaustive
 * enum — extend it as new failure strings are seen in the wild.
 */
const PATTERNS: Pattern[] = [
  {
    code: "INSUFFICIENT_LIQUIDITY",
    test: /insufficient|liquidity|not enough balance|exceeds.*balance/i,
    summary: "The route has capacity in total, but not enough usable balance in the direction this payment needs to flow.",
    suggestion: "Reduce the payment amount, open a larger channel, or rebalance existing channels toward the recipient.",
  },
  {
    code: "ROUTE_NOT_FOUND",
    test: /no route|route.*not found|routing.*fail|unable to find a route/i,
    summary: "No path could be found from this node to the target through the currently known network graph.",
    suggestion: "Confirm the target node has at least one public channel, or connect directly and open a channel to it.",
  },
  {
    code: "PEER_NOT_CONNECTED",
    test: /peer.*not (found|connected)|not connected to peer/i,
    summary: "The RPC call targets a peer this node hasn't connected to yet.",
    suggestion: "Call connectPeer() with the peer's multiaddr or pubkey before retrying this operation.",
  },
  {
    code: "PEER_UNREACHABLE",
    test: /connection refused|dial.*fail|unreachable|timed out.*connect/i,
    summary: "The node could not establish a network connection to the peer's address.",
    suggestion: "Check the peer's multiaddr/port and confirm it's online and reachable from this node.",
  },
  {
    code: "INVOICE_EXPIRED",
    test: /invoice.*expired|expired.*invoice/i,
    summary: "The invoice's expiry window has passed.",
    suggestion: "Ask the recipient to generate a new invoice with createInvoice().",
  },
  {
    code: "INVOICE_ALREADY_PAID",
    test: /already paid|invoice.*paid/i,
    summary: "This invoice has already been settled.",
    suggestion: "No action needed — check getPayment()/getInvoice() for the existing settlement.",
  },
  {
    code: "INVOICE_CANCELLED",
    test: /invoice.*cancel/i,
    summary: "This invoice was cancelled and can no longer be paid.",
    suggestion: "Ask the recipient to generate a new invoice.",
  },
  {
    code: "INVALID_PARAMS",
    // "invalid pubkey '...': malformed public key" is a confirmed live FNN error string.
    test: /missing field|invalid params|invalid type|invalid \w+|malformed|expected/i,
    summary: "The RPC call was rejected because a parameter was missing, malformed, or the wrong type.",
    suggestion: "Inspect the error's context.rpcData for the exact field FNN rejected.",
  },
];

/** Turns a `FiberError` into a structured, actionable diagnosis for logs, CLIs, or UIs. */
export function diagnose(error: FiberError): Diagnosis {
  if (error.code === "REQUEST_TIMEOUT") {
    return {
      code: "TIMEOUT",
      summary: "The RPC call exceeded its timeout before the node responded.",
      suggestion: "Retry with a longer timeoutMs, or check whether the node is under heavy load.",
    };
  }

  const haystack = `${error.message} ${JSON.stringify(error.context?.rpcData ?? "")}`;
  const match = PATTERNS.find((pattern) => pattern.test.test(haystack));
  if (match) {
    return { code: match.code, summary: match.summary, suggestion: match.suggestion };
  }

  return {
    code: "UNKNOWN",
    summary: error.message,
    suggestion: "No known pattern matched this error; inspect error.context for the raw RPC response.",
  };
}

/** Diagnoses a `Failed` payment's `failed_error` field. Returns `null` for non-failed payments. */
export function diagnosePayment(payment: PaymentResult): Diagnosis | null {
  if (payment.status !== "Failed" || !payment.failed_error) return null;
  return diagnose(new FiberError("RPC_ERROR", payment.failed_error));
}
