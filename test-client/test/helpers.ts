import { vi } from "vitest";

type RpcHandler = (params: unknown[]) => unknown | Promise<unknown>;
type NodeHandlers = Record<string, RpcHandler>;

interface RpcRequestBody {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

/**
 * Stubs the global `fetch` FiberClient calls through, routing JSON-RPC requests to
 * per-nodeUrl handler tables keyed by RPC method name (e.g. `"node_info"`, `"send_payment"`).
 * A handler that throws becomes a JSON-RPC error response, matching real FNN behavior.
 */
export function installMockFetch(nodesByUrl: Record<string, NodeHandlers>) {
  const fetchMock = vi.fn(async (url: unknown, init: RequestInit | undefined) => {
    const handlers = nodesByUrl[String(url)];
    if (!handlers) {
      throw new Error(`installMockFetch: no mock registered for url ${String(url)}`);
    }
    const body = JSON.parse(String(init?.body)) as RpcRequestBody;
    const handler = handlers[body.method];
    if (!handler) {
      return jsonResponse({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Method not found: ${body.method}` } });
    }
    try {
      const result = await handler(body.params);
      return jsonResponse({ jsonrpc: "2.0", id: body.id, result });
    } catch (err) {
      return jsonResponse({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: (err as Error).message } });
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
