import { diagnosePayment, type Diagnosis } from "./diagnostics";
import type { Channel } from "./types/channel";
import type { HexString } from "./types/common";
import type { NodeInfo, PeerInfo } from "./types/node";
import type { PaymentResult } from "./types/payment";
import { fromHex, shannonHexToCkb } from "./utils";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertCode =
  | "NODE_UNREACHABLE"
  | "ZERO_PEERS"
  | "NO_READY_CHANNELS"
  | "LOW_LOCAL_BALANCE"
  | "PAYMENT_FAILED";

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

const DEFAULT_ALERT_RULES: Required<AlertRules> = {
  requirePeers: true,
  requireReadyChannels: true,
  minLocalBalanceCkb: 1,
  includeFailedPayments: true,
};

/** Evaluates a node snapshot into actionable operational alerts for CLIs, UIs, or tests. */
export function evaluateAlerts(snapshot: AlertSnapshot, rules: AlertRules = {}): Alert[] {
  const resolved = { ...DEFAULT_ALERT_RULES, ...rules };
  const alerts: Alert[] = [];
  const nodeId = snapshot.nodeId;

  if (snapshot.nodeError || !snapshot.node) {
    return [
      {
        code: "NODE_UNREACHABLE",
        severity: "critical",
        nodeId,
        summary: `Node${nodeId ? ` "${nodeId}"` : ""} is not reachable over RPC.`,
        suggestion: "Confirm the FNN process is running and that the RPC URL, port, and auth settings are correct.",
      },
    ];
  }

  const peers = snapshot.peers ?? [];
  if (resolved.requirePeers && peers.length === 0 && fromHex(snapshot.node.peers_count) === 0n) {
    alerts.push({
      code: "ZERO_PEERS",
      severity: "warning",
      nodeId,
      summary: `Node${nodeId ? ` "${nodeId}"` : ""} has no connected peers.`,
      suggestion: "Connect at least one reachable Fiber peer before opening channels or testing routed payments.",
    });
  }

  const channels = snapshot.channels ?? [];
  const readyChannels = channels.filter((channel) => channel.state.state_name === "ChannelReady");
  if (resolved.requireReadyChannels && readyChannels.length === 0) {
    alerts.push({
      code: "NO_READY_CHANNELS",
      severity: "warning",
      nodeId,
      summary: `Node${nodeId ? ` "${nodeId}"` : ""} has no ready channels.`,
      suggestion: "Open a channel and wait until it reaches ChannelReady before testing payments.",
    });
  }

  for (const channel of readyChannels) {
    const localBalance = shannonHexToCkb(channel.local_balance);
    if (localBalance < resolved.minLocalBalanceCkb) {
      alerts.push({
        code: "LOW_LOCAL_BALANCE",
        severity: "warning",
        nodeId,
        channelId: channel.channel_id,
        summary: `Channel ${shortId(channel.channel_id)} has only ${localBalance} CKB of outbound balance.`,
        suggestion: "Rebalance the channel, reduce payment size, or open a channel with more local liquidity.",
      });
    }
  }

  if (resolved.includeFailedPayments) {
    for (const payment of snapshot.payments ?? []) {
      if (payment.status !== "Failed") continue;
      const diagnosis = diagnosePayment(payment);
      alerts.push({
        code: "PAYMENT_FAILED",
        severity: "critical",
        nodeId,
        paymentHash: payment.payment_hash,
        diagnosis,
        summary: diagnosis?.summary ?? `Payment ${shortId(payment.payment_hash)} failed.`,
        suggestion: diagnosis?.suggestion ?? "Inspect the raw failed_error field and retry after correcting the route or invoice.",
      });
    }
  }

  return alerts;
}

function shortId(value: HexString): string {
  return value.length > 14 ? `${value.slice(0, 12)}...` : value;
}
