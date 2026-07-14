#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const pkgRoot = path.resolve(__dirname, "..");
const defaultRpcHost = "127.0.0.1";
const defaultRpcPort = 8227;
const defaultRpcUrl = `http://${defaultRpcHost}:${defaultRpcPort}`;
const defaultPassword = "password";
const defaultConfigTemplate = "testnet.yml";
const runtimeDir = path.resolve(process.env.FIBER_HOME || path.join(os.homedir(), ".fiber-node"));
const rpcUrlFile = path.join(runtimeDir, "rpc-url");
const devkitDir = path.resolve(process.env.FIBER_DEV_KIT_HOME || path.join(os.homedir(), ".fiber-dev-kit"));
const devkitStatePath = path.join(devkitDir, "state.json");
const platformKey = `${process.platform}-${process.arch}`;
const ckbShannons = 100000000n;
const defaultCkbRpcUrl = "https://testnet.ckbapp.dev/";
const defaultCkbFaucetUrl = "https://faucet.nervos.org/";
const nodeAliases = ["a", "b", "c", "d", "e"];
let chalk = plainChalk();
function plainChalk() {
    const passthrough = (...values) => values.join(" ");
    let proxy;
    proxy = new Proxy(passthrough, {
        get: () => proxy,
        apply: (_, __, values) => values.join(" ")
    });
    return proxy;
}
async function loadChalk() {
    try {
        const mod = await import("chalk");
        chalk = mod.default || chalk;
    }
    catch (_) {
        chalk = plainChalk();
    }
}
function title(value) {
    return chalk.bold(value);
}
function dim(value) {
    return chalk.dim(value);
}
function label(value) {
    return chalk.dim(value);
}
function valueText(value) {
    return chalk.cyan(value);
}
function commandText(value) {
    return chalk.cyan(value);
}
function successText(value) {
    return chalk.green(value);
}
function warningText(value) {
    return chalk.yellow(value);
}
function errorText(value) {
    return chalk.red(value);
}
function statusText(value) {
    const raw = String(value);
    const normalized = raw.trim();
    if (/^(OK|ready|online|running|yes|Success|Succeeded|Connected|ChannelReady|Started)$/i.test(normalized)) {
        return successText(raw);
    }
    if (/WARN|warning|pending|opening|negotiating|notstarted|submitted|unknown/i.test(normalized)) {
        return warningText(raw);
    }
    if (/FAIL|failed|offline|not running|not ready|missing|unavailable|closed|abandoned|no$/i.test(normalized)) {
        return errorText(raw);
    }
    return raw;
}
function kv(key, value) {
    return `  ${label(`${key}:`)} ${value}`;
}
function fail(message) {
    console.error(`${errorText("fiber:")} ${message}`);
    process.exit(1);
}
function usage() {
    console.log(`${title("Usage:")}
  ${commandText("fiber version")}
  ${commandText("fiber doctor")}
  ${commandText("fiber start")} ${dim("[--background|-b] [--dry-run] [-- FNN_ARGS...]")}
  ${commandText("fiber start --nodes 2 --channel 200")} ${dim("[--wait 180]")}
  ${commandText("fiber connect --node a --address <multiaddr>")}
  ${commandText("fiber connect --node a --pubkey <peer-pubkey>")}
  ${commandText("fiber peer disconnect --node a --pubkey <peer-pubkey>")}
  ${commandText("fiber address --node a")} ${dim("[--host <public-ip>]")}
  ${commandText("fiber channel open --node a --peer <peer-pubkey> --amount 200")}
  ${commandText("fiber channel list --node a")}
  ${commandText("fiber pay --from a --to b --amount 1")}
  ${commandText("fiber accounts")} ${dim("[--node a] [--json]")}
  ${commandText("fiber balance")} ${dim("[--node a] [--json]")}
  ${commandText("fiber keys export --node a --yes")}
  ${commandText("fiber status")} ${dim("[--watch]")}
  ${commandText("fiber inspect")}
  ${commandText("fiber node")} ${dim("[FNN_ARGS...]")}
  ${commandText("fiber cli")} ${dim("[FNN_CLI_ARGS...]")}
  ${commandText("fiber stop")} ${dim("[--all]")}

${title("Environment:")}
  ${valueText("FIBER_HOME")}                 Runtime directory. Default: ~/.fiber-node
  ${valueText("FIBER_DEV_KIT_HOME")}         Multi-node dev kit directory. Default: ~/.fiber-dev-kit
  ${valueText("FIBER_RPC_URL")}              RPC URL to start/connect to. Default: ${defaultRpcUrl}
  ${valueText("FIBER_CONFIG_TEMPLATE")}      Bundled config name or config file path. Default: ${defaultConfigTemplate}
  ${valueText("FIBER_SECRET_KEY_PASSWORD")}  Key password. Default: ${defaultPassword}`);
}
function platformDir() {
    if (platformKey !== "linux-x64") {
        fail(`unsupported platform ${platformKey}; this MVP package currently supports linux-x64 only`);
    }
    return path.join(pkgRoot, "vendor", platformKey);
}
function binPath(name) {
    const file = path.join(platformDir(), name);
    if (!fs.existsSync(file)) {
        fail(`missing ${name} binary at ${file}`);
    }
    return file;
}
function ensureMode(file, mode) {
    try {
        fs.chmodSync(file, mode);
    }
    catch (_) {
        // Best effort. npm normally preserves executable bits.
    }
}
function configTemplatePath() {
    const template = process.env.FIBER_CONFIG_TEMPLATE || defaultConfigTemplate;
    const candidates = [];
    if (path.isAbsolute(template)) {
        candidates.push(template);
    }
    else {
        candidates.push(path.join(pkgRoot, "config", template));
        if (!template.endsWith(".yml") && !template.endsWith(".yaml")) {
            candidates.push(path.join(pkgRoot, "config", `${template}.yml`));
        }
    }
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) {
        fail(`config template not found: ${template}`);
    }
    return found;
}
function ensureRuntime() {
    fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(runtimeDir, "ckb"), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(runtimeDir, "fiber"), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(runtimeDir, "logs"), { recursive: true });
    const configPath = path.join(runtimeDir, "config.yml");
    if (!fs.existsSync(configPath)) {
        fs.copyFileSync(configTemplatePath(), configPath);
    }
    const keyPath = path.join(runtimeDir, "ckb", "key");
    if (!fs.existsSync(keyPath)) {
        fs.writeFileSync(keyPath, `${crypto.randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
    }
    ensureMode(keyPath, 0o600);
    return { configPath, keyPath };
}
function run(bin, args, env = {}) {
    const child = spawn(bin, args, {
        stdio: "inherit",
        env: { ...process.env, ...env }
    });
    child.on("exit", (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exit(code ?? 1);
    });
}
function runSync(bin, args, options = {}) {
    return spawnSync(bin, args, {
        stdio: options.stdio || "inherit",
        env: { ...process.env, ...(options.env || {}) },
        encoding: "utf8"
    });
}
function runCapture(bin, args, options = {}) {
    return spawnSync(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...(options.env || {}) },
        encoding: "utf8"
    });
}
function parseArgs(args) {
    const out = { _: [] };
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--") {
            out._.push(...args.slice(i + 1));
            break;
        }
        if (!arg.startsWith("-") || arg === "-") {
            out._.push(arg);
            continue;
        }
        if (arg === "-b") {
            out.background = true;
            continue;
        }
        if (arg.startsWith("--")) {
            const eq = arg.indexOf("=");
            if (eq >= 0) {
                out[arg.slice(2, eq)] = arg.slice(eq + 1);
                continue;
            }
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith("-")) {
                out[key] = next;
                i += 1;
            }
            else {
                out[key] = true;
            }
        }
    }
    return out;
}
function optionInt(opts, key, fallback) {
    if (opts[key] === undefined || opts[key] === true)
        return fallback;
    const value = Number(opts[key]);
    if (!Number.isInteger(value) || value <= 0) {
        fail(`--${key} must be a positive integer`);
    }
    return value;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function loadState() {
    try {
        return JSON.parse(fs.readFileSync(devkitStatePath, "utf8"));
    }
    catch (_) {
        return {
            version: 1,
            createdAt: new Date().toISOString(),
            devkitDir,
            nodes: {},
            channel: null,
            lastPayment: null
        };
    }
}
function saveState(state) {
    fs.mkdirSync(devkitDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(devkitStatePath, `${JSON.stringify(state, null, 2)}\n`);
}
function nodeLabel(index) {
    return nodeAliases[index] || `node${index + 1}`;
}
function nodeDir(label) {
    return path.join(devkitDir, "nodes", label);
}
function nodeByLabel(state, label) {
    const key = String(label || "").toLowerCase();
    const node = state.nodes[key];
    if (!node) {
        fail(`unknown node "${label}". Known nodes: ${Object.keys(state.nodes).join(", ") || "none"}`);
    }
    return node;
}
function findManagedNodeByPubkey(state, pubkey, excludeLabel) {
    const target = String(pubkey || "").toLowerCase();
    for (const node of Object.values(state.nodes || {})) {
        if (excludeLabel && node.label === excludeLabel)
            continue;
        if (node.pubkey && String(node.pubkey).toLowerCase() === target)
            return node;
        const info = cliJson(node.rpcUrl, ["info"]);
        if (!info.ok)
            continue;
        const livePubkey = findNested(info.json, (value) => typeof value === "string" && /^[0-9a-f]{66}$/i.test(value))
            || outputField(info.stdout, "pubkey");
        if (livePubkey)
            node.pubkey = livePubkey;
        if (livePubkey && String(livePubkey).toLowerCase() === target)
            return node;
    }
    return null;
}
function toShannons(value) {
    const raw = String(value || "").trim();
    if (!raw)
        fail("amount is required");
    if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) {
        fail(`invalid amount: ${value}`);
    }
    const [whole, fraction = ""] = raw.split(".");
    if (fraction.length > 8) {
        fail(`amount has too many decimal places: ${value}`);
    }
    return (BigInt(whole) * ckbShannons + BigInt((fraction.padEnd(8, "0") || "0"))).toString();
}
function fromShannons(value) {
    try {
        const n = BigInt(String(value));
        const whole = n / ckbShannons;
        const fraction = (n % ckbShannons).toString().padStart(8, "0").replace(/0+$/, "");
        return fraction ? `${whole}.${fraction}` : `${whole}`;
    }
    catch (_) {
        return String(value);
    }
}
function normalizePositiveInteger(value, label) {
    const raw = String(value || "").trim();
    if (!/^[0-9]+$/.test(raw) || BigInt(raw) <= 0n) {
        fail(`${label} must be a positive integer`);
    }
    return raw;
}
function normalizePubkey(value, label = "pubkey") {
    const raw = String(value || "").trim();
    const withoutPrefix = raw.startsWith("0x") ? raw.slice(2) : raw;
    if (!/^[0-9a-f]{66}$/i.test(withoutPrefix)) {
        fail(`${label} must be a 33-byte compressed public key, for example 02... or 03...`);
    }
    return withoutPrefix;
}
function normalizeMultiaddr(value) {
    const raw = String(value || "").trim();
    if (!raw.startsWith("/") || !raw.includes("/p2p/")) {
        fail("peer address must be a multiaddr that includes /p2p/<peer-id>");
    }
    return raw;
}
function parseJsonOutput(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed)
        return null;
    try {
        return JSON.parse(trimmed);
    }
    catch (_) {
        const firstObject = trimmed.search(/[\[{]/);
        if (firstObject >= 0) {
            try {
                return JSON.parse(trimmed.slice(firstObject));
            }
            catch (_) {
                return null;
            }
        }
        return null;
    }
}
function findNested(value, predicate) {
    if (predicate(value))
        return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findNested(item, predicate);
            if (found !== undefined)
                return found;
        }
    }
    else if (value && typeof value === "object") {
        for (const item of Object.values(value)) {
            const found = findNested(item, predicate);
            if (found !== undefined)
                return found;
        }
    }
    return undefined;
}
function outputField(output, key) {
    const match = String(output || "").match(new RegExp(`^${key}:\\s*(.+)$`, "mi"));
    return match ? match[1].trim() : null;
}
function collectNested(value, predicate, out = []) {
    if (predicate(value))
        out.push(value);
    if (Array.isArray(value)) {
        for (const item of value)
            collectNested(item, predicate, out);
    }
    else if (value && typeof value === "object") {
        for (const item of Object.values(value))
            collectNested(item, predicate, out);
    }
    return out;
}
function fnnCli(args, options = {}) {
    const result = runCapture(binPath("fnn-cli"), args, options);
    return {
        ok: result.status === 0,
        status: result.status,
        stdout: result.stdout || "",
        stderr: result.stderr || ""
    };
}
function cliJson(rpcUrl, args) {
    const result = fnnCli(["--url", rpcUrl, "--output-format", "json", "--no-banner", ...args]);
    const json = parseJsonOutput(result.stdout);
    return { ...result, json };
}
function cliText(rpcUrl, args) {
    return fnnCli(["--url", rpcUrl, "--no-banner", ...args]);
}
function commandError(result) {
    return (result.stderr || result.stdout || `command exited with status ${result.status}`).trim();
}
function shellQuote(value) {
    const raw = String(value);
    return /^[A-Za-z0-9_./:=@+-]+$/.test(raw) ? raw : JSON.stringify(raw);
}
function formatCliCommand(rpcUrl, args) {
    return [binPath("fnn-cli"), "--url", rpcUrl, "--no-banner", ...args].map(shellQuote).join(" ");
}
function jsonRpc(url, method, params = [], timeoutMs = 4000) {
    return new Promise((resolve) => {
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch (err) {
            resolve({ ok: false, error: `invalid URL: ${err.message}` });
            return;
        }
        const body = JSON.stringify({ id: 1, jsonrpc: "2.0", method, params });
        const transport = parsed.protocol === "https:" ? https : http;
        const req = transport.request({
            method: "POST",
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
            path: parsed.pathname || "/",
            timeout: timeoutMs,
            headers: {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(body)
            }
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                const json = parseJsonOutput(text);
                if (!json) {
                    resolve({ ok: false, error: `invalid JSON-RPC response (${res.statusCode})` });
                    return;
                }
                if (json.error) {
                    resolve({ ok: false, error: json.error.message || JSON.stringify(json.error), json });
                    return;
                }
                resolve({ ok: true, result: json.result, json });
            });
        });
        req.on("timeout", () => {
            req.destroy();
            resolve({ ok: false, error: "request timed out" });
        });
        req.on("error", (err) => resolve({ ok: false, error: err.message }));
        req.write(body);
        req.end();
    });
}
async function findFreePort(startPort) {
    for (let port = startPort; port < startPort + 200; port += 1) {
        if (await canListen(defaultRpcHost, port))
            return port;
    }
    fail(`could not find a free port from ${startPort} to ${startPort + 199}`);
}
function commandVersion(command, args = ["--version"]) {
    const result = runCapture(command, args);
    return {
        ok: result.status === 0,
        text: `${result.stdout || ""}${result.stderr || ""}`.trim()
    };
}
function safeReadFile(file) {
    try {
        return fs.readFileSync(file);
    }
    catch (_) {
        return null;
    }
}
function keyFileInfo(file) {
    const buf = safeReadFile(file);
    if (!buf)
        return { exists: false, path: file };
    const text = buf.toString("utf8").trim();
    const plaintextHex = /^[0-9a-f]{64}$/i.test(text);
    return {
        exists: true,
        path: file,
        bytes: buf.length,
        format: plaintextHex ? "plaintext-dev-hex" : "encrypted-or-binary",
        sha256: crypto.createHash("sha256").update(buf).digest("hex")
    };
}
function secretPayload(file) {
    const buf = safeReadFile(file);
    if (!buf)
        return null;
    const text = buf.toString("utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(text)) {
        return { encoding: "hex", value: text };
    }
    return { encoding: "base64", value: buf.toString("base64") };
}
function findFundingLockScript(infoJson) {
    if (!infoJson)
        return null;
    const direct = infoJson.default_funding_lock_script
        || (infoJson.result && infoJson.result.default_funding_lock_script);
    if (direct)
        return direct;
    const scripts = collectNested(infoJson, (value) => (value
        && typeof value === "object"
        && typeof value.code_hash === "string"
        && typeof value.hash_type === "string"
        && typeof value.args === "string"));
    return scripts.find((script) => script.code_hash === "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8")
        || scripts[0]
        || null;
}
function deriveAddresses(lockArg) {
    if (!lockArg)
        return null;
    const ckbCliHome = path.join(devkitDir, ".ckb-cli");
    fs.mkdirSync(ckbCliHome, { recursive: true, mode: 0o700 });
    const result = runCapture("ckb-cli", [
        "util", "key-info",
        "--lock-arg", lockArg,
        "--output-format", "json",
        "--local-only"
    ], { env: { HOME: ckbCliHome } });
    if (result.status !== 0)
        return null;
    const json = parseJsonOutput(result.stdout);
    return json && json.address ? json.address : null;
}
async function capacityForLock(lockScript) {
    if (!lockScript)
        return null;
    const ckbRpcUrl = process.env.CKB_NODE_RPC_URL || defaultCkbRpcUrl;
    const result = await jsonRpc(ckbRpcUrl, "get_cells_capacity", [{ script: lockScript, script_type: "lock" }]);
    if (!result.ok)
        return { ok: false, error: result.error };
    const capacity = result.result && (result.result.capacity || result.result);
    return { ok: true, capacity };
}
function capacityToShannons(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "bigint")
        return value;
    if (typeof value === "number")
        return BigInt(value);
    const raw = String(value).trim();
    if (!raw)
        return null;
    try {
        if (/^0x[0-9a-f]+$/i.test(raw))
            return BigInt(raw);
        if (/^[0-9]+$/.test(raw))
            return BigInt(raw);
    }
    catch (_) {
        return null;
    }
    return null;
}
function formatCapacity(value) {
    const shannons = capacityToShannons(value);
    if (shannons === null)
        return String(value || "unknown");
    return `${fromShannons(shannons.toString())} CKB`;
}
function fileHash(file) {
    const buf = safeReadFile(file);
    if (!buf)
        return null;
    return crypto.createHash("sha256").update(buf).digest("hex");
}
function hasUrlArg(args) {
    return args.some((arg) => arg === "-u" || arg === "--url" || arg.startsWith("--url="));
}
function getOptionValue(args, option) {
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === option) {
            return args[i + 1];
        }
        if (arg.startsWith(`${option}=`)) {
            return arg.slice(option.length + 1);
        }
    }
    return null;
}
function formatHostForUrl(host) {
    return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
function endpointFromParts(host, port) {
    const urlHost = host === "0.0.0.0" || host === "::" ? defaultRpcHost : host;
    return {
        host,
        port,
        listenAddr: `${host}:${port}`,
        url: `http://${formatHostForUrl(urlHost)}:${port}`
    };
}
function parseRpcUrl(url, source) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch (_) {
        fail(`invalid ${source}: ${url}`);
    }
    if (parsed.protocol !== "http:") {
        fail(`${source} must use http://, got ${parsed.protocol}`);
    }
    const port = Number(parsed.port || 80);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        fail(`invalid ${source} port: ${url}`);
    }
    return endpointFromParts(parsed.hostname, port);
}
function parseListenAddr(addr, source) {
    const trimmed = String(addr || "").trim();
    const match = trimmed.match(/^\[?([^\]]+)\]?:(\d+)$/);
    if (!match) {
        fail(`invalid ${source}: ${addr}`);
    }
    const port = Number(match[2]);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        fail(`invalid ${source} port: ${addr}`);
    }
    return endpointFromParts(match[1], port);
}
function readRememberedRpcUrl() {
    try {
        const value = fs.readFileSync(rpcUrlFile, "utf8").trim();
        return value || null;
    }
    catch (_) {
        return null;
    }
}
function currentRpcUrl() {
    return process.env.FIBER_RPC_URL || readRememberedRpcUrl() || defaultRpcUrl;
}
function canListen(host, port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.listen({ host, port }, () => {
            server.close(() => resolve(true));
        });
    });
}
async function findAvailableRpcEndpoint() {
    for (let port = defaultRpcPort; port < defaultRpcPort + 100; port += 1) {
        if (await canListen(defaultRpcHost, port)) {
            return endpointFromParts(defaultRpcHost, port);
        }
    }
    fail(`could not find a free RPC port from ${defaultRpcPort} to ${defaultRpcPort + 99}`);
}
async function resolveRpcEndpoint(fnnArgs, options = {}) {
    const skipProbe = Boolean(options.skipProbe);
    const explicitListenAddr = getOptionValue(fnnArgs, "--rpc-listening-addr");
    if (explicitListenAddr) {
        return { endpoint: parseListenAddr(explicitListenAddr, "--rpc-listening-addr"), fnnArgs };
    }
    if (process.env.RPC_LISTENING_ADDR) {
        return { endpoint: parseListenAddr(process.env.RPC_LISTENING_ADDR, "RPC_LISTENING_ADDR"), fnnArgs };
    }
    if (process.env.FIBER_RPC_URL) {
        const endpoint = parseRpcUrl(process.env.FIBER_RPC_URL, "FIBER_RPC_URL");
        if (!skipProbe && !(await canListen(endpoint.host, endpoint.port))) {
            fail(`RPC address ${endpoint.listenAddr} is already in use`);
        }
        return { endpoint, fnnArgs: [...fnnArgs, "--rpc-listening-addr", endpoint.listenAddr] };
    }
    if (skipProbe) {
        const endpoint = endpointFromParts(defaultRpcHost, defaultRpcPort);
        return { endpoint, fnnArgs: [...fnnArgs, "--rpc-listening-addr", endpoint.listenAddr] };
    }
    const endpoint = await findAvailableRpcEndpoint();
    return { endpoint, fnnArgs: [...fnnArgs, "--rpc-listening-addr", endpoint.listenAddr] };
}
function parseStartArgs(args) {
    const fnnArgs = [];
    let background = false;
    let dryRun = false;
    while (args.length > 0) {
        const arg = args.shift();
        if (arg === "--") {
            fnnArgs.push(...args);
            break;
        }
        if (arg === "--background" || arg === "-b") {
            background = true;
            continue;
        }
        if (arg === "--dry-run") {
            dryRun = true;
            continue;
        }
        fnnArgs.push(arg);
    }
    return { background, dryRun, fnnArgs };
}
async function startNode(args) {
    const { background, dryRun, fnnArgs } = parseStartArgs([...args]);
    const { configPath } = ensureRuntime();
    const fnn = binPath("fnn");
    const rpc = await resolveRpcEndpoint(fnnArgs, { skipProbe: dryRun });
    const finalArgs = ["-c", configPath, "-d", runtimeDir, ...rpc.fnnArgs];
    const env = {
        FIBER_SECRET_KEY_PASSWORD: process.env.FIBER_SECRET_KEY_PASSWORD || defaultPassword,
        RUST_LOG: process.env.RUST_LOG || "info"
    };
    if (dryRun) {
        console.log(`${warningText("[dry-run]")} ${commandText(`${fnn} ${finalArgs.map((arg) => JSON.stringify(arg)).join(" ")}`)}`);
        console.log(`${valueText("FIBER_HOME")}=${runtimeDir}`);
        console.log(`${valueText("FIBER_RPC_URL")}=${rpc.endpoint.url}`);
        return;
    }
    fs.writeFileSync(rpcUrlFile, `${rpc.endpoint.url}\n`);
    if (!background) {
        console.log(`${successText("fiber:")} RPC will listen at ${valueText(rpc.endpoint.url)}`);
        run(fnn, finalArgs, env);
        return;
    }
    const pidFile = path.join(runtimeDir, "fnn.pid");
    const logFile = path.join(runtimeDir, "logs", "fnn.log");
    const out = fs.openSync(logFile, "a");
    const child = spawn(fnn, finalArgs, {
        detached: true,
        stdio: ["ignore", out, out],
        env: { ...process.env, ...env },
        cwd: runtimeDir
    });
    child.unref();
    fs.writeFileSync(pidFile, `${child.pid}\n`);
    console.log(successText("Started Fiber node"));
    console.log(kv("pid", valueText(child.pid)));
    console.log(kv("rpc", valueText(rpc.endpoint.url)));
    console.log(kv("log", valueText(logFile)));
}
function runCli(args) {
    const fnnCli = binPath("fnn-cli");
    const finalArgs = hasUrlArg(args) ? args : ["--url", currentRpcUrl(), ...args];
    run(fnnCli, finalArgs);
}
function runNode(args) {
    run(binPath("fnn"), args);
}
function version() {
    const fnn = binPath("fnn");
    const fnnCli = binPath("fnn-cli");
    const nodeResult = runSync(fnn, ["--version"]);
    if (nodeResult.status !== 0) {
        process.exit(nodeResult.status || 1);
    }
    const cliResult = runSync(fnnCli, ["--version"]);
    process.exit(cliResult.status || 0);
}
function readPid(pidFile) {
    try {
        const raw = fs.readFileSync(pidFile, "utf8").trim();
        return /^[0-9]+$/.test(raw) ? Number(raw) : null;
    }
    catch (_) {
        return null;
    }
}
function isRunning(pid) {
    if (!pid)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (_) {
        return false;
    }
}
function rpcPortOpen(url) {
    return new Promise((resolve) => {
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch (_) {
            resolve(false);
            return;
        }
        const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
        const socket = net.createConnection({
            host: parsed.hostname,
            port
        });
        socket.setTimeout(1000);
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });
        socket.once("error", () => resolve(false));
    });
}
function ensureDevkitRuntimeNode(label, rpcPort, p2pPort) {
    const home = nodeDir(label);
    const ckbDir = path.join(home, "ckb");
    const fiberDir = path.join(home, "fiber");
    const logsDir = path.join(home, "logs");
    fs.mkdirSync(ckbDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(fiberDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(logsDir, { recursive: true });
    const configPath = path.join(home, "config.yml");
    if (!fs.existsSync(configPath)) {
        fs.copyFileSync(configTemplatePath(), configPath);
    }
    const ckbKeyPath = path.join(ckbDir, "key");
    if (!fs.existsSync(ckbKeyPath)) {
        fs.writeFileSync(ckbKeyPath, `${crypto.randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
    }
    ensureMode(ckbKeyPath, 0o600);
    return {
        label,
        home,
        ckbDir,
        fiberDir,
        logsDir,
        configPath,
        rpcPort,
        rpcUrl: `http://${defaultRpcHost}:${rpcPort}`,
        p2pPort,
        p2pListenAddr: `/ip4/${defaultRpcHost}/tcp/${p2pPort}`,
        pidFile: path.join(home, "fnn.pid"),
        logFile: path.join(logsDir, "fnn.log")
    };
}
function startManagedNode(node, extraArgs = []) {
    const fnn = binPath("fnn");
    const out = fs.openSync(node.logFile, "a");
    const args = [
        "-c", node.configPath,
        "-d", node.home,
        "--ckb-base-dir", node.ckbDir,
        "--fiber-base-dir", node.fiberDir,
        "--rpc-listening-addr", `${defaultRpcHost}:${node.rpcPort}`,
        "--fiber-listening-addr", node.p2pListenAddr,
        "--fiber-announce-listening-addr", "true",
        "--fiber-announce-private-addr", "true",
        ...extraArgs
    ];
    const child = spawn(fnn, args, {
        detached: true,
        stdio: ["ignore", out, out],
        env: {
            ...process.env,
            FIBER_SECRET_KEY_PASSWORD: process.env.FIBER_SECRET_KEY_PASSWORD || defaultPassword,
            RUST_LOG: process.env.RUST_LOG || "info"
        },
        cwd: node.home
    });
    child.unref();
    fs.writeFileSync(node.pidFile, `${child.pid}\n`);
    return child.pid;
}
function parsePeerAddressFromLog(logFile) {
    try {
        const text = fs.readFileSync(logFile, "utf8");
        const matches = [...text.matchAll(/"([^"]+\/p2p\/[^"]+)"/g)].map((m) => m[1]);
        return matches.find((addr) => addr.includes(`/tcp/`)) || matches[0] || null;
    }
    catch (_) {
        return null;
    }
}
async function waitForRpc(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await rpcPortOpen(url))
            return true;
        await sleep(1000);
    }
    return false;
}
async function waitForNodeInfo(node, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = cliJson(node.rpcUrl, ["info"]);
        if (result.ok) {
            const pubkey = findNested(result.json, (value) => typeof value === "string" && /^[0-9a-f]{66}$/i.test(value))
                || outputField(result.stdout, "pubkey");
            return { ok: true, pubkey, info: result.json, output: result.stdout };
        }
        await sleep(1000);
    }
    return { ok: false };
}
async function waitForPeerAddress(node, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const address = parsePeerAddressFromLog(node.logFile);
        if (address)
            return address;
        await sleep(1000);
    }
    return null;
}
function normalizeList(json) {
    if (!json)
        return [];
    if (Array.isArray(json))
        return json;
    for (const key of ["channels", "payments", "peers", "result", "items"]) {
        if (Array.isArray(json[key]))
            return json[key];
    }
    if (json.result && Array.isArray(json.result))
        return json.result;
    return [];
}
function textContains(value, pattern) {
    return pattern.test(JSON.stringify(value || {}));
}
function channelState(channel) {
    const found = findNested(channel, (value) => typeof value === "string" && /ChannelReady|NegotiatingFunding|Funding|Awaiting|Collaborating|Signing|Shutdown|Closed|Abandoned|Failed/i.test(value));
    return found || "Unknown";
}
function channelFailureDetail(channel) {
    if (channel && typeof channel.failure_detail === "string")
        return channel.failure_detail;
    return findNested(channel, (value) => typeof value === "string" && /Funding tx rejected|Funding transaction aborted|FUNDING_ABORTED|failed|aborted/i.test(value)) || null;
}
function isSyntheticFailedOpening(channel) {
    return Boolean(channel
        && textContains(channel, /FUNDING_ABORTED|funding aborted/i)
        && (channel.channel_outpoint === null || channel.channel_outpoint === undefined)
        && !channel.latest_commitment_transaction_hash);
}
function listChannels(node, options = {}) {
    const args = ["channel", "list_channels"];
    if (options.pubkey)
        args.push("--pubkey", options.pubkey);
    if (options.includeClosed)
        args.push("--include-closed", "true");
    if (options.onlyPending)
        args.push("--only-pending", "true");
    const result = cliJson(node.rpcUrl, args);
    return { ...result, channels: normalizeList(result.json) };
}
function extractChannelId(channel) {
    return findNested(channel, (value) => typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value)) || null;
}
async function waitForChannelReady(node, peerPubkey, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastState = "Unknown";
    while (Date.now() < deadline) {
        const listed = listChannels(node, { pubkey: peerPubkey });
        if (!listed.ok) {
            await sleep(2000);
            continue;
        }
        const channel = listed.channels.find((item) => JSON.stringify(item).includes(peerPubkey))
            || listed.channels[0];
        if (channel) {
            lastState = channelState(channel);
            if (/ChannelReady/i.test(lastState))
                return { ok: true, state: lastState, channel };
            if (/Failed|Abandoned|Closed/i.test(lastState))
                return { ok: false, state: lastState, channel };
        }
        await sleep(2000);
    }
    return { ok: false, state: lastState };
}
function liveNodePubkey(node) {
    if (node.pubkey)
        return node.pubkey;
    const info = cliJson(node.rpcUrl, ["info"]);
    if (!info.ok)
        return null;
    const pubkey = findNested(info.json, (value) => typeof value === "string" && /^[0-9a-f]{66}$/i.test(value))
        || outputField(info.stdout, "pubkey");
    if (pubkey)
        node.pubkey = pubkey;
    return pubkey || null;
}
async function waitForChannelReadyOnNodes(checks, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    const states = {};
    while (Date.now() < deadline) {
        let allReady = true;
        for (const check of checks) {
            const listed = listChannels(check.node, { pubkey: check.peerPubkey });
            if (!listed.ok) {
                states[check.label] = "RPCUnavailable";
                allReady = false;
                continue;
            }
            const channel = listed.channels.find((item) => JSON.stringify(item).includes(check.peerPubkey))
                || listed.channels[0];
            if (!channel) {
                states[check.label] = "NotFound";
                allReady = false;
                continue;
            }
            const state = channelState(channel);
            states[check.label] = state;
            if (/Failed|Abandoned|Closed/i.test(state))
                return { ok: false, state, states, channel };
            if (!/ChannelReady/i.test(state))
                allReady = false;
        }
        if (allReady)
            return { ok: true, state: "ChannelReady", states };
        await sleep(2000);
    }
    return {
        ok: false,
        state: Object.entries(states).map(([label, state]) => `${label}: ${state}`).join(", ") || "Unknown",
        states
    };
}
function listPayments(node) {
    const result = cliJson(node.rpcUrl, ["payment", "list_payments", "--limit", "10"]);
    return { ...result, payments: normalizeList(result.json) };
}
function paymentStatus(payment) {
    if (payment && typeof payment.status === "string")
        return payment.status;
    if (Array.isArray(payment)) {
        for (const item of payment) {
            const found = paymentStatus(item);
            if (found)
                return found;
        }
    }
    else if (payment && typeof payment === "object") {
        for (const value of Object.values(payment)) {
            const found = paymentStatus(value);
            if (found)
                return found;
        }
    }
    return null;
}
function summarizeNode(node) {
    const pid = readPid(node.pidFile);
    const info = cliJson(node.rpcUrl, ["info"]);
    const peers = info.ok ? (findNested(info.json, (value) => typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) || outputField(info.stdout, "peers_count")) : null;
    return {
        online: info.ok,
        pid,
        processRunning: isRunning(pid),
        peers: peers || "?",
        pubkey: info.ok ? (findNested(info.json, (value) => typeof value === "string" && /^[0-9a-f]{66}$/i.test(value)) || outputField(info.stdout, "pubkey")) : null
    };
}
async function accountInfo(node) {
    const info = cliJson(node.rpcUrl, ["info"]);
    const online = info.ok;
    const pubkey = online
        ? (findNested(info.json, (value) => typeof value === "string" && /^[0-9a-f]{66}$/i.test(value)) || outputField(info.stdout, "pubkey"))
        : node.pubkey || null;
    const fundingLock = online ? findFundingLockScript(info.json) : null;
    const addresses = fundingLock ? deriveAddresses(fundingLock.args) : null;
    const capacity = fundingLock ? await capacityForLock(fundingLock) : null;
    return {
        label: node.label,
        home: node.home,
        rpcUrl: node.rpcUrl,
        online,
        pubkey,
        peerAddress: node.peerAddress || null,
        ckbKey: keyFileInfo(path.join(node.ckbDir, "key")),
        ckbExportedKey: keyFileInfo(path.join(node.ckbDir, "exported-key")),
        fiberKey: keyFileInfo(path.join(node.fiberDir, "sk")),
        fundingLock,
        address: addresses ? {
            testnet: addresses.testnet,
            mainnet: addresses.mainnet
        } : null,
        capacity
    };
}
function printAccount(account) {
    console.log(title(`node-${account.label}`));
    console.log(kv("rpc", valueText(account.rpcUrl)));
    console.log(kv("home", valueText(account.home)));
    console.log(kv("online", statusText(account.online ? "yes" : "no")));
    console.log(kv("fiber pubkey", account.pubkey ? valueText(account.pubkey) : warningText("unknown until node RPC is online")));
    console.log(kv("ckb key", account.ckbKey.exists ? `${valueText(account.ckbKey.path)} ${dim(`(${account.ckbKey.format})`)}` : `${valueText(account.ckbKey.path)} ${errorText("(missing)")}`));
    console.log(kv("ckb exported key", account.ckbExportedKey.exists ? `${valueText(account.ckbExportedKey.path)} ${dim(`(${account.ckbExportedKey.format})`)}` : `${valueText(account.ckbExportedKey.path)} ${warningText("(missing)")}`));
    console.log(kv("fiber key", account.fiberKey.exists ? `${valueText(account.fiberKey.path)} ${dim(`(${account.fiberKey.format})`)}` : `${valueText(account.fiberKey.path)} ${warningText("(missing until node starts)")}`));
    if (account.peerAddress)
        console.log(kv("peer address", valueText(account.peerAddress)));
    if (account.fundingLock) {
        console.log(kv("funding lock", ""));
        console.log(`    ${label("code_hash:")} ${valueText(account.fundingLock.code_hash)}`);
        console.log(`    ${label("hash_type:")} ${valueText(account.fundingLock.hash_type)}`);
        console.log(`    ${label("args:")} ${valueText(account.fundingLock.args)}`);
    }
    else {
        console.log(kv("funding lock", warningText("unavailable until node RPC is online")));
    }
    if (account.address) {
        console.log(kv("testnet address", valueText(account.address.testnet)));
        console.log(kv("mainnet address", valueText(account.address.mainnet)));
    }
    else {
        console.log(kv("address", warningText("unavailable")));
    }
    if (account.capacity) {
        console.log(kv("capacity", account.capacity.ok ? valueText(formatCapacity(account.capacity.capacity)) : warningText(`unavailable (${account.capacity.error})`)));
    }
    console.log("");
}
async function accounts(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const selected = selectNodes(state, opts);
    if (selected.length === 0) {
        fail("no dev kit nodes found. Run `fiber start --nodes 2 --channel 200` first.");
    }
    const result = [];
    for (const node of selected) {
        result.push(await accountInfo(node));
    }
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    for (const account of result)
        printAccount(account);
    console.log(dim(`Secrets are hidden. Use ${commandText("fiber keys export --node a --yes")} only for local dev recovery.`));
}
function selectNodes(state, opts) {
    const nodes = state.nodes || {};
    if (opts.node)
        return [nodeByLabel(state, opts.node)];
    return Object.values(nodes);
}
async function fundingStatus(node) {
    const info = cliJson(node.rpcUrl, ["info"]);
    if (!info.ok) {
        return { ok: false, node, reason: `node-${node.label} RPC is not ready at ${node.rpcUrl}` };
    }
    const fundingLock = findFundingLockScript(info.json);
    if (!fundingLock) {
        return { ok: false, node, reason: `node-${node.label} funding lock is unavailable` };
    }
    const capacity = await capacityForLock(fundingLock);
    if (!capacity || !capacity.ok) {
        return { ok: false, node, fundingLock, reason: capacity ? capacity.error : "capacity unavailable" };
    }
    const shannons = capacityToShannons(capacity.capacity);
    if (shannons === null) {
        return { ok: false, node, fundingLock, capacity, reason: `could not parse capacity ${capacity.capacity}` };
    }
    const addresses = deriveAddresses(fundingLock.args);
    return {
        ok: true,
        node,
        fundingLock,
        capacity,
        shannons,
        address: addresses ? { testnet: addresses.testnet, mainnet: addresses.mainnet } : null
    };
}
function printBalanceStatus(status) {
    const node = status.node;
    console.log(title(`node-${node.label}`));
    console.log(kv("rpc", valueText(node.rpcUrl)));
    if (!status.ok) {
        console.log(kv("balance", warningText(`unavailable (${status.reason})`)));
        console.log("");
        return;
    }
    console.log(kv("capacity", valueText(formatCapacity(status.capacity.capacity))));
    if (status.address && status.address.testnet)
        console.log(kv("testnet address", valueText(status.address.testnet)));
    if (status.fundingLock && status.fundingLock.args)
        console.log(kv("funding lock args", valueText(status.fundingLock.args)));
    console.log("");
}
function fundingAction(status, nodeLabel) {
    const address = status.address && status.address.testnet;
    if (address)
        return `Fund ${address} from ${defaultCkbFaucetUrl}.`;
    return `Run \`fiber accounts --node ${nodeLabel}\` and fund the testnet address from ${defaultCkbFaucetUrl}.`;
}
async function balance(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const selected = selectNodes(state, opts);
    if (selected.length === 0) {
        fail("no dev kit nodes found. Run `fiber start --nodes 2 --channel 200` first.");
    }
    const statuses = [];
    for (const node of selected) {
        statuses.push(await fundingStatus(node));
    }
    if (opts.json) {
        console.log(JSON.stringify(statuses.map((status) => ({
            node: status.node.label,
            ok: status.ok,
            rpcUrl: status.node.rpcUrl,
            capacity: status.capacity ? status.capacity.capacity : null,
            capacityCkb: status.ok ? fromShannons(status.shannons.toString()) : null,
            address: status.address || null,
            fundingLock: status.fundingLock || null,
            reason: status.reason || null
        })), null, 2));
        return;
    }
    for (const status of statuses)
        printBalanceStatus(status);
}
async function checkChannelFunding(node, amount) {
    const required = BigInt(amount);
    const status = await fundingStatus(node);
    if (!status.ok) {
        return { ok: false, status, message: status.reason };
    }
    if (status.shannons < required) {
        return {
            ok: false,
            status,
            message: `node-${node.label} has ${formatCapacity(status.capacity.capacity)} but needs at least ${fromShannons(amount)} CKB plus fees. ${fundingAction(status, node.label)}`
        };
    }
    return { ok: true, status };
}
async function checkNodeFunded(node, purpose) {
    const status = await fundingStatus(node);
    if (!status.ok) {
        return { ok: false, status, message: status.reason };
    }
    if (status.shannons <= 0n) {
        return {
            ok: false,
            status,
            message: `node-${node.label} has 0 CKB but needs testnet CKB to ${purpose}. ${fundingAction(status, node.label)}`
        };
    }
    return { ok: true, status };
}
function exportKeys(args) {
    const [subcommand, ...rest] = args;
    if (subcommand !== "export") {
        fail("unknown keys command. Usage: fiber keys export --node a --yes");
    }
    const opts = parseArgs(rest);
    if (!opts.node) {
        fail("missing --node. Usage: fiber keys export --node a --yes");
    }
    if (!opts.yes) {
        fail("refusing to print secrets without --yes");
    }
    const state = loadState();
    const node = nodeByLabel(state, opts.node);
    const ckbKeyPath = path.join(node.ckbDir, "key");
    const fiberKeyPath = path.join(node.fiberDir, "sk");
    const ckbKey = secretPayload(ckbKeyPath);
    const fiberKey = secretPayload(fiberKeyPath);
    console.log(title(`node-${node.label} dev keys`));
    console.log(warningText("WARNING: these are local development secrets. Do not paste them in public."));
    console.log(kv("ckb key path", valueText(ckbKeyPath)));
    console.log(kv("ckb key", ckbKey ? `${dim(`(${ckbKey.encoding})`)}: ${ckbKey.value}` : errorText("(missing)")));
    console.log(kv("fiber key path", valueText(fiberKeyPath)));
    console.log(kv("fiber key", fiberKey ? `${dim(`(${fiberKey.encoding})`)}: ${fiberKey.value}` : warningText("(missing until node starts)")));
}
async function startDevKit(args) {
    const opts = parseArgs(args);
    const nodesCount = optionInt(opts, "nodes", 2);
    if (nodesCount < 1 || nodesCount > nodeAliases.length) {
        fail(`--nodes must be between 1 and ${nodeAliases.length}`);
    }
    const channelAmount = opts.channel === undefined ? null : toShannons(opts.channel);
    const waitSeconds = optionInt(opts, "wait", 180);
    const dryRun = Boolean(opts["dry-run"]);
    const extraArgs = opts._ || [];
    fs.mkdirSync(devkitDir, { recursive: true, mode: 0o700 });
    console.log(kv("Fiber Dev Kit home", valueText(devkitDir)));
    console.log(kv("Binaries", successText("using bundled fnn and fnn-cli")));
    const state = {
        version: 1,
        createdAt: new Date().toISOString(),
        devkitDir,
        nodes: {},
        channel: channelAmount ? {
            amount: channelAmount,
            amountCkb: fromShannons(channelAmount),
            state: "NotStarted"
        } : null,
        lastPayment: null
    };
    for (let i = 0; i < nodesCount; i += 1) {
        const label = nodeLabel(i);
        const rpcPort = dryRun ? defaultRpcPort + i * 10 : await findFreePort(defaultRpcPort + i * 10);
        const p2pPort = dryRun ? 8228 + i * 10 : await findFreePort(8228 + i * 10);
        const node = ensureDevkitRuntimeNode(label, rpcPort, p2pPort);
        state.nodes[label] = node;
        if (dryRun) {
            console.log(`${warningText("[dry-run]")} ${title(`node-${label}`)}: ${valueText(node.rpcUrl)}, ${valueText(node.p2pListenAddr)}`);
            continue;
        }
        node.pid = startManagedNode(node, extraArgs);
        console.log(`${successText("Started")} ${title(`node-${label}`)}`);
        console.log(kv("pid", valueText(node.pid)));
        console.log(kv("rpc", valueText(node.rpcUrl)));
        console.log(kv("log", valueText(node.logFile)));
    }
    saveState(state);
    if (dryRun)
        return;
    for (const node of Object.values(state.nodes)) {
        const ready = await waitForRpc(node.rpcUrl, waitSeconds * 1000);
        if (!ready)
            fail(`node-${node.label} RPC did not become ready at ${node.rpcUrl}`);
        const info = await waitForNodeInfo(node, waitSeconds * 1000);
        if (info.ok) {
            node.pubkey = info.pubkey;
            console.log(`${title(`node-${node.label}`)}: ${statusText("online")}${node.pubkey ? ` | ${label("pubkey")} ${valueText(node.pubkey)}` : ""}`);
        }
    }
    if (state.nodes.a && state.nodes.b) {
        const peerAddress = await waitForPeerAddress(state.nodes.b, waitSeconds * 1000);
        state.nodes.b.peerAddress = peerAddress;
        if (peerAddress) {
            console.log(`${warningText("Connecting")} ${title("node-a")} -> ${title("node-b")}`);
            const connect = cliText(state.nodes.a.rpcUrl, ["peer", "connect_peer", "--address", peerAddress, "--save", "true"]);
            if (!connect.ok) {
                console.log(`${errorText("peer connect failed:")} ${(connect.stderr || connect.stdout).trim()}`);
            }
        }
        else {
            console.log(warningText("Could not discover node-b peer address from logs"));
        }
        if (channelAmount && state.nodes.b.pubkey) {
            const funding = await checkChannelFunding(state.nodes.a, channelAmount);
            const peerFunding = await checkNodeFunded(state.nodes.b, "collaborate on channel funding");
            const fundingFailures = [
                funding.ok ? null : { label: "a", message: funding.message },
                peerFunding.ok ? null : { label: "b", message: peerFunding.message }
            ].filter(Boolean);
            if (fundingFailures.length > 0) {
                state.channel.state = "FundingRequired";
                state.channel.error = fundingFailures.map((item) => item.message).join(" ");
                console.log(`${warningText("Skipping channel open:")} funding required`);
                for (const failure of fundingFailures) {
                    console.log(kv(`fund node-${failure.label}`, warningText(failure.message)));
                }
                console.log(`Run ${commandText("fiber balance")} after funding the nodes, then retry ${commandText(`fiber channel open --node a --peer ${state.nodes.b.pubkey} --amount ${fromShannons(channelAmount)} --wait ${waitSeconds}`)}.`);
                saveState(state);
                printReadySummary(state);
                return;
            }
            console.log(`${warningText("Opening channel:")} ${title("node-a")} -> ${title("node-b")} | ${valueText(fromShannons(channelAmount))} CKB`);
            const open = cliText(state.nodes.a.rpcUrl, [
                "channel", "open_channel",
                "--pubkey", state.nodes.b.pubkey,
                "--funding-amount", channelAmount
            ]);
            state.channel.state = open.ok ? "Opening" : "OpenFailed";
            if (!open.ok) {
                state.channel.error = (open.stderr || open.stdout).trim();
                console.log(`${errorText("channel open failed:")} ${state.channel.error}`);
                console.log(`Run ${commandText("fiber doctor")} for the recovery checklist.`);
            }
            else {
                const deadline = Date.now() + waitSeconds * 1000;
                while (Date.now() < deadline) {
                    const listed = listChannels(state.nodes.a);
                    const ready = listed.channels.find((channel) => textContains(channel, /ChannelReady/i));
                    const negotiating = listed.channels.find((channel) => textContains(channel, /NegotiatingFunding/i));
                    if (ready) {
                        state.channel.state = "ChannelReady";
                        break;
                    }
                    if (negotiating)
                        state.channel.state = "NegotiatingFunding";
                    await sleep(2000);
                }
                console.log(kv("channel state", statusText(state.channel.state)));
            }
        }
    }
    saveState(state);
    printReadySummary(state);
}
function printReadySummary(state) {
    console.log("");
    console.log(title("Fiber Dev Kit summary"));
    for (const node of Object.values(state.nodes)) {
        console.log(`  ${title(`node-${node.label}`)}: ${valueText(node.rpcUrl)}${node.pubkey ? ` | ${valueText(node.pubkey)}` : ""}`);
    }
    if (state.channel) {
        console.log(kv("channel", `${statusText(state.channel.state)} | ${valueText(state.channel.amountCkb)} CKB`));
    }
    console.log("");
    console.log(title("Next:"));
    console.log(`  ${commandText("fiber doctor")}`);
    console.log(`  ${commandText("fiber status --watch")}`);
    console.log(`  ${commandText("fiber pay --from a --to b --amount 1")}`);
}
function renderDevkitStatus(state) {
    const lines = [];
    lines.push(kv("Fiber Dev Kit home", valueText(state.devkitDir || devkitDir)));
    for (const node of Object.values(state.nodes || {})) {
        const summary = summarizeNode(node);
        lines.push(`${title(`node-${node.label}`)}: ${summary.online ? statusText("online") : statusText("offline")} | ${label("peers:")} ${valueText(summary.peers)} | ${label("rpc:")} ${valueText(node.rpcUrl)}`);
    }
    const nodeA = state.nodes && state.nodes.a;
    const channels = nodeA ? listChannels(nodeA).channels : [];
    if (state.nodes && state.nodes.a && state.nodes.b) {
        lines.push("");
        lines.push(`${title("channel")} ${valueText("a <-> b")}`);
    }
    if (channels.length === 0) {
        lines.push(`${label("state:")} ${state.channel ? statusText(state.channel.state) : warningText("no channel found")}`);
    }
    else {
        for (const channel of channels.slice(0, 3)) {
            lines.push(`${label("state:")} ${statusText(channelState(channel))}`);
        }
    }
    if (state.lastPayment) {
        lines.push("");
        lines.push(`${label("last payment:")} ${statusText(state.lastPayment.status || "Submitted")} | ${valueText(state.lastPayment.amountCkb)} CKB | ${state.lastPayment.hash ? valueText(state.lastPayment.hash) : warningText("hash unknown")}`);
    }
    return lines.join("\n");
}
async function status(args = []) {
    const opts = parseArgs(args);
    const state = loadState();
    const hasDevkitNodes = Object.keys(state.nodes || {}).length > 0;
    if (opts.watch) {
        if (!hasDevkitNodes) {
            fail("no dev kit state found. Run `fiber start --nodes 2 --channel 200` first.");
        }
        while (true) {
            process.stdout.write("\x1Bc");
            console.log(renderDevkitStatus(loadState()));
            await sleep(2000);
        }
    }
    if (hasDevkitNodes) {
        console.log(renderDevkitStatus(state));
        return;
    }
    const pidFile = path.join(runtimeDir, "fnn.pid");
    const pid = readPid(pidFile);
    const rpcUrl = currentRpcUrl();
    console.log(kv("Fiber home", valueText(runtimeDir)));
    console.log(kv("Process", isRunning(pid) ? `${statusText("running")} ${dim(`(${pid})`)}` : statusText("not running")));
    console.log(kv("RPC", (await rpcPortOpen(rpcUrl)) ? `${statusText("ready")} at ${valueText(rpcUrl)}` : `${statusText("not ready")} at ${valueText(rpcUrl)}`));
}
function addCheck(checks, status, name, detail = null, suggestion = null) {
    checks.push({ status, name, detail, suggestion });
}
function printChecks(checks) {
    for (const check of checks) {
        const mark = statusText(check.status.padEnd(4, " "));
        console.log(`${mark} ${title(check.name)}${check.detail ? ` ${dim("-")} ${check.status === "FAIL" ? errorText(check.detail) : valueText(check.detail)}` : ""}`);
        if (check.suggestion && check.status !== "OK")
            console.log(`     ${label("suggestion:")} ${warningText(check.suggestion)}`);
    }
}
function addDuplicateNodeFileCheck(checks, nodes, name, fileForNode, badStatus, suggestion) {
    const byHash = new Map();
    for (const node of Object.values(nodes || {})) {
        const hash = fileHash(fileForNode(node));
        if (!hash)
            continue;
        const labels = byHash.get(hash) || [];
        labels.push(`node-${node.label}`);
        byHash.set(hash, labels);
    }
    const duplicates = [...byHash.values()].filter((labels) => labels.length > 1);
    if (duplicates.length === 0) {
        addCheck(checks, "OK", name, "unique");
        return;
    }
    addCheck(checks, badStatus, name, duplicates.map((labels) => labels.join(" = ")).join("; "), suggestion);
}
async function doctor() {
    const checks = [];
    const state = loadState();
    const nodes = state.nodes || {};
    const fnnVersion = commandVersion(binPath("fnn"), ["--version"]);
    addCheck(checks, fnnVersion.ok ? "OK" : "FAIL", "fnn installed", fnnVersion.text || "missing bundled binary");
    const cliVersion = commandVersion(binPath("fnn-cli"), ["--version"]);
    addCheck(checks, cliVersion.ok ? "OK" : "FAIL", "fnn-cli installed", cliVersion.text || "missing bundled binary");
    const ckbCli = commandVersion("ckb-cli", ["--version"]);
    addCheck(checks, ckbCli.ok ? "OK" : "WARN", "ckb-cli installed", ckbCli.text || "not found in PATH", "install ckb-cli if you want wallet funding checks from the terminal");
    if (Object.keys(nodes).length > 1) {
        addDuplicateNodeFileCheck(checks, nodes, "CKB runtime keys unique", (node) => path.join(node.ckbDir, "key"), "FAIL", "regenerate one node's ckb/key or start each node with a separate --ckb-base-dir");
        addDuplicateNodeFileCheck(checks, nodes, "Fiber node keys unique", (node) => path.join(node.fiberDir, "sk"), "FAIL", "regenerate one node's fiber/sk or start each node with a separate --fiber-base-dir");
        addDuplicateNodeFileCheck(checks, nodes, "exported CKB keys unique", (node) => path.join(node.ckbDir, "exported-key"), "WARN", "delete the stale exported-key and re-export the matching local dev key before using ckb-cli --privkey-path");
    }
    for (const label of ["a", "b"]) {
        const node = nodes[label];
        if (!node) {
            addCheck(checks, "WARN", `Node${label === "a" ? "1" : "2"} RPC alive`, "node state not found", "run `fiber start --nodes 2 --channel 200`");
            continue;
        }
        const rpcReady = await rpcPortOpen(node.rpcUrl);
        const info = rpcReady ? cliJson(node.rpcUrl, ["info"]) : { ok: false };
        addCheck(checks, info.ok ? "OK" : "FAIL", `Node${label === "a" ? "1" : "2"} RPC alive`, node.rpcUrl, `check ${node.logFile}`);
    }
    if (nodes.b && nodes.b.peerAddress && /\/ip4\/|\/ip6\/|\/dns/.test(nodes.b.peerAddress) && nodes.b.peerAddress.includes("/p2p/")) {
        addCheck(checks, "OK", "Node2 peer address valid", nodes.b.peerAddress);
    }
    else {
        addCheck(checks, "WARN", "Node2 peer address valid", "peer address not discovered", "restart with `fiber start --nodes 2` or check node-b logs");
    }
    const ckbRpcUrl = process.env.CKB_NODE_RPC_URL || defaultCkbRpcUrl;
    const tip = await jsonRpc(ckbRpcUrl, "get_tip_header");
    addCheck(checks, tip.ok ? "OK" : "WARN", "CKB RPC healthy", ckbRpcUrl, tip.ok ? null : tip.error);
    const fundingStatuses = [];
    for (const label of ["a", "b"]) {
        const node = nodes[label];
        if (!node)
            continue;
        const status = await fundingStatus(node);
        fundingStatuses.push(status);
        if (!status.ok) {
            addCheck(checks, "WARN", `node-${label} wallet funded`, status.reason, `run \`fiber accounts --node ${label}\` after the node RPC is online`);
            continue;
        }
        const funded = status.shannons > 0n;
        addCheck(checks, funded ? "OK" : "FAIL", `node-${label} wallet funded`, formatCapacity(status.capacity.capacity), fundingAction(status, label));
    }
    const fundingArgs = new Map();
    for (const status of fundingStatuses.filter((item) => item.ok)) {
        const args = status.fundingLock && status.fundingLock.args;
        if (!args)
            continue;
        const labels = fundingArgs.get(args) || [];
        labels.push(`node-${status.node.label}`);
        fundingArgs.set(args, labels);
    }
    const duplicatedFundingLocks = [...fundingArgs.values()].filter((labels) => labels.length > 1);
    if (fundingStatuses.filter((item) => item.ok).length > 1) {
        addCheck(checks, duplicatedFundingLocks.length ? "FAIL" : "OK", "running funding locks unique", duplicatedFundingLocks.length ? duplicatedFundingLocks.map((labels) => labels.join(" = ")).join("; ") : "unique", "restart nodes with separate --ckb-base-dir values");
    }
    const channelRows = [];
    const channelListFailures = [];
    for (const node of Object.values(nodes)) {
        const channelResult = listChannels(node, { includeClosed: true });
        const pendingResult = listChannels(node, { onlyPending: true });
        if (!channelResult.ok && !pendingResult.ok) {
            channelListFailures.push(`node-${node.label}`);
            continue;
        }
        for (const channel of [...(channelResult.channels || []), ...(pendingResult.channels || [])]) {
            channelRows.push({ node, channel });
        }
    }
    if (channelRows.length === 0 && channelListFailures.length > 0) {
        addCheck(checks, "WARN", "stale channels detected", `could not list channels for ${channelListFailures.join(", ")}`, "make sure node RPC is alive");
    }
    else {
        const allChannels = channelRows.map((row) => row.channel);
        const ready = allChannels.filter((channel) => textContains(channel, /ChannelReady/i));
        const stale = allChannels.filter((channel) => textContains(channel, /Abandoned|Failed|Closed|FUNDING_ABORTED/i));
        addCheck(checks, ready.length ? "OK" : "WARN", "ready channels detected", ready.length ? `${ready.length} ready channel record(s)` : "none");
        addCheck(checks, stale.length ? "WARN" : "OK", "stale channels detected", stale.length ? `${stale.length} stale channel(s)` : "none");
        const fundingAborted = channelRows.find((row) => textContains(row.channel, /FUNDING_ABORTED|Funding transaction aborted|Funding tx rejected/i));
        if (fundingAborted) {
            addCheck(checks, ready.length ? "WARN" : "FAIL", ready.length ? "historical channel funding aborted" : "channel funding aborted", `${channelFailureDetail(fundingAborted.channel) || "funding aborted"} on node-${fundingAborted.node.label}`, ready.length ? "old aborted channel found; current ready channels are usable" : "check `fiber balance`, duplicate keys, and node CKB funding before retrying");
        }
        else {
            addCheck(checks, "OK", "channel funding aborted", "none");
        }
        const stuck = channelRows.find((row) => textContains(row.channel, /NegotiatingFunding/i));
        if (stuck) {
            addCheck(checks, "FAIL", "channel stuck in NegotiatingFunding", `pending funding negotiation on node-${stuck.node.label}`, "reset node state or wait for funding confirmation");
        }
        else {
            addCheck(checks, "OK", "channel stuck in NegotiatingFunding", "none");
        }
    }
    printChecks(checks);
}
function inspect() {
    const state = loadState();
    if (!state.nodes || !state.nodes.a || !state.nodes.b) {
        fail("no two-node dev kit state found. Run `fiber start --nodes 2 --channel 200` first.");
    }
    console.log(title("Fiber Dev Kit Inspector"));
    console.log("");
    console.log(title("Topology"));
    console.log(`  ${title("node-a")} ${state.channel ? successText("---") : dim("-.-")} ${title("node-b")}`);
    console.log("");
    console.log(renderDevkitStatus(state));
    console.log("");
    console.log(title("Failure hints"));
    if (state.channel && state.channel.state === "NegotiatingFunding") {
        console.log(`  ${warningText("channel is still negotiating funding")}`);
        console.log(`  ${label("fix:")} wait for funding confirmation or reset node state`);
    }
    else if (state.channel && state.channel.state === "OpenFailed") {
        console.log(`  ${errorText("channel open failed:")} ${state.channel.error || "unknown error"}`);
        console.log(`  ${label("fix:")} run ${commandText("fiber doctor")} and confirm wallet funding`);
    }
    else {
        console.log(`  ${successText("no obvious failure recorded")}`);
    }
}
function looksLikeEncodedInvoice(value) {
    return typeof value === "string" && /^fib[bdt][a-z0-9]{20,}$/i.test(value.trim());
}
function extractInvoice(value) {
    if (value && typeof value === "object" && looksLikeEncodedInvoice(value.invoice_address)) {
        return value.invoice_address.trim();
    }
    if (typeof value === "string") {
        const match = value.match(/\bfib[bdt][a-z0-9]{20,}\b/i);
        return match ? match[0] : null;
    }
    const found = findNested(value, looksLikeEncodedInvoice);
    return found ? found.trim() : null;
}
function extractPaymentHash(value) {
    return findNested(value, (item) => typeof item === "string" && /^(0x)?[0-9a-f]{64}$/i.test(item)) || null;
}
function connectExternal(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const node = nodeByLabel(state, opts.node || "a");
    const address = opts.address ? normalizeMultiaddr(opts.address) : null;
    const pubkey = (opts.pubkey || opts.peer) ? normalizePubkey(opts.pubkey || opts.peer, "--pubkey") : null;
    const savePeer = opts.save !== "false" && !opts["no-save"];
    if (!address && !pubkey) {
        fail("missing peer target. Usage: fiber connect --node a --address <multiaddr> or --pubkey <peer-pubkey>");
    }
    const cliArgs = ["peer", "connect_peer"];
    if (address)
        cliArgs.push("--address", address);
    if (pubkey)
        cliArgs.push("--pubkey", pubkey);
    if (pubkey && !address && opts["addr-type"])
        cliArgs.push("--addr-type", opts["addr-type"]);
    cliArgs.push("--save", String(savePeer));
    if (opts["dry-run"]) {
        console.log(formatCliCommand(node.rpcUrl, cliArgs));
        return;
    }
    console.log(`${warningText("Connecting")} ${title(`node-${node.label}`)} to external peer`);
    const result = cliText(node.rpcUrl, cliArgs);
    state.externalPeers = state.externalPeers || [];
    const record = {
        at: new Date().toISOString(),
        node: node.label,
        address,
        pubkey,
        save: savePeer,
        status: result.ok ? "Connected" : "ConnectFailed"
    };
    if (!result.ok)
        record.error = commandError(result);
    state.externalPeers.push(record);
    saveState(state);
    if (!result.ok) {
        fail(`connect failed: ${record.error}`);
    }
    console.log(kv("connected", title(`node-${node.label}`)));
    if (address)
        console.log(kv("address", valueText(address)));
    if (pubkey)
        console.log(kv("pubkey", valueText(pubkey)));
}
function disconnectPeer(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const node = nodeByLabel(state, opts.node || "a");
    const pubkey = normalizePubkey(opts.pubkey || opts.peer, "--pubkey");
    const cliArgs = ["peer", "disconnect_peer", "--pubkey", pubkey];
    if (opts["dry-run"]) {
        console.log(formatCliCommand(node.rpcUrl, cliArgs));
        return;
    }
    const result = cliText(node.rpcUrl, cliArgs);
    if (!result.ok) {
        fail(`disconnect failed: ${commandError(result)}`);
    }
    console.log(`${successText("Disconnected")} ${valueText(pubkey)} from ${title(`node-${node.label}`)}`);
}
function peerCommand(args) {
    const [subcommand, ...rest] = args;
    switch (subcommand) {
        case "disconnect":
            disconnectPeer(rest);
            break;
        default:
            fail("unknown peer command. Usage: fiber peer disconnect --node a --pubkey <peer-pubkey>");
    }
}
function replaceMultiaddrHost(address, host) {
    const trimmed = host.trim();
    let prefix = `/dns4/${trimmed}`;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed))
        prefix = `/ip4/${trimmed}`;
    if (trimmed.includes(":"))
        prefix = `/ip6/${trimmed}`;
    return address.replace(/^\/(ip4|ip6|dns4|dns6)\/[^/]+/, prefix);
}
function isPrivateShareAddress(address) {
    return /\/ip4\/(0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(address)
        || /\/ip6\/(::|::1)/.test(address);
}
function addressCommand(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const node = nodeByLabel(state, opts.node || "a");
    const rawAddress = parsePeerAddressFromLog(node.logFile) || node.peerAddress || null;
    if (!rawAddress) {
        fail(`node-${node.label} peer address is not available yet. Start the node, then retry.`);
    }
    const address = opts.host ? replaceMultiaddrHost(rawAddress, String(opts.host)) : rawAddress;
    console.log(title(`node-${node.label} peer address`));
    console.log(kv("address", valueText(address)));
    if (isPrivateShareAddress(address)) {
        console.log(kv("warning", warningText("this address is local/private. Use --host <public-ip-or-domain> before sharing with a remote peer.")));
    }
}
function channelOpenAmount(opts) {
    if (opts.amount !== undefined) {
        return { amount: toShannons(opts.amount), amountCkb: String(opts.amount), source: "--amount" };
    }
    if (opts.shannons !== undefined) {
        const amount = normalizePositiveInteger(opts.shannons, "--shannons");
        return { amount, amountCkb: fromShannons(amount), source: "--shannons" };
    }
    if (opts["funding-amount"] !== undefined) {
        const amount = normalizePositiveInteger(opts["funding-amount"], "--funding-amount");
        return { amount, amountCkb: fromShannons(amount), source: "--funding-amount" };
    }
    fail("missing channel amount. Usage: fiber channel open --node a --peer <pubkey> --amount 200");
}
async function openChannel(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const node = nodeByLabel(state, opts.node || opts.from || "a");
    const peerPubkey = normalizePubkey(opts.peer || opts.pubkey, "--peer");
    const amountInfo = channelOpenAmount(opts);
    const waitSeconds = opts.wait === undefined ? 0 : optionInt(opts, "wait", 180);
    const cliArgs = [
        "channel", "open_channel",
        "--pubkey", peerPubkey,
        "--funding-amount", amountInfo.amount
    ];
    if (opts.public !== undefined)
        cliArgs.push("--public", String(opts.public));
    if (opts["one-way"] !== undefined)
        cliArgs.push("--one-way", String(opts["one-way"]));
    if (opts["funding-fee-rate"] !== undefined)
        cliArgs.push("--funding-fee-rate", String(opts["funding-fee-rate"]));
    if (opts["commitment-fee-rate"] !== undefined)
        cliArgs.push("--commitment-fee-rate", String(opts["commitment-fee-rate"]));
    if (opts["dry-run"]) {
        console.log(formatCliCommand(node.rpcUrl, cliArgs));
        return;
    }
    const managedPeer = findManagedNodeByPubkey(state, peerPubkey, node.label);
    if (!opts["skip-balance-check"]) {
        const funding = await checkChannelFunding(node, amountInfo.amount);
        if (!funding.ok) {
            fail(`refusing to open channel before funding is ready: ${funding.message} Use --skip-balance-check to bypass this preflight.`);
        }
        if (managedPeer && opts["one-way"] !== "true") {
            const peerFunding = await checkNodeFunded(managedPeer, "collaborate on channel funding");
            if (!peerFunding.ok) {
                saveState(state);
                fail(`refusing to open channel before peer funding is ready: ${peerFunding.message} Use --skip-balance-check to bypass this preflight.`);
            }
        }
    }
    console.log(`${warningText("Opening channel")} from ${title(`node-${node.label}`)} to ${valueText(peerPubkey)}`);
    console.log(kv("amount", `${valueText(amountInfo.amountCkb)} CKB`));
    const result = cliJson(node.rpcUrl, cliArgs);
    const record = {
        at: new Date().toISOString(),
        node: node.label,
        peerPubkey,
        amount: amountInfo.amount,
        amountCkb: amountInfo.amountCkb,
        amountSource: amountInfo.source,
        status: result.ok ? "Opening" : "OpenFailed",
        temporaryChannelId: result.ok ? extractChannelId(result.json) : null
    };
    state.externalChannels = state.externalChannels || [];
    if (!result.ok)
        record.error = commandError(result);
    state.externalChannels.push(record);
    saveState(state);
    if (!result.ok) {
        fail(`channel open failed: ${record.error}`);
    }
    if (record.temporaryChannelId)
        console.log(kv("temporary channel id", valueText(record.temporaryChannelId)));
    console.log(kv("channel", statusText("Opening")));
    if (waitSeconds > 0) {
        const openerPubkey = managedPeer ? liveNodePubkey(node) : null;
        const checks = [{ label: `node-${node.label}`, node, peerPubkey }];
        if (managedPeer && openerPubkey) {
            checks.push({ label: `node-${managedPeer.label}`, node: managedPeer, peerPubkey: openerPubkey });
        }
        const ready = checks.length > 1
            ? await waitForChannelReadyOnNodes(checks, waitSeconds * 1000)
            : await waitForChannelReady(node, peerPubkey, waitSeconds * 1000);
        record.status = ready.ok ? "ChannelReady" : ready.state;
        saveState(state);
        console.log(kv("channel", statusText(record.status)));
        if (ready.states) {
            for (const [label, state] of Object.entries(ready.states)) {
                console.log(kv(`${label} view`, statusText(String(state))));
            }
        }
    }
}
function printChannelList(node, channels) {
    console.log(`${title(`node-${node.label}`)}: ${valueText(channels.length)} channel(s)`);
    channels.forEach((channel, index) => {
        const id = extractChannelId(channel);
        console.log(`${valueText(`${index + 1}.`)} ${statusText(channelState(channel))}${id ? ` | ${valueText(id)}` : ""}`);
        const failure = channelFailureDetail(channel);
        if (failure)
            console.log(`   ${label("failure:")} ${warningText(failure)}`);
        if (isSyntheticFailedOpening(channel)) {
            console.log(`   ${label("note:")} ${dim("historical failed opening; no active channel exists to close")}`);
        }
    });
}
function listChannelCommand(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const node = nodeByLabel(state, opts.node || "a");
    const peerPubkey = (opts.peer || opts.pubkey) ? normalizePubkey(opts.peer || opts.pubkey, "--peer") : null;
    const result = listChannels(node, {
        pubkey: peerPubkey,
        includeClosed: Boolean(opts.closed || opts["include-closed"]),
        onlyPending: Boolean(opts.pending || opts["only-pending"])
    });
    if (!result.ok) {
        fail(`channel list failed: ${commandError(result)}`);
    }
    if (opts.json) {
        console.log(JSON.stringify(result.channels, null, 2));
        return;
    }
    printChannelList(node, result.channels);
}
async function channelCommand(args) {
    const [subcommand, ...rest] = args;
    switch (subcommand) {
        case "open":
            await openChannel(rest);
            break;
        case "list":
            listChannelCommand(rest);
            break;
        default:
            fail("unknown channel command. Usage: fiber channel open --node a --peer <pubkey> --amount 200");
    }
}
async function pay(args) {
    const opts = parseArgs(args);
    const state = loadState();
    const from = nodeByLabel(state, opts.from || "a");
    const to = nodeByLabel(state, opts.to || "b");
    const amount = toShannons(opts.amount || "1");
    const amountCkb = fromShannons(amount);
    const currency = opts.currency || "Fibt";
    console.log(`${warningText("Creating invoice")} on ${title(`node-${to.label}`)} for ${valueText(amountCkb)} CKB`);
    const invoiceResult = cliJson(to.rpcUrl, [
        "invoice", "new_invoice",
        "--amount", amount,
        "--currency", currency,
        "--description", `fiber-dev-kit payment ${amountCkb} CKB`
    ]);
    if (!invoiceResult.ok) {
        fail(`invoice creation failed: ${(invoiceResult.stderr || invoiceResult.stdout).trim()}`);
    }
    const invoice = extractInvoice(invoiceResult.json) || extractInvoice(invoiceResult.stdout);
    if (!invoice) {
        fail("invoice creation succeeded but no encoded invoice was found in the response");
    }
    console.log(`${warningText("Paying invoice")} from ${title(`node-${from.label}`)}`);
    const payResult = cliJson(from.rpcUrl, [
        "payment", "send_payment",
        "--invoice", invoice,
        "--timeout", String(optionInt(opts, "timeout", 60))
    ]);
    if (!payResult.ok) {
        fail(`payment failed: ${(payResult.stderr || payResult.stdout).trim()}`);
    }
    const hash = extractPaymentHash(payResult.json) || extractPaymentHash(payResult.stdout);
    state.lastPayment = {
        at: new Date().toISOString(),
        from: from.label,
        to: to.label,
        amount,
        amountCkb,
        hash,
        status: "Submitted"
    };
    const deadline = Date.now() + optionInt(opts, "wait", 60) * 1000;
    while (hash && Date.now() < deadline) {
        const payment = cliJson(from.rpcUrl, ["payment", "get_payment", "--payment-hash", hash]);
        const status = payment.ok ? paymentStatus(payment.json) : null;
        if (status && /Success|Succeeded/i.test(status)) {
            state.lastPayment.status = "Success";
            break;
        }
        if (status && /Failed/i.test(status)) {
            state.lastPayment.status = "Failed";
            break;
        }
        await sleep(2000);
    }
    saveState(state);
    console.log(kv("payment", statusText(state.lastPayment.status)));
    if (hash)
        console.log(kv("hash", valueText(hash)));
}
function stopNodeProcess(node) {
    const pid = readPid(node.pidFile);
    if (!isRunning(pid)) {
        fs.rmSync(node.pidFile, { force: true });
        return false;
    }
    process.kill(pid, "SIGTERM");
    fs.rmSync(node.pidFile, { force: true });
    return true;
}
function stop(args = []) {
    const opts = parseArgs(args);
    if (opts.all || opts.devkit) {
        const state = loadState();
        let stopped = 0;
        for (const node of Object.values(state.nodes || {})) {
            if (stopNodeProcess(node))
                stopped += 1;
        }
        console.log(stopped ? `${successText("Stopped")} ${valueText(stopped)} Fiber Dev Kit node(s)` : warningText("No Fiber Dev Kit nodes are running"));
        return;
    }
    const pidFile = path.join(runtimeDir, "fnn.pid");
    const pid = readPid(pidFile);
    if (!isRunning(pid)) {
        fs.rmSync(pidFile, { force: true });
        console.log(warningText("No Fiber node is running"));
        return;
    }
    process.kill(pid, "SIGTERM");
    fs.rmSync(pidFile, { force: true });
    console.log(`${successText("Stopped Fiber node")} ${dim(`(${pid})`)}`);
}
async function main() {
    const [command, ...args] = process.argv.slice(2);
    await loadChalk();
    ensureMode(binPath("fnn"), 0o755);
    ensureMode(binPath("fnn-cli"), 0o755);
    if (!command || command === "help" || command === "--help" || command === "-h") {
        usage();
        return;
    }
    switch (command) {
        case "version":
            version();
            break;
        case "doctor":
            await doctor();
            break;
        case "start":
            if (args.some((arg) => arg === "--nodes" || arg.startsWith("--nodes="))) {
                await startDevKit(args);
            }
            else {
                await startNode(args);
            }
            break;
        case "connect":
            connectExternal(args);
            break;
        case "peer":
            peerCommand(args);
            break;
        case "address":
            addressCommand(args);
            break;
        case "channel":
            await channelCommand(args);
            break;
        case "pay":
            await pay(args);
            break;
        case "accounts":
            await accounts(args);
            break;
        case "balance":
            await balance(args);
            break;
        case "keys":
            exportKeys(args);
            break;
        case "inspect":
            inspect();
            break;
        case "node":
            runNode(args);
            break;
        case "cli":
            runCli(args);
            break;
        case "status":
            await status(args);
            break;
        case "stop":
            stop(args);
            break;
        default:
            fail(`unknown command: ${command}`);
    }
}
main();
