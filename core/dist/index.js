// src/errors.ts
var FiberError = class _FiberError extends Error {
  constructor(code, message, context) {
    super(message);
    this.code = code;
    this.context = context;
    this.name = "FiberError";
  }
  code;
  context;
  static is(err) {
    return err instanceof _FiberError;
  }
};

// src/utils.ts
var SHANNONS_PER_CKB = 100000000n;
function ckbToShannonHex(ckb) {
  if (!Number.isFinite(ckb) || ckb < 0) {
    throw new RangeError(`ckbToShannonHex: amount must be a non-negative finite number, got ${ckb}`);
  }
  const shannons = BigInt(Math.round(ckb * Number(SHANNONS_PER_CKB)));
  return toHex(shannons);
}
function shannonHexToCkb(hex) {
  const shannons = fromHex(hex);
  return Number(shannons) / Number(SHANNONS_PER_CKB);
}
function formatAmount(hex, unit = "CKB") {
  if (unit === "shannon") {
    return `${fromHex(hex).toString()} shannon`;
  }
  return `${shannonHexToCkb(hex)} CKB`;
}
function toHex(value) {
  const big = typeof value === "bigint" ? value : BigInt(value);
  if (big < 0n) {
    throw new RangeError(`toHex: value must be non-negative, got ${big}`);
  }
  return `0x${big.toString(16)}`;
}
function fromHex(hex) {
  return BigInt(hex);
}

