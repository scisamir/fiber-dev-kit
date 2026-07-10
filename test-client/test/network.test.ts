import { afterEach, describe, expect, it, vi } from "vitest";
import { FiberNetwork } from "../src/network";
import { installMockFetch } from "./helpers";

const URL_A = "http://node-a.test";
const URL_B = "http://node-b.test";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FiberNetwork", () => {
  it("node() throws a helpful error listing known aliases", () => {
    installMockFetch({ [URL_A]: {}, [URL_B]: {} });
    const network = new FiberNetwork({ nodes: { a: URL_A, b: URL_B } });
    expect(() => network.node("c")).toThrow(/no node registered under alias "c".*a, b/is);
  });

  it("connect() skips connectPeer when the nodes are already peered", async () => {
    const connectPeerCalls: unknown[] = [];
    installMockFetch({
      [URL_A]: {
        list_peers: () => ({ peers: [{ pubkey: "0xb-pubkey", address: "/ip4/1.2.3.4/tcp/1" }] }),
        connect_peer: (params) => {
          connectPeerCalls.push(params[0]);
          return null;
        },
      },
      [URL_B]: {
        node_info: () => ({ pubkey: "0xb-pubkey", addresses: ["/ip4/1.2.3.4/tcp/1"] }),
      },
    });
    const network = new FiberNetwork({ nodes: { a: URL_A, b: URL_B } });
    await network.connect("a", "b");
    expect(connectPeerCalls).toHaveLength(0);
  });

  it("connect() calls connectPeer when the nodes aren't peered yet", async () => {
    const connectPeerCalls: unknown[] = [];
    installMockFetch({
      [URL_A]: {
        list_peers: () => ({ peers: [] }),
        connect_peer: (params) => {
          connectPeerCalls.push(params[0]);
          return null;
        },
      },
      [URL_B]: {
        node_info: () => ({ pubkey: "0xb-pubkey", addresses: ["/ip4/1.2.3.4/tcp/1"] }),
      },
    });
    const network = new FiberNetwork({ nodes: { a: URL_A, b: URL_B } });
    await network.connect("a", "b");
    expect(connectPeerCalls).toEqual([{ address: "/ip4/1.2.3.4/tcp/1" }]);
  });

  it("openChannel polls listChannels until the channel is ChannelReady", async () => {
    let listChannelsCalls = 0;
    installMockFetch({
      [URL_A]: {
        list_peers: () => ({ peers: [{ pubkey: "0xb-pubkey", address: "/ip4/1.2.3.4/tcp/1" }] }),
        open_channel: () => ({ temporary_channel_id: "0xtemp" }),
        list_channels: () => {
          listChannelsCalls += 1;
          const state = listChannelsCalls < 3 ? "AwaitingChannelReady" : "ChannelReady";
          return {
            channels: [
              { channel_id: "0xc1", channel_outpoint: "0xop", state: { state_name: state }, local_balance: "0x0", remote_balance: "0x0" },
            ],
          };
        },
      },
      [URL_B]: {
        node_info: () => ({ pubkey: "0xb-pubkey", addresses: ["/ip4/1.2.3.4/tcp/1"] }),
      },
    });
    const network = new FiberNetwork({ nodes: { a: URL_A, b: URL_B }, pollIntervalMs: 1, timeoutMs: 1000 });
    const channelId = await network.openChannel("a", "b", 99);
    expect(channelId).toBe("0xc1");
    expect(listChannelsCalls).toBeGreaterThanOrEqual(3);
  });

  it("pay() creates an invoice on the recipient and pays it from the sender", async () => {
    const sendPaymentCalls: unknown[] = [];
    installMockFetch({
      [URL_A]: {
        send_payment: (params) => {
          sendPaymentCalls.push(params[0]);
          return { payment_hash: "0xpay", status: "Created", created_at: "0x1", fee: "0x0" };
        },
      },
      [URL_B]: {
        new_invoice: () => ({
          invoice: {
            amount: "0x5f5e100",
            currency: "Fibt",
            data: { attrs: [], payment_hash: "0xpay", timestamp: "0x1" },
            signature: "00",
          },
          invoice_address: "fibt1testinvoice",
        }),
      },
    });
    const network = new FiberNetwork({ nodes: { a: URL_A, b: URL_B } });
    const result = await network.pay("a", "b", 1);
    expect(result.payment_hash).toBe("0xpay");
    expect(sendPaymentCalls[0]).toMatchObject({ invoice: "fibt1testinvoice" });
  });

  it("simulate.unreachablePeer surfaces a structured ROUTE_NOT_FOUND diagnosis", async () => {
    installMockFetch({
      [URL_A]: {
        send_payment: () => {
          throw new Error("unable to find a route to the destination");
        },
      },
      [URL_B]: {
        node_info: () => ({ pubkey: "0xb-pubkey", addresses: [] }),
      },
    });
    const network = new FiberNetwork({ nodes: { a: URL_A, b: URL_B } });
    const result = await network.simulate.unreachablePeer("a", "b", 5);
    expect(result.payment).toBeNull();
    expect(result.diagnosis?.code).toBe("ROUTE_NOT_FOUND");
  });
});
