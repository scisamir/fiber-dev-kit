#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
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
const platformKey = `${process.platform}-${process.arch}`;

function fail(message) {
  console.error(`fiber: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  fiber version
  fiber start [--background|-b] [--dry-run] [-- FNN_ARGS...]
  fiber node [FNN_ARGS...]
  fiber cli [FNN_CLI_ARGS...]
  fiber status
  fiber stop

Environment:
  FIBER_HOME                 Runtime directory. Default: ~/.fiber-node
  FIBER_RPC_URL              RPC URL to start/connect to. Default: ${defaultRpcUrl}
  FIBER_CONFIG_TEMPLATE      Bundled config name or config file path. Default: ${defaultConfigTemplate}
  FIBER_SECRET_KEY_PASSWORD  Key password. Default: ${defaultPassword}`);
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
  } catch (_) {
    // Best effort. npm normally preserves executable bits.
  }
}

function configTemplatePath() {
  const template = process.env.FIBER_CONFIG_TEMPLATE || defaultConfigTemplate;
  const candidates = [];

  if (path.isAbsolute(template)) {
    candidates.push(template);
  } else {
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
  } catch (_) {
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
  } catch (_) {
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
    console.log(`${fnn} ${finalArgs.map((arg) => JSON.stringify(arg)).join(" ")}`);
    console.log(`FIBER_HOME=${runtimeDir}`);
    console.log(`FIBER_RPC_URL=${rpc.endpoint.url}`);
    return;
  }

  fs.writeFileSync(rpcUrlFile, `${rpc.endpoint.url}\n`);

  if (!background) {
    console.log(`fiber: RPC will listen at ${rpc.endpoint.url}`);
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
  console.log(`Started Fiber node`);
  console.log(`  pid: ${child.pid}`);
  console.log(`  rpc: ${rpc.endpoint.url}`);
  console.log(`  log: ${logFile}`);
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
  } catch (_) {
    return null;
  }
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function rpcPortOpen(url) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
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

async function status() {
  const pidFile = path.join(runtimeDir, "fnn.pid");
  const pid = readPid(pidFile);
  const rpcUrl = currentRpcUrl();
  console.log(`Fiber home: ${runtimeDir}`);
  console.log(`Process: ${isRunning(pid) ? `running (${pid})` : "not running"}`);
  console.log(`RPC: ${(await rpcPortOpen(rpcUrl)) ? `ready at ${rpcUrl}` : `not ready at ${rpcUrl}`}`);
}

function stop() {
  const pidFile = path.join(runtimeDir, "fnn.pid");
  const pid = readPid(pidFile);
  if (!isRunning(pid)) {
    fs.rmSync(pidFile, { force: true });
    console.log("No Fiber node is running");
    return;
  }
  process.kill(pid, "SIGTERM");
  fs.rmSync(pidFile, { force: true });
  console.log(`Stopped Fiber node (${pid})`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
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
    case "start":
      await startNode(args);
      break;
    case "node":
      runNode(args);
      break;
    case "cli":
      runCli(args);
      break;
    case "status":
      await status();
      break;
    case "stop":
      stop();
      break;
    default:
      fail(`unknown command: ${command}`);
  }
}

main();
