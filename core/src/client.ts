import { FiberError } from "./errors";
import { ckbToShannonHex, toHex } from "./utils";
import type { HexString } from "./types/common";
import type {
  ConnectPeerParams,
  DisconnectPeerParams,
  NodeInfo,
  PeerInfo,
} from "./types/node";
import type {
  AbandonChannelParams,
  AcceptChannelParams,
  AcceptChannelResult,
  Channel,
  ListChannelsParams,
  OpenChannelParams,
  OpenChannelResult,
  ShutdownChannelParams,
  UpdateChannelParams,
} from "./types/channel";
import type {
  CancelInvoiceParams,
  CkbInvoice,
  GetInvoiceResult,
  InvoiceCurrency,
  NewInvoiceParams,
  NewInvoiceResult,
  SettleInvoiceParams,
} from "./types/invoice";
import type {
  GetPaymentParams,
  ListPaymentsParams,
  PaymentResult,
  SendPaymentParams,
} from "./types/payment";
import type { NetworkMode } from "./types/network";

export interface FiberClientConfig {
  /** RPC endpoint of the node, e.g. `http://127.0.0.1:8227`. */
  nodeUrl: string;
  /** Bearer token, if the node's RPC has auth enabled. */
  authToken?: string;
  /** Request timeout in ms. Default: 30000. */
  timeoutMs?: number;
  /** Currency used by `createInvoice`/`sendPayment` when not given explicitly. Default: `Fibt` (testnet). */
  defaultCurrency?: InvoiceCurrency;
  /**
   * Which network `nodeUrl` points at. Unset means "unknown" and no guard is applied — set
   * this to `"mainnet"` to get the write-guard below for free; it costs nothing on
   * devnet/testnet.
   */
  network?: NetworkMode;
  /**
   * Explicit opt-in to run fund-moving calls (`openChannel`, `acceptChannel`,
   * `abandonChannel`, `shutdownChannel`, `sendPayment`/`payInvoice`) when `network` is
   * `"mainnet"`. Default: false. This exists to catch the mistake that actually loses
   * money — a test/demo script pointed at the wrong `nodeUrl` — not to stop legitimate
   * mainnet wallets or merchant tooling from using this client; set it once, deliberately,
   * wherever real production traffic is intended.
   */
  allowMainnetWrites?: boolean;
}

/** Amount accepted by ergonomic methods: a human CKB amount, or an already-hex shannon amount. */
export type AmountLike = number | HexString;

function resolveAmount(amount: AmountLike): HexString {
  return typeof amount === "number" ? ckbToShannonHex(amount) : amount;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively rewrites camelCase object keys to snake_case for the wire, and hex-encodes
 * plain JS numbers. FNN's RPC rejects bare JSON integers for numeric fields that aren't
 * already-hex amounts — confirmed live via `list_payments`' `limit`: a bare integer threw
 * `invalid type: integer, expected a string`, and a plain decimal string threw `uint hex
 * string does not start with 0x`. Every non-amount numeric field FNN accepts turns out to
 * want the same `0x`-prefixed hex encoding as amounts, so this makes hex the default for
 * any raw `number` reaching the wire. Hex-string amounts are unaffected since
 * `resolveAmount()` already converts them to `HexString` before they reach this function.
 */
function toWireParams(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toWireParams);
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined) continue;
      result[camelToSnakeKey(key)] = toWireParams(val);
    }
    return result;
  }
  if (typeof value === "number") {
    return toHex(value);
  }
  return value;
}

/**
 * Ergonomic TypeScript client for the Fiber Network Node (FNN) JSON-RPC.
 *
 * ```ts
 * const fiber = new FiberClient("http://127.0.0.1:8227");
 * await fiber.info();
 * await fiber.connectPeer({ address: "/ip4/.../p2p/..." });
 * await fiber.openChannel({ pubkey, fundingAmount: 500 });
 * const { invoice_address } = await fiber.createInvoice({ amount: 10, description: "coffee" });
 * await fiber.payInvoice(invoice_address);
 * await fiber.listChannels();
 * ```
 */
export class FiberClient {
  private readonly nodeUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs: number;
  private readonly defaultCurrency: InvoiceCurrency;
  private readonly network?: NetworkMode;
  private readonly allowMainnetWrites: boolean;

  constructor(config: string | FiberClientConfig) {
    const resolved = typeof config === "string" ? { nodeUrl: config } : config;
    this.nodeUrl = resolved.nodeUrl;
    this.authToken = resolved.authToken;
    this.timeoutMs = resolved.timeoutMs ?? 30_000;
    this.defaultCurrency = resolved.defaultCurrency ?? "Fibt";
    this.network = resolved.network;
    this.allowMainnetWrites = resolved.allowMainnetWrites ?? false;
  }

  // ── Node ──────────────────────────────────────────────────

  info(): Promise<NodeInfo> {
    return this.call("node_info", []);
  }

  async listPeers(): Promise<PeerInfo[]> {
    const result = await this.call<{ peers: PeerInfo[] }>("list_peers", []);
    return result.peers;
  }

  async connectPeer(params: ConnectPeerParams): Promise<void> {
    await this.call("connect_peer", [toWireParams(params)]);
  }

  async disconnectPeer(params: DisconnectPeerParams | HexString): Promise<void> {
    const wire = typeof params === "string" ? { pubkey: params } : params;
    await this.call("disconnect_peer", [toWireParams(wire)]);
  }

