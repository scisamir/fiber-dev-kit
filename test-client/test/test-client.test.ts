import { afterEach, describe, expect, it, vi } from "vitest";
import { FiberTestClient } from "../src/test-client";
import { installMockFetch } from "./helpers";

const NODE_URL = "http://node-a.test";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FiberTestClient", () => {
  it('refuses network: "mainnet" at construction', () => {
    expect(() => new FiberTestClient({ nodeUrl: NODE_URL, network: "mainnet" })).toThrow(/mainnet/i);
  });

  it("assertPaid polls until the payment reaches Success", async () => {
    let calls = 0;
    installMockFetch({
      [NODE_URL]: {
        get_payment: () => {
          calls += 1;
          return calls < 2
            ? { payment_hash: "0xabc", status: "Created", created_at: "0x1", fee: "0x0" }
            : { payment_hash: "0xabc", status: "Success", created_at: "0x1", fee: "0x0" };
        },
      },
    });

    const client = new FiberTestClient({ nodeUrl: NODE_URL, pollIntervalMs: 1, timeoutMs: 1000 });
    const payment = await client.assertPaid("0xabc");
    expect(payment.status).toBe("Success");
    expect(calls).toBe(2);
  });

  it("assertPaid throws with a diagnosis summary when the payment fails", async () => {
    installMockFetch({
      [NODE_URL]: {
        get_payment: () => ({
          payment_hash: "0xabc",
          status: "Failed",
          created_at: "0x1",
          fee: "0x0",
          failed_error: "no route found to destination",
        }),
      },
    });
    const client = new FiberTestClient({ nodeUrl: NODE_URL, pollIntervalMs: 1, timeoutMs: 1000 });
    await expect(client.assertPaid("0xabc")).rejects.toThrow(/no path could be found/i);
  });

  it("assertError matches a specific diagnosis code, and rejects a mismatched one", async () => {
    installMockFetch({
      [NODE_URL]: {
        get_payment: () => ({
          payment_hash: "0xabc",
          status: "Failed",
          created_at: "0x1",
          fee: "0x0",
          failed_error: "insufficient liquidity for this route",
        }),
      },
    });
    const client = new FiberTestClient({ nodeUrl: NODE_URL, pollIntervalMs: 1, timeoutMs: 1000 });

    const diagnosis = await client.assertError("0xabc", "INSUFFICIENT_LIQUIDITY");
    expect(diagnosis.code).toBe("INSUFFICIENT_LIQUIDITY");

    await expect(client.assertError("0xabc", "ROUTE_NOT_FOUND")).rejects.toThrow(/Expected payment.*to fail with "ROUTE_NOT_FOUND"/);
  });

  it("assertError throws a clear message when FNN reports no failure reason", async () => {
    installMockFetch({
      [NODE_URL]: {
        get_payment: () => ({ payment_hash: "0xabc", status: "Failed", created_at: "0x1", fee: "0x0" }),
      },
    });
    const client = new FiberTestClient({ nodeUrl: NODE_URL, pollIntervalMs: 1, timeoutMs: 1000 });
    await expect(client.assertError("0xabc", "ROUTE_NOT_FOUND")).rejects.toThrow(/no failure reason/i);
  });

  it("canPay returns null when the dry run would fail", async () => {
    installMockFetch({
      [NODE_URL]: {
        send_payment: () => {
          throw new Error("no route found");
        },
      },
    });
    const client = new FiberTestClient({ nodeUrl: NODE_URL });
    const result = await client.canPay({ to: "0x02aa", amount: 10 });
    expect(result).toBeNull();
  });

  it("routeConfidence combines local channel signals with dry-run diagnosis", async () => {
    installMockFetch({
      [NODE_URL]: {
        list_peers: () => ({ peers: [] }),
        list_channels: () => ({
          channels: [
            {
              channel_id: "0xc1",
              channel_outpoint: "0xop",
              peer_id: "0x02aa",
              state: { state_name: "ChannelReady" },
              local_balance: "0x5f5e100",
              remote_balance: "0x0",
            },
          ],
        }),
        send_payment: () => {
          throw new Error("insufficient liquidity for this route");
        },
      },
    });
    const client = new FiberTestClient({ nodeUrl: NODE_URL });

    const report = await client.routeConfidence({ to: "0x02aa", amount: 10 });

    expect(report.canPay).toBe(false);
    expect(report.level).toBe("low");
    expect(report.diagnosis?.code).toBe("INSUFFICIENT_LIQUIDITY");
    expect(report.reasons.join(" ")).toMatch(/no connected peers/i);
    expect(report.reasons.join(" ")).toMatch(/below the 10 CKB payment/i);
  });

  it("getChannelBalance converts shannon amounts to CKB", async () => {
    installMockFetch({
      [NODE_URL]: {
        list_channels: () => ({
          channels: [
            {
              channel_id: "0xc1",
              channel_outpoint: "0xop",
              state: { state_name: "ChannelReady" },
              local_balance: "0x5f5e100",
              remote_balance: "0x0",
            },
          ],
        }),
      },
    });
    const client = new FiberTestClient({ nodeUrl: NODE_URL });
    const balance = await client.getChannelBalance("0xc1");
    expect(balance).toEqual({ local: 1, remote: 0 });
  });

  it("getChannelBalance throws when the channel isn't found", async () => {
    installMockFetch({ [NODE_URL]: { list_channels: () => ({ channels: [] }) } });
    const client = new FiberTestClient({ nodeUrl: NODE_URL });
    await expect(client.getChannelBalance("0xmissing")).rejects.toThrow(/no channel with id/i);
  });
});
