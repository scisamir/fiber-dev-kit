import { FiberError } from "./errors";
import type { PaymentResult } from "./types/payment";
export type DiagnosisCode = "INSUFFICIENT_LIQUIDITY" | "ROUTE_NOT_FOUND" | "PEER_NOT_CONNECTED" | "PEER_UNREACHABLE" | "INVOICE_EXPIRED" | "INVOICE_ALREADY_PAID" | "INVOICE_CANCELLED" | "INVALID_PARAMS" | "TIMEOUT" | "UNKNOWN";
export interface Diagnosis {
    code: DiagnosisCode;
    /** Plain-English explanation of what likely happened. */
    summary: string;
    /** A concrete next step to try. */
    suggestion: string;
}
/** Turns a `FiberError` into a structured, actionable diagnosis for logs, CLIs, or UIs. */
export declare function diagnose(error: FiberError): Diagnosis;
/** Diagnoses a `Failed` payment's `failed_error` field. Returns `null` for non-failed payments. */
export declare function diagnosePayment(payment: PaymentResult): Diagnosis | null;