// src/client.ts
function resolveAmount(amount) {
  return typeof amount === "number" ? ckbToShannonHex(amount) : amount;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function camelToSnakeKey(key) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
function toWireParams(value) {
  if (Array.isArray(value)) {
    return value.map(toWireParams);
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === void 0) continue;
      result[camelToSnakeKey(key)] = toWireParams(val);
    }
    return result;
  }
  if (typeof value === "number") {
    return toHex(value);
  }
  return value;
}
var FiberClient = class {
  nodeUrl;
  authToken;
  timeoutMs;
  defaultCurrency;
  network;
  allowMainnetWrites;
  constructor(config) {
    const resolved = typeof config === "string" ? { nodeUrl: config } : config;
    this.nodeUrl = resolved.nodeUrl;
    this.authToken = resolved.authToken;
    this.timeoutMs = resolved.timeoutMs ?? 3e4;
    this.defaultCurrency = resolved.defaultCurrency ?? "Fibt";
    this.network = resolved.network;
    this.allowMainnetWrites = resolved.allowMainnetWrites ?? false;
  }
  // ── Node ──────────────────────────────────────────────────
  info() {
    return this.call("node_info", []);
  }
  async listPeers() {
    const result = await this.call("list_peers", []);
    return result.peers;
  }
  async connectPeer(params) {
    await this.call("connect_peer", [toWireParams(params)]);
  }
  async disconnectPeer(params) {
    const wire = typeof params === "string" ? { pubkey: params } : params;
    await this.call("disconnect_peer", [toWireParams(wire)]);
  }
  // ── Channels ──────────────────────────────────────────────
  openChannel(params) {
    this.guardWriteOp("openChannel");
    return this.call("open_channel", [
      toWireParams({ ...params, fundingAmount: resolveAmount(params.fundingAmount) })
    ]);
  }
  acceptChannel(params) {
    this.guardWriteOp("acceptChannel");
    return this.call("accept_channel", [
      toWireParams({ ...params, fundingAmount: resolveAmount(params.fundingAmount) })
    ]);
  }
  async abandonChannel(params) {
    this.guardWriteOp("abandonChannel");
    const wire = typeof params === "string" ? { channelId: params } : params;
    await this.call("abandon_channel", [toWireParams(wire)]);
  }
  async listChannels(params = {}) {
    const result = await this.call("list_channels", [toWireParams(params)]);
    return result.channels;
  }
  async shutdownChannel(params) {
    this.guardWriteOp("shutdownChannel");
    await this.call("shutdown_channel", [toWireParams(params)]);
  }
  async updateChannel(params) {
    await this.call("update_channel", [toWireParams(params)]);
  }
  // ── Invoices ──────────────────────────────────────────────
  createInvoice(params) {
    return this.call("new_invoice", [
      toWireParams({
        ...params,
        amount: resolveAmount(params.amount),
        currency: params.currency ?? this.defaultCurrency
      })
    ]);
  }
  async parseInvoice(invoice) {
    const result = await this.call("parse_invoice", [{ invoice }]);
    return result.invoice;
  }
  getInvoice(paymentHash) {
    return this.call("get_invoice", [{ payment_hash: paymentHash }]);
  }
  async cancelInvoice(params) {
    const wire = typeof params === "string" ? { paymentHash: params } : params;
    await this.call("cancel_invoice", [toWireParams(wire)]);
  }
  async settleInvoice(params) {
    await this.call("settle_invoice", [toWireParams(params)]);
  }
  // ── Payments ──────────────────────────────────────────────
  sendPayment(params) {
    this.guardWriteOp("sendPayment");
    return this.call("send_payment", [
      toWireParams({
        ...params,
        amount: params.amount === void 0 ? void 0 : resolveAmount(params.amount)
      })
    ]);
  }
  /** Convenience wrapper: pay an encoded invoice (as returned by `createInvoice`'s `invoice_address`). */
  payInvoice(invoice, opts = {}) {
    return this.sendPayment({ ...opts, invoice });
  }
  getPayment(params) {
    const wire = typeof params === "string" ? { paymentHash: params } : params;
    return this.call("get_payment", [toWireParams(wire)]);
  }
  async listPayments(params = {}) {
    const result = await this.call("list_payments", [toWireParams(params)]);
    return result.payments;
  }
  // ── Internal ──────────────────────────────────────────────
  guardWriteOp(method) {
    if (this.network === "mainnet" && !this.allowMainnetWrites) {
      throw new FiberError(
        "MAINNET_WRITE_BLOCKED",
        `${method}() is blocked because this client is configured for network: "mainnet". If this is intentional production traffic, set allowMainnetWrites: true in the FiberClient config.`,
        { method }
      );
    }
  }
  async call(method, params) {
    let response;
    try {
      response = await fetch(this.nodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new FiberError("REQUEST_TIMEOUT", `RPC call to ${method} exceeded ${this.timeoutMs}ms`, { method });
      }
      throw new FiberError("NETWORK_ERROR", `Failed to reach ${this.nodeUrl}: ${err.message}`, {
        method,
        cause: err
      });
    }
    if (!response.ok) {
      throw new FiberError("NETWORK_ERROR", `HTTP ${response.status} from ${this.nodeUrl}`, {
        method,
        status: response.status
      });
    }
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new FiberError("INVALID_RESPONSE", `Non-JSON response from ${this.nodeUrl}`, { method, cause: err });
    }
    if (data.error) {
      throw new FiberError("RPC_ERROR", data.error.message, {
        method,
        rpcCode: data.error.code,
        rpcData: data.error.data
      });
    }
    return data.result;
  }
};

