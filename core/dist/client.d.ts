import type { HexString } from "./types/common";
import type { ConnectPeerParams, DisconnectPeerParams, NodeInfo, PeerInfo } from "./types/node";
import type { AbandonChannelParams, AcceptChannelParams, AcceptChannelResult, Channel, ListChannelsParams, OpenChannelParams, OpenChannelResult, ShutdownChannelParams, UpdateChannelParams } from "./types/channel";
import type { CancelInvoiceParams, CkbInvoice, GetInvoiceResult, InvoiceCurrency, NewInvoiceParams, NewInvoiceResult, SettleInvoiceParams } from "./types/invoice";
import type { GetPaymentParams, ListPaymentsParams, PaymentResult, SendPaymentParams } from "./types/payment";
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
export declare class FiberClient {
    private readonly nodeUrl;
    private readonly authToken?;
    private readonly timeoutMs;
    private readonly defaultCurrency;
    private readonly network?;
    private readonly allowMainnetWrites;
    constructor(config: string | FiberClientConfig);
    info(): Promise<NodeInfo>;
    listPeers(): Promise<PeerInfo[]>;
    connectPeer(params: ConnectPeerParams): Promise<void>;
    disconnectPeer(params: DisconnectPeerParams | HexString): Promise<void>;
    openChannel(params: Omit<OpenChannelParams, "fundingAmount"> & {
        fundingAmount: AmountLike;
    }): Promise<OpenChannelResult>;
    acceptChannel(params: Omit<AcceptChannelParams, "fundingAmount"> & {
        fundingAmount: AmountLike;
    }): Promise<AcceptChannelResult>;
    abandonChannel(params: AbandonChannelParams | HexString): Promise<void>;
    listChannels(params?: ListChannelsParams): Promise<Channel[]>;
    shutdownChannel(params: ShutdownChannelParams): Promise<void>;
    updateChannel(params: UpdateChannelParams): Promise<void>;
    createInvoice(params: Omit<NewInvoiceParams, "amount" | "currency"> & {
        amount: AmountLike;
        currency?: InvoiceCurrency;
    }): Promise<NewInvoiceResult>;
    parseInvoice(invoice: string): Promise<CkbInvoice>;
    getInvoice(paymentHash: HexString): Promise<GetInvoiceResult>;
    cancelInvoice(params: CancelInvoiceParams | HexString): Promise<void>;
    settleInvoice(params: SettleInvoiceParams): Promise<void>;
    sendPayment(params: Omit<SendPaymentParams, "amount"> & {
        amount?: AmountLike;
    }): Promise<PaymentResult>;
    /** Convenience wrapper: pay an encoded invoice (as returned by `createInvoice`'s `invoice_address`). */
    payInvoice(invoice: string, opts?: Omit<SendPaymentParams, "invoice" | "targetPubkey">): Promise<PaymentResult>;
    getPayment(params: GetPaymentParams | HexString): Promise<PaymentResult>;
    listPayments(params?: ListPaymentsParams): Promise<PaymentResult[]>;
    private guardWriteOp;
    private call;
}
