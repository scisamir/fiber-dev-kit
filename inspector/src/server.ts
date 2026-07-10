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
  return {
    version: info.version,
    pubkey: info.pubkey,
    nodeName: info.node_name,
    peersCount: Number(BigInt(info.peers_count)),
    channelCount: Number(BigInt(info.channel_count)),
  };
}
