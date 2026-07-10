#!/usr/bin/env node
import { evaluateAlerts, FiberClient, FiberError, diagnose } from "@fiber-dev-kit/core";
import { Chalk } from "chalk";
import { FiberNetwork, formatDiagnosis, formatRouteConfidenceReport } from "@fiber-dev-kit/test-client";

const nodes = {
  a: process.env.FIBER_NODE_A ?? "http://127.0.0.1:8227",
  b: process.env.FIBER_NODE_B ?? "http://127.0.0.1:8237",
};

const paymentAmountCkb = Number(process.env.FIBER_DEMO_AMOUNT_CKB ?? 1);
const forcePayment = process.argv.includes("--force-payment") || process.env.FIBER_FORCE_PAYMENT === "1";
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const chalk = new Chalk({ level: useColor ? 1 : 0 });

async function main() {
  printHeader("Fiber Dev Kit Demo");
  printRows([
    ["Node A", nodes.a],
    ["Node B", nodes.b],
    ["Amount", `${paymentAmountCkb} CKB`],
    ["Mode", forcePayment ? "force payment attempt" : "preflight first"],
  ]);

  const nodeA = await readNodeHealth("a", nodes.a);
  const nodeB = await readNodeHealth("b", nodes.b);
  printNodeHealth(nodeA);
  printNodeHealth(nodeB);

  printSection("Network Preflight");
  const network = new FiberNetwork({ nodes, pollIntervalMs: 500, timeoutMs: 15_000 });
  await network.start();
  printStatus("PASS", "Both RPC endpoints are reachable.");

  const recipient = await network.pubkeyOf("b");
  const confidence = await network.node("a").routeConfidence({ to: recipient, amount: paymentAmountCkb });
  console.log(formatRouteConfidenceReport(confidence, { color: useColor }));

  if (!confidence.canPay && !forcePayment) {
    printSection("Payment");
    printStatus("SKIP", "Payment was not sent because route confidence says it cannot route.");
    printBullets("Next steps", confidence.suggestions);
    console.log(`${indent(2)}${muted("Run `npm run demo -- --force-payment` to intentionally submit the payment and create a failed trace.")}`);
    return;
  }

  await runPayment(network);
}

async function runPayment(network) {
  printSection("Payment");
  try {
    const payment = await network.pay("a", "b", paymentAmountCkb, { description: "fiber-dev-kit demo" });
    printRows([
      ["Submitted", payment.payment_hash],
      ["Initial status", payment.status],
      ["Fee", `${payment.fee}`],
    ]);

    const settled = await network.node("a").assertPaid(payment.payment_hash);
    printStatus("PASS", `Payment reached ${settled.status}.`);
  } catch (err) {
    printStatus("FAIL", "Payment assertion failed.");
    if (FiberError.is(err)) {
      console.log(formatDiagnosis(diagnose(err), { color: useColor }));
    } else {
      printRows([["Error", err instanceof Error ? err.message : String(err)]]);
    }
  }
}

async function readNodeHealth(id, rpcUrl) {
  const client = new FiberClient({ nodeUrl: rpcUrl, network: "devnet" });
  try {
    const [node, peers, channels, payments] = await Promise.all([
      client.info(),
      client.listPeers().catch(() => []),
      client.listChannels({ includeClosed: true }).catch(() => []),
      client.listPayments({ limit: 10 }).catch(() => []),
    ]);
    const alerts = evaluateAlerts({ nodeId: id, node, peers, channels, payments });
    return { id, rpcUrl, reachable: true, node, peers, channels, payments, alerts };
  } catch (err) {
    const alerts = evaluateAlerts({ nodeId: id, nodeError: err });
    return { id, rpcUrl, reachable: false, error: err, alerts };
  }
}

function printNodeHealth(result) {
  printSection(`Node ${result.id.toUpperCase()} Health`);
  if (!result.reachable) {
    printStatus("FAIL", "RPC endpoint is unreachable.");
    printAlerts(result.alerts);
    return;
  }

  const readyChannels = result.channels.filter((channel) => channel.state.state_name === "ChannelReady");
  printRows([
    ["RPC", result.rpcUrl],
    ["Name", result.node.node_name ?? "(unnamed)"],
    ["Pubkey", result.node.pubkey],
    ["Version", result.node.version],
    ["Peers", String(result.peers.length)],
    ["Channels", `${result.channels.length} total, ${readyChannels.length} ready`],
    ["Recent payments", String(result.payments.length)],
  ]);

  if (result.channels.length > 0) {
    printSubhead("Channels");
    for (const channel of result.channels) {
      printRows(
        [
          ["ID", shortId(channel.channel_id)],
          ["State", channel.state.state_name],
          ["Balance", `local ${formatCkb(channel.local_balance)} / remote ${formatCkb(channel.remote_balance)}`],
        ],
        12,
      );
    }
  }

  printAlerts(result.alerts);
}

function printAlerts(alerts) {
  if (alerts.length === 0) {
    printStatus("PASS", "No active alerts.");
    return;
  }

  printSubhead("Alerts");
  for (const alert of alerts) {
    const label = alert.severity.toUpperCase();
    console.log(`${indent(2)}${badge(label, alert.severity)} ${strong(alert.code)} ${alert.summary}`);
    console.log(`${indent(6)}${muted(alert.suggestion)}`);
  }
}

function printHeader(title) {
  const line = "=".repeat(72);
  console.log(`\n${chalk.cyan(line)}`);
  console.log(chalk.bold(title));
  console.log(`${chalk.cyan(line)}\n`);
}

function printSection(title) {
  console.log(`\n${chalk.bold(title)}`);
  console.log(chalk.dim("-".repeat(title.length)));
}

function printSubhead(title) {
  console.log(`\n${indent(2)}${chalk.bold(title)}`);
}

function printRows(rows, labelWidth = 16) {
  for (const [label, value] of rows) {
    console.log(`${indent(2)}${muted(label.padEnd(labelWidth))} ${value}`);
  }
}

function printBullets(title, items) {
  if (!items || items.length === 0) return;
  printSubhead(title);
  for (const item of items) {
    console.log(`${indent(2)}- ${item}`);
  }
}

function printStatus(kind, message) {
  const severity = kind === "PASS" ? "info" : kind === "FAIL" ? "critical" : "warning";
  console.log(`${indent(2)}${badge(kind, severity)} ${message}`);
}

function badge(text, severity) {
  const value = `[${text}]`;
  if (severity === "critical") return chalk.red(value);
  if (severity === "warning") return chalk.yellow(value);
  return chalk.green(value);
}

function shortId(value) {
  return value && value.length > 18 ? `${value.slice(0, 16)}...` : value;
}

function formatCkb(hex) {
  return `${Number(BigInt(hex ?? "0x0")) / 100_000_000} CKB`;
}

function indent(size) {
  return " ".repeat(size);
}

function strong(value) {
  return chalk.bold(value);
}

function muted(value) {
  return chalk.dim(value);
}

main().catch((err) => {
  console.error("\nDemo failed unexpectedly");
  console.error(err);
  process.exit(1);
});
