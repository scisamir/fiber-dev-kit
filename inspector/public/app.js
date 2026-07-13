const state = { nodes: [], channels: [], alerts: [], payments: [], lastSignal: "quiet" };

function shannonToCkb(hex) {
  return Number(BigInt(hex ?? "0x0")) / 1e8;
}

function fmtCkb(hex) {
  const value = shannonToCkb(hex);
  return `${Number.isInteger(value) ? value : value.toFixed(4)} CKB`;
}

function shortHash(value, size = 10) {
  if (!value) return "unknown";
  return value.length > size * 2 ? `${value.slice(0, size)}…${value.slice(-6)}` : value;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function byId(id) {
  return document.getElementById(id);
}

function button(className, text) {
  const node = document.createElement("button");
  node.type = "button";
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function loadAll() {
  const [nodes, channels, alerts, payments] = await Promise.all([
    fetchJson("/api/nodes"),
    fetchJson("/api/channels"),
    fetchJson("/api/alerts"),
    fetchJson("/api/payments"),
  ]);
  state.nodes = nodes;
  state.channels = channels;
  state.alerts = alerts;
  state.payments = payments;
  renderAll();
}

function renderAll() {
  renderSummary();
  renderTopology();
  renderNodes();
  renderChannels();
  renderAlerts();
  renderPayments();
  byId("last-updated").textContent = `updated ${new Date().toLocaleTimeString()}`;
}

function flattenChannels() {
  return state.channels.flatMap(({ nodeId, channels }) => channels.map((channel) => ({ nodeId, ...channel })));
}

function flattenPayments() {
  return state.payments.flatMap(({ nodeId, payments }) => payments.map((payment) => ({ nodeId, ...payment })));
}

function renderSummary() {
  const healthyNodes = state.nodes.filter((node) => node.healthy).length;
  const totalNodes = state.nodes.length;
  const totalPeers = state.nodes.reduce((sum, node) => sum + (node.peersCount ?? 0), 0);
  const channels = flattenChannels();
  const readyChannels = channels.filter((channel) => channel.state?.state_name === "ChannelReady").length;
  const payments = flattenPayments();
  const failedPayments = payments.filter((payment) => payment.status === "Failed").length;
  const criticalAlerts = state.alerts.filter((alert) => alert.severity === "critical").length;
  const unhealthyNodes = totalNodes - healthyNodes;

  byId("metric-health").textContent = `${healthyNodes}/${totalNodes || 0} online`;
  byId("metric-peers").textContent = `${totalPeers} peers`;
  byId("metric-channels").textContent = `${readyChannels}/${channels.length} ready`;
  byId("metric-payments").textContent = `${payments.length} payments`;
  byId("metric-alerts").textContent = criticalAlerts > 0 ? `${criticalAlerts} critical` : `${state.alerts.length} alerts`;

  byId("nodes-count").textContent = `${totalNodes} ${totalNodes === 1 ? "node" : "nodes"}`;
  byId("channels-count").textContent = `${channels.length} ${channels.length === 1 ? "channel" : "channels"}`;
  byId("alerts-count").textContent = `${state.alerts.length} active`;
  byId("payments-count").textContent = `${payments.length} recent${failedPayments ? `, ${failedPayments} failed` : ""}`;

  const signal = criticalAlerts > 0 || unhealthyNodes > 0 ? "attention" : state.alerts.length > 0 ? "warning" : "quiet";
  setBeacon(signal);
}

function setBeacon(signal) {
  const beacon = byId("event-beacon");
  const shouldPulse = state.lastSignal !== signal && signal !== "quiet";
  beacon.className = `event-beacon event-${signal}`;
  if (shouldPulse) {
    void beacon.offsetWidth;
    beacon.classList.add("pulse");
  }
  state.lastSignal = signal;
  beacon.textContent = signal;
}

function renderTopology() {
  const container = byId("topology-map");
  const nodes = [...state.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const channels = flattenChannels();

  if (nodes.length === 0) {
    container.innerHTML = "";
    container.appendChild(emptyState("No managed nodes found.", "Start nodes with `fiber start --nodes 2`."));
    return;
  }

  const width = 940;
  const height = 330;
  const positions = layoutNodes(nodes, width, height);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Fiber node topology");

  const channelEdges = channelTopologyEdges(channels, nodes, positions);
  for (const edge of channelEdges) {
    svg.appendChild(svgLine(edge.from.x, edge.from.y, edge.to.x, edge.to.y, edge.ready ? "edge edge-ready" : "edge edge-pending"));
    const label = svgText((edge.from.x + edge.to.x) / 2, (edge.from.y + edge.to.y) / 2 - 9, edge.label, "edge-label");
    svg.appendChild(label);
  }

  if (channelEdges.length === 0 && nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const from = positions.get(nodes[i].id);
      const to = positions.get(nodes[i + 1].id);
      svg.appendChild(svgLine(from.x, from.y, to.x, to.y, "edge edge-muted"));
    }
  }

  for (const node of nodes) {
    const point = positions.get(node.id);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", `topology-node ${node.healthy ? "node-online" : "node-offline"}`);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", topologyNodeSummary(node, channels));
    group.appendChild(svgTitle(topologyNodeSummary(node, channels)));
    group.appendChild(svgCircle(point.x, point.y, node.healthy ? 10 : 11, node.healthy ? "node-dot" : "node-dot node-dot-alert"));
    group.appendChild(svgText(point.x, point.y + 27, node.id, "node-label"));
    group.appendChild(svgText(point.x, point.y + 43, node.healthy ? `${node.peersCount}p ${node.channelCount}c` : "offline", "node-meta"));
    group.appendChild(svgNodeHoverCard(node, channels, point, width, height));
    svg.appendChild(group);
  }

  container.innerHTML = "";
  container.appendChild(svg);
}

function topologyNodeSummary(node, channels) {
  const nodeChannels = channels.filter((channel) => channel.nodeId === node.id);
  const ready = nodeChannels.filter((channel) => channel.state?.state_name === "ChannelReady").length;
  const totalLocal = nodeChannels.reduce((sum, channel) => sum + shannonToCkb(channel.local_balance), 0);
  const status = node.healthy ? "online" : "offline";
  return `${node.id}: ${status}, ${node.peersCount ?? 0} peers, ${ready}/${nodeChannels.length} ready channels, ${formatCompact(totalLocal)} CKB local`;
}

function svgNodeHoverCard(node, channels, point, width, height) {
  const nodeChannels = channels.filter((channel) => channel.nodeId === node.id);
  const ready = nodeChannels.filter((channel) => channel.state?.state_name === "ChannelReady").length;
  const local = nodeChannels.reduce((sum, channel) => sum + shannonToCkb(channel.local_balance), 0);
  const remote = nodeChannels.reduce((sum, channel) => sum + shannonToCkb(channel.remote_balance), 0);
  const rows = [
    [`status`, node.healthy ? "online" : "offline"],
    [`version`, node.healthy ? node.version ?? "unknown" : "unreachable"],
    [`peers`, String(node.peersCount ?? 0)],
    [`channels`, `${ready}/${nodeChannels.length} ready`],
    [`local`, `${formatCompact(local)} CKB`],
    [`remote`, `${formatCompact(remote)} CKB`],
  ];
  if (node.pubkey) rows.push(["pubkey", shortHash(node.pubkey, 8)]);
  if (node.walletAddress?.testnet) rows.push(["wallet", shortHash(node.walletAddress.testnet, 8)]);
  if (!node.healthy && node.error) rows.push(["error", shortHash(node.error, 24)]);

  const cardWidth = 226;
  const cardHeight = 56 + rows.length * 17;
  const x = Math.max(14, Math.min(width - cardWidth - 14, point.x + 20));
  const y = Math.max(14, Math.min(height - cardHeight - 14, point.y - cardHeight / 2));
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "node-hover-card");

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(cardWidth));
  rect.setAttribute("height", String(cardHeight));
  rect.setAttribute("rx", "12");
  rect.setAttribute("class", "node-hover-bg");
  group.appendChild(rect);

  group.appendChild(svgText(x + 16, y + 25, `node ${node.id}`, "node-hover-title"));
  rows.forEach(([label, value], index) => {
    const rowY = y + 52 + index * 17;
    group.appendChild(svgText(x + 16, rowY, label, "node-hover-key"));
    group.appendChild(svgText(x + cardWidth - 16, rowY, value, "node-hover-value"));
  });

  return group;
}

