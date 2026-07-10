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
/**
 * Serves the inspector dashboard: a static single-page UI, a small REST API projecting
 * `core`'s typed RPC results, and a WebSocket that re-broadcasts `FiberEventClient`'s
 * (polling-derived — see `core`'s `events.ts`) events to connected browsers.
 */
export declare function startInspector(config: InspectorConfig): Promise<InspectorHandle>;