// src/diagnostics.ts
var PATTERNS = [
  {
    code: "INSUFFICIENT_LIQUIDITY",
    test: /insufficient|liquidity|not enough balance|exceeds.*balance/i,
    summary: "The route has capacity in total, but not enough usable balance in the direction this payment needs to flow.",
    suggestion: "Reduce the payment amount, open a larger channel, or rebalance existing channels toward the recipient."
  },
  {
    code: "ROUTE_NOT_FOUND",
    test: /no route|route.*not found|routing.*fail|unable to find a route/i,
    summary: "No path could be found from this node to the target through the currently known network graph.",
    suggestion: "Confirm the target node has at least one public channel, or connect directly and open a channel to it."
  },
  {
    code: "PEER_NOT_CONNECTED",
    test: /peer.*not (found|connected)|not connected to peer/i,
    summary: "The RPC call targets a peer this node hasn't connected to yet.",
    suggestion: "Call connectPeer() with the peer's multiaddr or pubkey before retrying this operation."
  },
  {
    code: "PEER_UNREACHABLE",
    test: /connection refused|dial.*fail|unreachable|timed out.*connect/i,
    summary: "The node could not establish a network connection to the peer's address.",
    suggestion: "Check the peer's multiaddr/port and confirm it's online and reachable from this node."
  },
  {
    code: "INVOICE_EXPIRED",
    test: /invoice.*expired|expired.*invoice/i,
    summary: "The invoice's expiry window has passed.",
    suggestion: "Ask the recipient to generate a new invoice with createInvoice()."
  },
  {
    code: "INVOICE_ALREADY_PAID",
    test: /already paid|invoice.*paid/i,
    summary: "This invoice has already been settled.",
    suggestion: "No action needed \u2014 check getPayment()/getInvoice() for the existing settlement."
  },
  {
    code: "INVOICE_CANCELLED",
    test: /invoice.*cancel/i,
    summary: "This invoice was cancelled and can no longer be paid.",
    suggestion: "Ask the recipient to generate a new invoice."
  },
  {
    code: "INVALID_PARAMS",
    // "invalid pubkey '...': malformed public key" is a confirmed live FNN error string.
    test: /missing field|invalid params|invalid type|invalid \w+|malformed|expected/i,
    summary: "The RPC call was rejected because a parameter was missing, malformed, or the wrong type.",
    suggestion: "Inspect the error's context.rpcData for the exact field FNN rejected."
  }
];
function diagnose(error) {
  if (error.code === "REQUEST_TIMEOUT") {
    return {
      code: "TIMEOUT",
      summary: "The RPC call exceeded its timeout before the node responded.",
      suggestion: "Retry with a longer timeoutMs, or check whether the node is under heavy load."
    };
  }
  const haystack = `${error.message} ${JSON.stringify(error.context?.rpcData ?? "")}`;
  const match = PATTERNS.find((pattern) => pattern.test.test(haystack));
  if (match) {
    return { code: match.code, summary: match.summary, suggestion: match.suggestion };
  }
  return {
    code: "UNKNOWN",
    summary: error.message,
    suggestion: "No known pattern matched this error; inspect error.context for the raw RPC response."
  };
}
function diagnosePayment(payment) {
  if (payment.status !== "Failed" || !payment.failed_error) return null;
  return diagnose(new FiberError("RPC_ERROR", payment.failed_error));
}

// src/events.ts
var FiberEventClient = class {
  client;
  pollIntervalMs;
  onError;
  handlers = /* @__PURE__ */ new Map();
  timer = null;
  lastChannels = /* @__PURE__ */ new Map();
  lastPayments = /* @__PURE__ */ new Map();
  polling = false;
  constructor(config) {
    this.client = config.client;
    this.pollIntervalMs = config.pollIntervalMs ?? 1e3;
    this.onError = config.onError ?? (() => {
    });
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.pollIntervalMs);
    void this.poll();
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  /** Subscribes to an event type. Returns an unsubscribe function. */
  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, /* @__PURE__ */ new Set());
    }
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
  emit(event) {
    for (const handler of this.handlers.get(event.type) ?? []) {
      handler(event);
    }
  }
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      await Promise.all([this.pollChannels(), this.pollPayments()]);
    } catch (err) {
      this.onError(err);
    } finally {
      this.polling = false;
    }
  }
  async pollChannels() {
    const channels = await this.client.listChannels({ includeClosed: true });
    const seen = /* @__PURE__ */ new Set();
    for (const channel of channels) {
      seen.add(channel.channel_id);
      const previous = this.lastChannels.get(channel.channel_id);
      const state = channelStateName(channel);
      if (!previous) {
        this.emit({ type: "channel.opened", channel });
      } else if (channelStateName(previous) !== state) {
        this.emit({ type: state === "Closed" ? "channel.closed" : "channel.updated", channel });
      }
      this.lastChannels.set(channel.channel_id, channel);
    }
    for (const [id, channel] of this.lastChannels) {
      if (!seen.has(id)) {
        this.emit({ type: "channel.closed", channel });
        this.lastChannels.delete(id);
      }
    }
  }
  async pollPayments() {
    const payments = await this.client.listPayments({ limit: 50 });
    for (const payment of payments) {
      const previous = this.lastPayments.get(payment.payment_hash);
      if (!previous) {
        this.emit({ type: "payment.created", payment });
      } else if (previous.status !== payment.status) {
        this.emit({ type: "payment.updated", payment });
        if (payment.status === "Success") this.emit({ type: "payment.succeeded", payment });
        if (payment.status === "Failed") {
          this.emit({ type: "payment.failed", payment, diagnosis: diagnosePayment(payment) });
        }
      }
      this.lastPayments.set(payment.payment_hash, payment);
    }
  }
};
function channelStateName(channel) {
  return channel.state.state_name;
}

