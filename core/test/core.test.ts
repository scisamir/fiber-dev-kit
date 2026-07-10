import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ckbToShannonHex,
  diagnose,
  diagnosePayment,
  evaluateAlerts,
  FiberClient,
  FiberError,
  formatAmount,
  shannonHexToCkb,
} from "../src/index";
import type { Channel, NodeInfo, PaymentResult } from "../src/index";
import { installMockFetch } from "./helpers";

const NODE_URL = "http://node.test";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("amount utilities", () => {
  it("converts between CKB and hex-encoded shannons", () => {
    expect(ckbToShannonHex(1)).toBe("0x5f5e100");
    expect(shannonHexToCkb("0x5f5e100")).toBe(1);
    expect(formatAmount("0x5f5e100")).toBe("1 CKB");
  });

  it("sends numeric amounts as hex-encoded shannons and numeric options as hex", async () => {
    const calls: unknown[] = [];
    installMockFetch({
      [NODE_URL]: {
        send_payment: (params) => {
          calls.push(params[0]);
          return { payment_hash: "0xpay", status: "Created", created_at: "0x1", fee: "0x0" };
        },
      },
    });

    const client = new FiberClient(NODE_URL);
    await client.sendPayment({ targetPubkey: "0x02aa", amount: 2, keysend: true, maxParts: 3 });

    expect(calls[0]).toMatchObject({
      target_pubkey: "0x02aa",
      amount: "0xbebc200",
      keysend: true,
      max_parts: "0x3",
    });
  });
});

describe("diagnostics", () => {
  it("maps known payment failure text into actionable diagnoses", () => {
    const payment: PaymentResult = {
      payment_hash: "0xpay",
      status: "Failed",
      created_at: "0x1",
      fee: "0x0",
      failed_error: "unable to find a route to destination",
    };

    expect(diagnosePayment(payment)).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("maps request timeouts separately from RPC errors", () => {
    const diagnosis = diagnose(new FiberError("REQUEST_TIMEOUT", "RPC call exceeded 1ms"));
    expect(diagnosis).toMatchObject({ code: "TIMEOUT" });
  });
});

describe("FiberClient safety and errors", () => {
  it("blocks fund-moving calls on mainnet unless explicitly allowed", async () => {
    const client = new FiberClient({ nodeUrl: NODE_URL, network: "mainnet" });
    expect(() => client.sendPayment({ targetPubkey: "0x02aa", amount: 1, keysend: true })).toThrow(
      /MAINNET_WRITE_BLOCKED|mainnet/i,
    );
    expect(() => client.sendPayment({ targetPubkey: "0x02aa", amount: 1, keysend: true })).toThrow(FiberError);
    try {
      client.sendPayment({ targetPubkey: "0x02aa", amount: 1, keysend: true });
    } catch (err) {
      expect(err).toMatchObject({
      code: "MAINNET_WRITE_BLOCKED",
      });
    }
  });

  it("wraps JSON-RPC errors with method, code, and data context", async () => {
    installMockFetch({
      [NODE_URL]: {
        send_payment: () => {
          throw new Error("invalid pubkey: malformed public key");
        },
      },
    });

    const client = new FiberClient(NODE_URL);
    await expect(client.sendPayment({ targetPubkey: "0xbad", amount: 1, keysend: true })).rejects.toMatchObject({
      code: "RPC_ERROR",
      message: "invalid pubkey: malformed public key",
      context: { method: "send_payment", rpcCode: -32000, rpcData: { detail: "mock failure" } },
    });
  });
});

describe("alert rules", () => {
  it("emits peer, channel, liquidity, and failed-payment alerts from a node snapshot", () => {
    const node = nodeInfo({ peers_count: "0x0" });
    const channel = readyChannel({ local_balance: "0x0" });
    const payment: PaymentResult = {
      payment_hash: "0xpay",
      status: "Failed",
      created_at: "0x1",
      fee: "0x0",
      failed_error: "insufficient liquidity",
    };

    const alerts = evaluateAlerts({ nodeId: "a", node, peers: [], channels: [channel], payments: [payment] });

    expect(alerts.map((alert) => alert.code)).toEqual(["ZERO_PEERS", "LOW_LOCAL_BALANCE", "PAYMENT_FAILED"]);
    expect(alerts.find((alert) => alert.code === "PAYMENT_FAILED")?.diagnosis?.code).toBe("INSUFFICIENT_LIQUIDITY");
  });

  it("emits a critical unreachable alert when RPC health cannot be read", () => {
    expect(evaluateAlerts({ nodeId: "a", nodeError: new Error("ECONNREFUSED") })).toEqual([
      expect.objectContaining({ code: "NODE_UNREACHABLE", severity: "critical", nodeId: "a" }),
    ]);
  });
});

function nodeInfo(overrides: Partial<NodeInfo> = {}): NodeInfo {
  return {
    version: "0.6.0",
    commit_hash: "abc",
    pubkey: "0x02aa",
    features: [],
    node_name: "node-a",
    addresses: [],
    chain_hash: "0xchain",
    open_channel_auto_accept_min_ckb_funding_amount: "0x0",
    auto_accept_channel_ckb_funding_amount: "0x0",
    default_funding_lock_script: { code_hash: "0x", hash_type: "type", args: "0x" },
    tlc_expiry_delta: "0x0",
    tlc_min_value: "0x0",
    tlc_fee_proportional_millionths: "0x0",
    channel_count: "0x1",
    pending_channel_count: "0x0",
    peers_count: "0x1",
    udt_cfg_infos: [],
    ...overrides,
  };
}

function readyChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    channel_id: "0xc1",
    channel_outpoint: "0xop",
    peer_id: "0x02bb",
    state: { state_name: "ChannelReady" },
    local_balance: "0x5f5e100",
    remote_balance: "0x0",
    ...overrides,
  };
}