function layoutNodes(nodes, width, height) {
  const positions = new Map();
  const count = nodes.length;
  if (count === 1) {
    positions.set(nodes[0].id, { x: width / 2, y: height / 2 });
    return positions;
  }

  const marginX = 72;
  const usable = width - marginX * 2;
  nodes.forEach((node, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const x = marginX + usable * t;
    const y = height / 2 + Math.sin(index * 1.35) * 74 + (index % 2 === 0 ? -10 : 10);
    positions.set(node.id, { x, y });
  });
  return positions;
}

function channelTopologyEdges(channels, nodes, positions) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = [];
  for (const channel of channels) {
    const from = positions.get(channel.nodeId);
    if (!from) continue;
    const peerNode = nodes.find((node) => node.pubkey && channel.peer_id && normalizePubkey(node.pubkey) === normalizePubkey(channel.peer_id));
    const to = peerNode ? positions.get(peerNode.id) : inferredPeerPoint(from, edges.length);
    const local = shannonToCkb(channel.local_balance);
    const remote = shannonToCkb(channel.remote_balance);
    const label = `${formatCompact(local + remote)}`;
    edges.push({
      from,
      to,
      label,
      ready: channel.state?.state_name === "ChannelReady",
    });
  }
  return edges;
}

function inferredPeerPoint(from, index) {
  const direction = index % 2 === 0 ? 1 : -1;
  return { x: Math.max(34, Math.min(906, from.x + 120 * direction)), y: Math.max(40, Math.min(290, from.y + 65)) };
}

