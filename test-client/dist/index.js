// src/test-client.ts
import { FiberClient, FiberEventClient, diagnose, diagnosePayment, FiberError, shannonHexToCkb } from "@fiber-dev-kit/core";

// src/poller.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function pollUntilResolved(fetchValue, isResolved, options = {}) {
  const intervalMs = options.intervalMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 1e4;
  const deadline = Date.now() + timeoutMs;
  let value = await fetchValue();
  while (!isResolved(value)) {
    if (Date.now() >= deadline) {
      throw new Error(`pollUntilResolved: condition not met within ${timeoutMs}ms`);
    }
    await sleep(intervalMs);
    value = await fetchValue();
  }
  return value;
}

// src/test-client.ts
var TERMINAL_PAYMENT_STATUSES = /* @__PURE__ */ new Set(["Success", "Failed"]);
var FiberTestClient = class {
  rpc;
  events;
  pollIntervalMs;
  timeoutMs;
  constructor(config) {
    if (config.network === "mainnet") {
      throw new Error('FiberTestClient refuses network: "mainnet" \u2014 it exists for devnet/testnet testing only.');
    }
    this.pollIntervalMs = config.pollIntervalMs ?? 500;
    this.timeoutMs = config.timeoutMs ?? 1e4;
    this.rpc = new FiberClient({ nodeUrl: config.nodeUrl, network: config.network ?? "devnet" });
    this.events = new FiberEventClient({ client: this.rpc, pollIntervalMs: this.pollIntervalMs });
  }
  /** Pays an invoice, or keysends directly to a pubkey with an explicit amount. */
  pay(params) {
    if ("invoice" in params) {
      return this.rpc.payInvoice(params.invoice);
    }
    return this.rpc.sendPayment({ targetPubkey: params.to, amount: params.amount, keysend: true });
  }
  /** Dry-runs a payment to check routability/fees without sending. Returns `null` if it wouldn't succeed. */
  async canPay(params) {
    try {
      if ("invoice" in params) {
        return await this.rpc.sendPayment({ invoice: params.invoice, dryRun: true });
      }
      return await this.rpc.sendPayment({ targetPubkey: params.to, amount: params.amount, keysend: true, dryRun: true });
    } catch {
      return null;
    }
  }
  /**
   * Produces a small route-confidence report from local health signals plus FNN's dry-run
   * payment result. It is a practical preflight check, not a full network graph score.
   */
  async routeConfidence(params) {
    const reasons = [];
    const suggestions = [];
    let score = 100;
    const [peers, channels] = await Promise.all([
      this.rpc.listPeers().catch(() => []),
      this.rpc.listChannels({ includeClosed: true }).catch(() => [])
    ]);
    const readyChannels = channels.filter((channel) => channel.state.state_name === "ChannelReady");
    if (peers.length === 0) {
      score -= 30;
      reasons.push("Node has no connected peers.");
      suggestions.push("Connect to at least one reachable peer before testing routed payments.");
    }
    if (readyChannels.length === 0) {
      score -= 40;
      reasons.push("Node has no ChannelReady channels.");
      suggestions.push("Open a channel and wait for ChannelReady before sending payments.");
    }
    if ("to" in params) {
      score = applyKeysendLiquiditySignal(score, params, readyChannels, reasons, suggestions);
    }
    let dryRunPayment = null;
    let diagnosis = null;
    try {
      dryRunPayment = "invoice" in params ? await this.rpc.sendPayment({ invoice: params.invoice, dryRun: true }) : await this.rpc.sendPayment({ targetPubkey: params.to, amount: params.amount, keysend: true, dryRun: true });
      reasons.push("FNN dry-run accepted the payment.");
      score = Math.max(score, 90);
    } catch (err) {
      score = Math.min(score - 30, 40);
      if (FiberError.is(err)) {
        diagnosis = diagnose(err);
        reasons.push(diagnosis.summary);
        suggestions.push(diagnosis.suggestion);
      } else {
        reasons.push(`Dry-run failed: ${err.message}`);
        suggestions.push("Inspect the thrown error and retry after correcting the route or invoice.");
      }
    }
    const normalizedScore = Math.max(0, Math.min(100, score));
    return {
      canPay: dryRunPayment !== null,
      score: normalizedScore,
      level: confidenceLevel(normalizedScore),
      reasons,
      suggestions: [...new Set(suggestions)],
      dryRunPayment,
      diagnosis
    };
  }
  waitForPayment(paymentHash) {
    return pollUntilResolved(
      () => this.rpc.getPayment(paymentHash),
      (payment) => TERMINAL_PAYMENT_STATUSES.has(payment.status),
      { intervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs }
    );
  }
  async assertPaid(paymentHash) {
    const payment = await this.waitForPayment(paymentHash);
    if (payment.status !== "Success") {
      const diagnosis = diagnosePayment(payment);
      throw new Error(
        `Expected payment ${paymentHash} to succeed, got status "${payment.status}"` + (diagnosis ? ` \u2014 ${diagnosis.summary} (${diagnosis.suggestion})` : "")
      );
    }
    return payment;
  }
  async assertFailed(paymentHash) {
    const payment = await this.waitForPayment(paymentHash);
    if (payment.status !== "Failed") {
      throw new Error(`Expected payment ${paymentHash} to fail, got status "${payment.status}"`);
    }
    return payment;
  }
  /** Asserts a payment failed for a specific, structured reason (see `diagnose()` in core). */
  async assertError(paymentHash, expectedCode) {
    const payment = await this.assertFailed(paymentHash);
    const diagnosis = diagnosePayment(payment);
    if (!diagnosis) {
      throw new Error(
        `Payment ${paymentHash} failed, but FNN reported no failure reason (failed_error was empty) \u2014 cannot verify it matches "${expectedCode}".`
      );
    }
    if (diagnosis.code !== expectedCode) {
      throw new Error(
        `Expected payment ${paymentHash} to fail with "${expectedCode}", got "${diagnosis.code}": ${diagnosis.summary}`
      );
    }
    return diagnosis;
  }
  async getChannelBalance(channelId) {
    const channels = await this.rpc.listChannels({ includeClosed: true });
    const channel = channels.find((c) => c.channel_id === channelId);
    if (!channel) {
      throw new Error(`getChannelBalance(): no channel with id ${channelId} found on this node.`);
    }
    return { local: shannonHexToCkb(channel.local_balance), remote: shannonHexToCkb(channel.remote_balance) };
  }
  /** Pays `to` repeatedly until this channel's outbound capacity is exhausted (minus 1 CKB for fees). */
  async drainChannel(channelId, to) {
    const { local } = await this.getChannelBalance(channelId);
    const amount = Math.floor(local) - 1;
    if (amount <= 0) return;
    const result = await this.pay({ to, amount });
    await this.waitForPayment(result.payment_hash);
  }
};
function applyKeysendLiquiditySignal(score, params, readyChannels, reasons, suggestions) {
  const candidateChannels = readyChannels.filter((channel) => !channel.peer_id || channel.peer_id === params.to);
  if (candidateChannels.length === 0) return score;
  const bestLocalBalance = Math.max(...candidateChannels.map((channel) => shannonHexToCkb(channel.local_balance)));
  if (bestLocalBalance < params.amount) {
    reasons.push(`Best matching channel has ${bestLocalBalance} CKB outbound balance, below the ${params.amount} CKB payment.`);
    suggestions.push("Reduce the payment amount, rebalance the channel, or open more outbound liquidity.");
    return score - 25;
  }
  reasons.push(`A ready channel has enough local balance for ${params.amount} CKB before fees.`);
  return score;
}
function confidenceLevel(score) {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

// src/network.ts
import { diagnose as diagnose2, diagnosePayment as diagnosePayment2, FiberError as FiberError2 } from "@fiber-dev-kit/core";
var FiberNetwork = class {
  clients = /* @__PURE__ */ new Map();
  pubkeys = /* @__PURE__ */ new Map();
  pollIntervalMs;
  timeoutMs;
  simulate;
  constructor(config) {
    this.pollIntervalMs = config.pollIntervalMs ?? 1e3;
    this.timeoutMs = config.timeoutMs ?? 6e4;
    for (const [alias, nodeConfig] of Object.entries(config.nodes)) {
      const resolved = typeof nodeConfig === "string" ? { nodeUrl: nodeConfig } : nodeConfig;
      this.clients.set(
        alias,
        new FiberTestClient({ ...resolved, pollIntervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs })
      );
    }
    this.simulate = new NetworkSimulations(this);
  }
  node(alias) {
    const client = this.clients.get(alias);
    if (!client) {
      throw new Error(`FiberNetwork: no node registered under alias "${alias}". Known aliases: ${[...this.clients.keys()].join(", ") || "(none)"}`);
    }
    return client;
  }
  /** Waits until every configured node's RPC is reachable. Does not start any process. */
  async start() {
    await Promise.all(
      [...this.clients.values()].map(
        (client) => pollUntilResolved(
          () => client.rpc.info().then(() => true, () => false),
          (ok) => ok,
          { intervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs }
        )
      )
    );
  }
  async pubkeyOf(alias) {
    let pubkey = this.pubkeys.get(alias);
    if (!pubkey) {
      const info = await this.node(alias).rpc.info();
      pubkey = info.pubkey;
      this.pubkeys.set(alias, pubkey);
    }
    return pubkey;
  }
  /** Connects `fromAlias` to `toAlias` by pubkey/address, unless already peered. */
  async connect(fromAlias, toAlias) {
    const from = this.node(fromAlias);
    const toInfo = await this.node(toAlias).rpc.info();
    const alreadyConnected = (await from.rpc.listPeers()).some((peer) => peer.pubkey === toInfo.pubkey);
    if (alreadyConnected) return;
    const address = toInfo.addresses[0];
    if (!address) {
      throw new Error(
        `connect(): node "${toAlias}" has no advertised address in info().addresses. It may not be listening publicly \u2014 connect it manually with a known multiaddr instead.`
      );
    }
    await from.rpc.connectPeer({ address });
  }
  /** Connects (if needed), opens a channel, and waits until it's `ChannelReady` on the funder's side. */
  async openChannel(fromAlias, toAlias, capacityCkb) {
    await this.connect(fromAlias, toAlias);
    const from = this.node(fromAlias);
    const toPubkey = await this.pubkeyOf(toAlias);
    await from.rpc.openChannel({ pubkey: toPubkey, fundingAmount: capacityCkb });
    const ready = await pollUntilResolved(
      () => from.rpc.listChannels({ pubkey: toPubkey }),
      (channels) => channels.some((c) => c.state.state_name === "ChannelReady"),
      { intervalMs: this.pollIntervalMs, timeoutMs: this.timeoutMs }
    );
    return ready.find((c) => c.state.state_name === "ChannelReady").channel_id;
  }
  /** Creates an invoice on `toAlias` and pays it from `fromAlias`. */
  async pay(fromAlias, toAlias, amountCkb, opts = {}) {
    const to = this.node(toAlias);
    const from = this.node(fromAlias);
    const { invoice_address } = await to.rpc.createInvoice({
      amount: amountCkb,
      description: opts.description ?? `${fromAlias} -> ${toAlias}`
    });
    return from.pay({ invoice: invoice_address });
  }
};
var NetworkSimulations = class {
  constructor(network) {
    this.network = network;
  }
  network;
  /** Drains `channelId`'s outbound capacity from `fromAlias`, then overpays past it. */
  async insufficientLiquidity(fromAlias, toAlias, channelId) {
    const from = this.network.node(fromAlias);
    const toPubkey = await this.network.pubkeyOf(toAlias);
    const { local } = await from.getChannelBalance(channelId);
    if (local > 1) {
      await from.drainChannel(channelId, toPubkey);
    }
    return this.attempt(() => this.network.pay(fromAlias, toAlias, local + 1));
  }
  /** Pays a node with no route to it (never connected, no channel path). */
  async unreachablePeer(fromAlias, targetAlias, amountCkb) {
    const from = this.network.node(fromAlias);
    const targetPubkey = await this.network.pubkeyOf(targetAlias);
    return this.attempt(() => from.pay({ to: targetPubkey, amount: amountCkb }));
  }
  /** Creates a 1-second-expiry invoice, waits it out, then tries to pay it. */
  async expiredInvoice(fromAlias, toAlias, amountCkb) {
    const to = this.network.node(toAlias);
    const from = this.network.node(fromAlias);
    const { invoice_address } = await to.rpc.createInvoice({
      amount: amountCkb,
      expiry: 1,
      description: "simulate.expiredInvoice"
    });
    await sleep(1500);
    return this.attempt(() => from.pay({ invoice: invoice_address }));
  }
  async attempt(send) {
    try {
      const payment = await send();
      return { payment, diagnosis: diagnosePayment2(payment) };
    } catch (err) {
      if (FiberError2.is(err)) {
        return { payment: null, diagnosis: diagnose2(err) };
      }
      throw err;
    }
  }
};

// src/terminal.ts
import { Chalk } from "chalk";
var DEFAULT_WIDTH = 72;
function formatRouteConfidenceReport(report, options = {}) {
  const out = new TerminalFormatter(options);
  out.section("Route Confidence");
  out.rows([
    ["Can pay", report.canPay ? "yes" : "no"],
    ["Score", `${report.score}/100`],
    ["Level", report.level],
    ["Dry-run", report.dryRunPayment ? `accepted (${report.dryRunPayment.status})` : "rejected"]
  ]);
  out.list("Reasons", report.reasons);
  out.list("Suggestions", report.suggestions);
  if (report.diagnosis) out.diagnosis(report.diagnosis);
  return out.toString();
}
function formatSimulationResult(title, result, options = {}) {
  const out = new TerminalFormatter(options);
  out.section(title);
  out.status(result.payment ? "INFO" : "FAIL", result.payment ? "Payment attempt returned a payment record." : "Payment attempt failed before submission.");
  if (result.payment) {
    out.rows([
      ["Payment", result.payment.payment_hash],
      ["Status", result.payment.status],
      ["Fee", result.payment.fee]
    ]);
  }
  if (result.diagnosis) out.diagnosis(result.diagnosis);
  return out.toString();
}
function formatDiagnosis(diagnosis, options = {}) {
  const out = new TerminalFormatter(options);
  out.diagnosis(diagnosis);
  return out.toString();
}
var TerminalFormatter = class {
  chalk;
  width;
  lines = [];
  constructor(options) {
    const color = options.color ?? Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
    this.chalk = new Chalk({ level: color ? 1 : 0 });
    this.width = options.width ?? DEFAULT_WIDTH;
  }
  section(title) {
    this.lines.push("");
    this.lines.push(this.chalk.bold(title));
    this.lines.push(this.chalk.dim("-".repeat(Math.min(title.length, this.width))));
  }
  status(kind, message) {
    this.lines.push(`  ${this.badge(kind)} ${message}`);
  }
  rows(rows, labelWidth = 14) {
    for (const [label, value] of rows) {
      this.lines.push(`  ${this.chalk.dim(label.padEnd(labelWidth))} ${value}`);
    }
  }
  list(title, items) {
    if (items.length === 0) return;
    this.lines.push("");
    this.lines.push(`  ${this.chalk.bold(title)}`);
    for (const item of items) {
      this.lines.push(`  - ${item}`);
    }
  }
  diagnosis(diagnosis) {
    this.lines.push("");
    this.lines.push(`  ${this.chalk.bold("Diagnosis")}`);
    this.rows(
      [
        ["Code", this.chalk.bold(diagnosis.code)],
        ["Summary", diagnosis.summary],
        ["Suggestion", diagnosis.suggestion]
      ],
      12
    );
  }
  toString() {
    return this.lines.join("\n");
  }
  badge(kind) {
    const text = `[${kind}]`;
    if (kind === "PASS") return this.chalk.green(text);
    if (kind === "FAIL") return this.chalk.red(text);
    if (kind === "SKIP") return this.chalk.yellow(text);
    return this.chalk.cyan(text);
  }
};

// src/index.ts
import { diagnose as diagnose3, diagnosePayment as diagnosePayment3, FiberError as FiberError3 } from "@fiber-dev-kit/core";
export {
  FiberError3 as FiberError,
  FiberNetwork,
  FiberTestClient,
  diagnose3 as diagnose,
  diagnosePayment3 as diagnosePayment,
  formatDiagnosis,
  formatRouteConfidenceReport,
  formatSimulationResult,
  pollUntilResolved,
  sleep
};
