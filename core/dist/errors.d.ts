export type FiberErrorCode = "NETWORK_ERROR" | "RPC_ERROR" | "INVALID_RESPONSE" | "REQUEST_TIMEOUT" | "MAINNET_WRITE_BLOCKED";
export declare class FiberError extends Error {
    readonly code: FiberErrorCode;
    readonly context?: Record<string, unknown> | undefined;
    constructor(code: FiberErrorCode, message: string, context?: Record<string, unknown> | undefined);
    static is(err: unknown): err is FiberError;
}
