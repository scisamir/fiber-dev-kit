import { type Diagnosis } from "./diagnostics";
import type { Channel } from "./types/channel";
import type { HexString } from "./types/common";
import type { NodeInfo, PeerInfo } from "./types/node";
import type { PaymentResult } from "./types/payment";
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertCode = "NODE_UNREACHABLE" | "ZERO_PEERS" | "NO_READY_CHANNELS" | "LOW_LOCAL_BALANCE" | "PAYMENT_FAILED";
export interface Alert {
    code: AlertCode;
    severity: AlertSeverity;
    summary: string;
    suggestion: string;
    nodeId?: string;
    channelId?: HexString;
    paymentHash?: HexString;
    diagnosis?: Diagnosis | null;
}
export interface AlertRules {
    /** Emit ZERO_PEERS when true. Default: true. */
    requirePeers?: boolean;
    /** Emit NO_READY_CHANNELS when true. Default: true. */
    requireReadyChannels?: boolean;
    /** Emit LOW_LOCAL_BALANCE below this ready-channel outbound balance. Default: 1 CKB. */
    minLocalBalanceCkb?: number;
    /** Emit PAYMENT_FAILED for recent failed payments when true. Default: true. */
    includeFailedPayments?: boolean;
}
export interface AlertSnapshot {
    nodeId?: string;
    node?: NodeInfo;
    nodeError?: unknown;
    peers?: PeerInfo[];
    channels?: Channel[];
    payments?: PaymentResult[];
}
/** Evaluates a node snapshot into actionable operational alerts for CLIs, UIs, or tests. */
export declare function evaluateAlerts(snapshot: AlertSnapshot, rules?: AlertRules): Alert[];