function normalizePubkey(value) {
  return String(value || "").replace(/^0x/, "").toLowerCase();
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "?";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

function svgLine(x1, y1, x2, y2, className) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("class", className);
  return line;
}

function svgCircle(cx, cy, r, className) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(r));
  circle.setAttribute("class", className);
  return circle;
}

function svgText(x, y, text, className) {
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", String(x));
  label.setAttribute("y", String(y));
  label.setAttribute("class", className);
  label.textContent = text;
  return label;
}

function svgTitle(text) {
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = text;
  return title;
}

function renderNodes() {
  const container = byId("nodes-list");
  container.innerHTML = "";

  for (const node of state.nodes) {
    const row = el("article", `result-row node-row ${node.healthy ? "is-pass" : "is-fail"}`);
    row.appendChild(el("span", "status-rail"));

    const main = el("div", "result-main");
    const title = el("div", "result-title");
    title.appendChild(el("span", `dot ${node.healthy ? "dot-green" : "dot-red"}`));
    title.appendChild(el("strong", null, node.id));
    title.appendChild(el("span", `badge ${node.healthy ? "badge-pass" : "badge-fail"}`, node.healthy ? "online" : "offline"));
    main.appendChild(title);

    const meta = el("div", "result-meta");
    meta.appendChild(el("span", null, node.healthy ? `v${node.version}` : node.error));
    if (node.healthy) {
      meta.appendChild(el("span", null, `${node.peersCount} peers`));
      meta.appendChild(el("span", null, `${node.channelCount} channels`));
      if (node.nodeName) meta.appendChild(el("span", null, node.nodeName));
      if (node.pubkey) meta.appendChild(el("span", null, shortHash(node.pubkey, 9)));
    }
    main.appendChild(meta);

    if (node.walletAddress?.testnet) {
      main.appendChild(addressBlock("testnet wallet", node.walletAddress.testnet));
      if (node.walletAddress.mainnet) {
        main.appendChild(addressBlock("mainnet wallet", node.walletAddress.mainnet, true));
      }
    } else if (node.fundingLock?.args) {
      main.appendChild(addressBlock("funding lock arg", node.fundingLock.args, true));
    }

    row.appendChild(main);
    container.appendChild(row);
  }

  if (state.nodes.length === 0) {
    container.appendChild(emptyState("No nodes configured."));
  }
}