// src/alerts.ts
var DEFAULT_ALERT_RULES = {
  requirePeers: true,
  requireReadyChannels: true,
  minLocalBalanceCkb: 1,
  includeFailedPayments: true
};
function evaluateAlerts(snapshot, rules = {}) {
  const resolved = { ...DEFAULT_ALERT_RULES, ...rules };
  const alerts = [];
  const nodeId = snapshot.nodeId;
  if (snapshot.nodeError || !snapshot.node) {
    return [
      {
        code: "NODE_UNREACHABLE",
        severity: "critical",
        nodeId,
        summary: `Node${nodeId ? ` "${nodeId}"` : ""} is not reachable over RPC.`,
        suggestion: "Confirm the FNN process is running and that the RPC URL, port, and auth settings are correct."
      }
    ];
  }
  const peers = snapshot.peers ?? [];
  if (resolved.requirePeers && peers.length === 0 && fromHex(snapshot.node.peers_count) === 0n) {
    alerts.push({
      code: "ZERO_PEERS",
      severity: "warning",
      nodeId,
      summary: `Node${nodeId ? ` "${nodeId}"` : ""} has no connected peers.`,
      suggestion: "Connect at least one reachable Fiber peer before opening channels or testing routed payments."
    });
  }
  const channels = snapshot.channels ?? [];
  const readyChannels = channels.filter((channel) => channel.state.state_name === "ChannelReady");
  if (resolved.requireReadyChannels && readyChannels.length === 0) {
    alerts.push({
      code: "NO_READY_CHANNELS",
      severity: "warning",
      nodeId,
      summary: `Node${nodeId ? ` "${nodeId}"` : ""} has no ready channels.`,
      suggestion: "Open a channel and wait until it reaches ChannelReady before testing payments."
    });
  }
  for (const channel of readyChannels) {
    const localBalance = shannonHexToCkb(channel.local_balance);
    if (localBalance < resolved.minLocalBalanceCkb) {
      alerts.push({
        code: "LOW_LOCAL_BALANCE",
        severity: "warning",
        nodeId,
        channelId: channel.channel_id,
        summary: `Channel ${shortId(channel.channel_id)} has only ${localBalance} CKB of outbound balance.`,
        suggestion: "Rebalance the channel, reduce payment size, or open a channel with more local liquidity."
      });
    }
  }
  if (resolved.includeFailedPayments) {
    for (const payment of snapshot.payments ?? []) {
      if (payment.status !== "Failed") continue;
      const diagnosis = diagnosePayment(payment);
      alerts.push({
        code: "PAYMENT_FAILED",
        severity: "critical",
        nodeId,
        paymentHash: payment.payment_hash,
        diagnosis,
        summary: diagnosis?.summary ?? `Payment ${shortId(payment.payment_hash)} failed.`,
        suggestion: diagnosis?.suggestion ?? "Inspect the raw failed_error field and retry after correcting the route or invoice."
      });
    }
  }
  return alerts;
}
function shortId(value) {
  return value.length > 14 ? `${value.slice(0, 12)}...` : value;
}
export {
  FiberClient,
  FiberError,
  FiberEventClient,
  ckbToShannonHex,
  diagnose,
  diagnosePayment,
  evaluateAlerts,
  formatAmount,
  fromHex,
  shannonHexToCkb,
  toHex
};