  // ── Channels ──────────────────────────────────────────────

  openChannel(params: Omit<OpenChannelParams, "fundingAmount"> & { fundingAmount: AmountLike }): Promise<OpenChannelResult> {
    this.guardWriteOp("openChannel");
    return this.call("open_channel", [
      toWireParams({ ...params, fundingAmount: resolveAmount(params.fundingAmount) }),
    ]);
  }

  acceptChannel(
    params: Omit<AcceptChannelParams, "fundingAmount"> & { fundingAmount: AmountLike },
  ): Promise<AcceptChannelResult> {
    this.guardWriteOp("acceptChannel");
    return this.call("accept_channel", [
      toWireParams({ ...params, fundingAmount: resolveAmount(params.fundingAmount) }),
    ]);
  }

  async abandonChannel(params: AbandonChannelParams | HexString): Promise<void> {
    this.guardWriteOp("abandonChannel");
    const wire = typeof params === "string" ? { channelId: params } : params;
    await this.call("abandon_channel", [toWireParams(wire)]);
  }

  async listChannels(params: ListChannelsParams = {}): Promise<Channel[]> {
    const result = await this.call<{ channels: Channel[] }>("list_channels", [toWireParams(params)]);
    return result.channels;
  }

  async shutdownChannel(params: ShutdownChannelParams): Promise<void> {
    this.guardWriteOp("shutdownChannel");
    await this.call("shutdown_channel", [toWireParams(params)]);
  }

  async updateChannel(params: UpdateChannelParams): Promise<void> {
    await this.call("update_channel", [toWireParams(params)]);
  }

  // ── Invoices ──────────────────────────────────────────────

  createInvoice(
    params: Omit<NewInvoiceParams, "amount" | "currency"> & { amount: AmountLike; currency?: InvoiceCurrency },
  ): Promise<NewInvoiceResult> {
    return this.call("new_invoice", [
      toWireParams({
        ...params,
        amount: resolveAmount(params.amount),
        currency: params.currency ?? this.defaultCurrency,
      }),
    ]);
  }

  async parseInvoice(invoice: string): Promise<CkbInvoice> {
    const result = await this.call<{ invoice: CkbInvoice }>("parse_invoice", [{ invoice }]);
    return result.invoice;
  }

  getInvoice(paymentHash: HexString): Promise<GetInvoiceResult> {
    return this.call("get_invoice", [{ payment_hash: paymentHash }]);
  }

  async cancelInvoice(params: CancelInvoiceParams | HexString): Promise<void> {
    const wire = typeof params === "string" ? { paymentHash: params } : params;
    await this.call("cancel_invoice", [toWireParams(wire)]);
  }

  async settleInvoice(params: SettleInvoiceParams): Promise<void> {
    await this.call("settle_invoice", [toWireParams(params)]);
  }

  // ── Payments ──────────────────────────────────────────────

  sendPayment(params: Omit<SendPaymentParams, "amount"> & { amount?: AmountLike }): Promise<PaymentResult> {
    this.guardWriteOp("sendPayment");
    return this.call("send_payment", [
      toWireParams({
        ...params,
        amount: params.amount === undefined ? undefined : resolveAmount(params.amount),
      }),
    ]);
  }

  /** Convenience wrapper: pay an encoded invoice (as returned by `createInvoice`'s `invoice_address`). */
  payInvoice(invoice: string, opts: Omit<SendPaymentParams, "invoice" | "targetPubkey"> = {}): Promise<PaymentResult> {
    return this.sendPayment({ ...opts, invoice });
  }

  getPayment(params: GetPaymentParams | HexString): Promise<PaymentResult> {
    const wire = typeof params === "string" ? { paymentHash: params } : params;
    return this.call("get_payment", [toWireParams(wire)]);
  }

  async listPayments(params: ListPaymentsParams = {}): Promise<PaymentResult[]> {
    const result = await this.call<{ payments: PaymentResult[] }>("list_payments", [toWireParams(params)]);
    return result.payments;
  }

  // ── Internal ──────────────────────────────────────────────

  private guardWriteOp(method: string): void {
    if (this.network === "mainnet" && !this.allowMainnetWrites) {
      throw new FiberError(
        "MAINNET_WRITE_BLOCKED",
        `${method}() is blocked because this client is configured for network: "mainnet". ` +
          `If this is intentional production traffic, set allowMainnetWrites: true in the FiberClient config.`,
        { method },
      );
    }
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.nodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new FiberError("REQUEST_TIMEOUT", `RPC call to ${method} exceeded ${this.timeoutMs}ms`, { method });
      }
      throw new FiberError("NETWORK_ERROR", `Failed to reach ${this.nodeUrl}: ${(err as Error).message}`, {
        method,
        cause: err,
      });
    }

    if (!response.ok) {
      throw new FiberError("NETWORK_ERROR", `HTTP ${response.status} from ${this.nodeUrl}`, {
        method,
        status: response.status,
      });
    }

    let data: { result?: T; error?: { code: number; message: string; data?: unknown } };
    try {
      data = await response.json();
    } catch (err) {
      throw new FiberError("INVALID_RESPONSE", `Non-JSON response from ${this.nodeUrl}`, { method, cause: err });
    }

    if (data.error) {
      throw new FiberError("RPC_ERROR", data.error.message, {
        method,
        rpcCode: data.error.code,
        rpcData: data.error.data,
      });
    }

    return data.result as T;
  }
}