function addressBlock(label, value, compact = false) {
  const wrapper = el("div", compact ? "address-row address-row-compact" : "address-row");
  const content = el("div", "address-content");
  content.appendChild(el("span", "address-label", label));
  content.appendChild(el("code", "address-value", value));
  const copy = button("copy-button", "copy");
  copy.addEventListener("click", async () => {
    const ok = await copyText(value);
    copy.textContent = ok ? "copied" : "failed";
    setTimeout(() => {
      copy.textContent = "copy";
    }, 1200);
  });
  wrapper.appendChild(content);
  wrapper.appendChild(copy);
  return wrapper;
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function renderChannels() {
  const container = byId("channels-list");
  container.innerHTML = "";
  const channels = flattenChannels();

  for (const channel of channels) {
    const stateName = channel.state?.state_name ?? "Unknown";
    const ready = stateName === "ChannelReady";
    const closed = stateName === "Closed";
    const row = el("article", `result-row channel-row ${ready ? "is-pass" : closed ? "is-fail" : "is-warn"}`);
    row.appendChild(el("span", "status-rail"));

    const main = el("div", "result-main");
    const title = el("div", "result-title");
    title.appendChild(el("span", `badge ${ready ? "badge-pass" : closed ? "badge-fail" : "badge-warn"}`, stateName));
    title.appendChild(el("strong", null, `${channel.nodeId} · ${shortHash(channel.channel_id)}`));
    main.appendChild(title);

    const meta = el("div", "result-meta");
    meta.appendChild(el("span", null, `local ${fmtCkb(channel.local_balance)}`));
    meta.appendChild(el("span", null, `remote ${fmtCkb(channel.remote_balance)}`));
    if (channel.peer_id) meta.appendChild(el("span", null, `peer ${shortHash(channel.peer_id, 8)}`));
    main.appendChild(meta);
    row.appendChild(main);
    container.appendChild(row);
  }

  if (channels.length === 0) {
    container.appendChild(emptyState("No channels yet."));
  }
}

function renderAlerts() {
  const container = byId("alerts-list");
  container.innerHTML = "";

  for (const alert of state.alerts) {
    const severityClass = alert.severity === "critical" ? "is-fail" : alert.severity === "warning" ? "is-warn" : "is-info";
    const row = el("article", `result-row alert-row ${severityClass}`);
    row.appendChild(el("span", "status-rail"));

    const main = el("div", "result-main");
    const title = el("div", "result-title");
    title.appendChild(el("span", `badge badge-${alert.severity}`, alert.severity));
    title.appendChild(el("strong", null, `${alert.nodeId ?? "node"} · ${alert.code}`));
    main.appendChild(title);
    main.appendChild(el("p", "result-copy", alert.summary));
    main.appendChild(el("p", "result-suggestion", alert.suggestion));
    row.appendChild(main);
    container.appendChild(row);
  }

  if (state.alerts.length === 0) {
    container.appendChild(emptyState("No active alerts.", "All watched nodes are within the current alert rules."));
  }
}

function renderPaymentRow(payment, diagnosis) {
  const status = payment.status ?? "Unknown";
  const row = el(
    "article",
    `result-row payment-row ${status === "Success" ? "is-pass" : status === "Failed" ? "is-fail" : "is-warn"}`,
  );
  row.appendChild(el("span", "status-rail"));

  const main = el("div", "result-main");
  const title = el("div", "result-title");
  title.appendChild(el("span", `badge status-${status}`, status));
  title.appendChild(el("strong", null, `${payment.nodeId} · ${shortHash(payment.payment_hash, 12)}`));
  title.appendChild(el("span", "mono subtle", `${fmtCkb(payment.fee)} fee`));
  main.appendChild(title);

  const meta = el("div", "result-meta");
  meta.appendChild(el("span", null, `created ${fromHexTime(payment.created_at)}`));
  if (payment.last_updated_at) meta.appendChild(el("span", null, `updated ${fromHexTime(payment.last_updated_at)}`));
  main.appendChild(meta);

  if (status === "Failed" && diagnosis) {
    const note = el("div", "diagnosis");
    note.appendChild(el("strong", "diagnosis-summary", diagnosis.summary));
    note.appendChild(el("span", "diagnosis-suggestion", diagnosis.suggestion));
    main.appendChild(note);
  }

  row.appendChild(main);
  return row;
}

function renderPayments() {
  const container = byId("payments-list");
  container.innerHTML = "";
  const all = flattenPayments().sort((a, b) => Number(BigInt(b.created_at ?? "0x0")) - Number(BigInt(a.created_at ?? "0x0")));

  for (const payment of all) {
    container.appendChild(renderPaymentRow(payment, null));
  }

  if (all.length === 0) {
    container.appendChild(emptyState("No payments yet.", "Payment attempts will appear here as the node reports them."));
  }
}

function prependPayment(nodeId, payment, diagnosis) {
  const container = byId("payments-list");
  const empty = container.querySelector(".empty-state");
  if (empty) empty.remove();
  container.prepend(renderPaymentRow({ nodeId, ...payment }, diagnosis));
  loadAll();
}

function emptyState(title, detail = "") {
  const node = el("div", "empty-state");
  node.appendChild(el("strong", null, title));
  if (detail) node.appendChild(el("span", null, detail));
  return node;
}

function fromHexTime(hex) {
  if (!hex) return "unknown";
  const value = Number(BigInt(hex));
  if (!Number.isFinite(value) || value <= 0) return "unknown";
  const millis = value < 10_000_000_000 ? value * 1000 : value;
  return new Date(millis).toLocaleTimeString();
}

function setWsStatus(text, className) {
  const status = byId("ws-status");
  status.textContent = text;
  status.className = `pill ${className}`;
}

function connectWebSocket() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener("open", () => setWsStatus("live", "pill-green"));
  ws.addEventListener("error", () => ws.close());
  ws.addEventListener("close", () => {
    setWsStatus("disconnected", "pill-red");
    setTimeout(connectWebSocket, 2000);
  });

  ws.addEventListener("message", (message) => {
    const { nodeId, event } = JSON.parse(message.data);
    if (event.type.startsWith("payment.")) {
      prependPayment(nodeId, event.payment, event.diagnosis ?? null);
    } else if (event.type.startsWith("channel.")) {
      loadAll();
    }
  });
}

loadAll();
connectWebSocket();
setInterval(loadAll, 15000);
