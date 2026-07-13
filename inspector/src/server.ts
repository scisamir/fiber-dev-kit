import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { evaluateAlerts, FiberClient, FiberEventClient } from "@fiber-dev-kit/core";
import type { Alert, FiberEvent, NodeInfo } from "@fiber-dev-kit/core";

export interface InspectorNodeConfig {
  /** Short label shown in the UI, e.g. `"a"` or `"node-a"`. */
  id: string;
  rpcUrl: string;
}

export interface InspectorConfig {
  nodes: InspectorNodeConfig[];
  /** HTTP port to listen on. Default: 3030. */
  port?: number;
  /** HTTP host to bind. Default: 127.0.0.1. */
  host?: string;
  /** How often each watched node is polled for the live event feed. Default: 1500ms. */
  pollIntervalMs?: number;
}

export interface InspectorHandle {
  port: number;
  host: string;
  stop: () => void;
}

interface WatchedNode {
  id: string;
  client: FiberClient;
  events: FiberEventClient;
}

const EVENT_TYPES: FiberEvent["type"][] = [
  "channel.opened",
  "channel.updated",
  "channel.closed",
  "payment.created",
  "payment.updated",
  "payment.succeeded",
  "payment.failed",
];

/**
 * Serves the inspector dashboard: a static single-page UI, a small REST API projecting
 * `core`'s typed RPC results, and a WebSocket that re-broadcasts `FiberEventClient`'s
 * (polling-derived — see `core`'s `events.ts`) events to connected browsers.
 */
export async function startInspector(config: InspectorConfig): Promise<InspectorHandle> {
  if (config.nodes.length === 0) {
    throw new Error("startInspector(): config.nodes must list at least one { id, rpcUrl }.");
  }

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("error", () => {
    // The HTTP server reports listen failures; keep ws from turning them into uncaught errors.
  });

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  app.use(express.static(path.join(packageRoot, "public")));

  const watched: WatchedNode[] = config.nodes.map((node) => {
    const client = new FiberClient({ nodeUrl: node.rpcUrl, network: "devnet" });
    const events = new FiberEventClient({
      client,
      pollIntervalMs: config.pollIntervalMs ?? 1500,
      // Health is surfaced through /api/nodes and /api/alerts. Avoid noisy terminal logs
      // when a managed node is offline or still booting.
      onError: () => {},
    });
    return { id: node.id, client, events };
  });

  const sockets = new Set<WebSocket>();
  const broadcast = (message: unknown) => {
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  };

  for (const node of watched) {
    for (const type of EVENT_TYPES) {
      node.events.on(type, (event) => broadcast({ nodeId: node.id, event }));
    }
    node.events.start();
  }

  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  app.get("/api/nodes", async (_req, res) => {
    const results = await Promise.all(
      watched.map(async (node) => {
        try {
          const info = await node.client.info();
          return { id: node.id, healthy: true, ...projectNodeInfo(info) };
        } catch (err) {
          return { id: node.id, healthy: false, error: (err as Error).message };
        }
      }),
    );
    res.json(results);
  });

  app.get("/api/channels", async (_req, res) => {
    const results = await Promise.all(
      watched.map(async (node) => ({
        nodeId: node.id,
        channels: await node.client.listChannels({ includeClosed: true }).catch(() => []),
      })),
    );
    res.json(results);
  });

  app.get("/api/payments", async (_req, res) => {
    const results = await Promise.all(
      watched.map(async (node) => ({
        nodeId: node.id,
        payments: await node.client.listPayments({ limit: 50 }).catch(() => []),
      })),
    );
    res.json(results);
  });

  app.get("/api/alerts", async (_req, res) => {
    const results = await Promise.all(watched.map((node) => collectAlerts(node)));
    res.json(results.flat());
  });

  const port = config.port ?? 3030;
  const host = config.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port,
    host,
    stop: () => {
      for (const node of watched) node.events.stop();
      wss.close();
      server.close();
    },
  };
}

async function collectAlerts(node: WatchedNode): Promise<Alert[]> {
  try {
    const [info, peers, channels, payments] = await Promise.all([
      node.client.info(),
      node.client.listPeers().catch(() => []),
      node.client.listChannels({ includeClosed: true }).catch(() => []),
      node.client.listPayments({ limit: 50 }).catch(() => []),
    ]);
    return evaluateAlerts({ nodeId: node.id, node: info, peers, channels, payments });
  } catch (err) {
    return evaluateAlerts({ nodeId: node.id, nodeError: err });
  }
}

function projectNodeInfo(info: NodeInfo) {
  const fundingLock = info.default_funding_lock_script;
  return {
    version: info.version,
    pubkey: info.pubkey,
    peerAddresses: info.addresses,
    nodeName: info.node_name,
    peersCount: Number(BigInt(info.peers_count)),
    channelCount: Number(BigInt(info.channel_count)),
    fundingLock,
    walletAddress: deriveCkbAddresses(fundingLock),
  };
}

const SECP256K1_BLAKE160_CODE_HASH = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function deriveCkbAddresses(script: NodeInfo["default_funding_lock_script"]): { testnet: string; mainnet: string } | null {
  if (script.code_hash.toLowerCase() !== SECP256K1_BLAKE160_CODE_HASH) return null;
  const args = hexToBytes(script.args);
  if (args.length !== 20) return null;
  const shortPayload = [0x01, 0x00, ...args];
  return {
    testnet: bech32Encode("ckt", shortPayload),
    mainnet: bech32Encode("ckb", shortPayload),
  };
}

function hexToBytes(hex: string): number[] {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(normalized)) return [];
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(Number.parseInt(normalized.slice(i, i + 2), 16));
  }
  return bytes;
}

function bech32Encode(prefix: string, bytes: number[]): string {
  const words = convertBits(bytes, 8, 5, true);
  const checksum = bech32CreateChecksum(prefix, words);
  return `${prefix}1${[...words, ...checksum].map((value) => BECH32_CHARSET[value]).join("")}`;
}

function bech32CreateChecksum(prefix: string, words: number[]): number[] {
  const values = [...bech32HrpExpand(prefix), ...words, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(values) ^ 1;
  const checksum: number[] = [];
  for (let p = 0; p < 6; p += 1) {
    checksum.push((mod >> (5 * (5 - p))) & 31);
  }
  return checksum;
}

function bech32HrpExpand(prefix: string): number[] {
  const values: number[] = [];
  for (let i = 0; i < prefix.length; i += 1) values.push(prefix.charCodeAt(i) >> 5);
  values.push(0);
  for (let i = 0; i < prefix.length; i += 1) values.push(prefix.charCodeAt(i) & 31);
  return values;
}

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= generators[i];
    }
  }
  return chk;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}
