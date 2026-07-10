export type FiberErrorCode =
  | "NETWORK_ERROR" // fetch() failed or non-2xx HTTP status
  | "RPC_ERROR" // node returned a JSON-RPC error object
  | "INVALID_RESPONSE" // non-JSON or malformed response body
  | "REQUEST_TIMEOUT" // exceeded the client's timeoutMs
  | "MAINNET_WRITE_BLOCKED"; // fund-moving call on network: "mainnet" without allowMainnetWrites

export class FiberError extends Error {
  constructor(
    public readonly code: FiberErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FiberError";
  }

  static is(err: unknown): err is FiberError {
    return err instanceof FiberError;
  }
}
