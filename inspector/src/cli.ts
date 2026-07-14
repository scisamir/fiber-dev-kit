#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startInspector } from "./server";
import type { InspectorNodeConfig } from "./server";

interface DevkitStateNode {
  label?: string;
  rpcUrl?: string;
}

interface DevkitState {
  devkitDir?: string;
  nodes?: Record<string, DevkitStateNode>;
}

type ListenError = NodeJS.ErrnoException & {
  address?: string;
  port?: number;
};

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function bold(value: string): string {
  return useColor ? `\x1b[1m${value}\x1b[22m` : value;
}

function terminalLink(label: string, url: string): string {
  return useColor ? `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\` : label;
}

function linkText(value: string): string {
  const label = useColor ? `\x1b[36m${value}\x1b[39m` : value;
  return terminalLink(label, value);
}

function parseArgs(argv: string[]): { nodes: InspectorNodeConfig[]; port?: number; host?: string; statePath?: string } {
  const nodes: InspectorNodeConfig[] = [];
  let port: number | undefined;
  let host: string | undefined;
  let statePath: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
      continue;
    }
    if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
      continue;
    }
    if (arg.startsWith("--state=")) {
      statePath = arg.slice("--state=".length);
      continue;
    }
    const separatorIndex = arg.indexOf("=");
    if (separatorIndex === -1) {
      console.error(`Ignoring unrecognized argument: "${arg}" (expected "id=http://host:port", "--port=NNNN", or "--state=/path/state.json")`);
      continue;
    }
    const id = arg.slice(0, separatorIndex);
    const rpcUrl = arg.slice(separatorIndex + 1);
    nodes.push({ id, rpcUrl });
  }

  return { nodes, port, host, statePath };
}

function defaultStatePath(): string {
  const devkitHome = process.env.FIBER_DEV_KIT_HOME || path.join(os.homedir(), ".fiber-dev-kit");
  return path.join(devkitHome, "state.json");
}

function loadDevkitNodes(statePath = defaultStatePath()): InspectorNodeConfig[] {
  let state: DevkitState;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8")) as DevkitState;
  } catch {
    return [];
  }

  return Object.entries(state.nodes ?? {})
    .map(([id, node]) => ({
      id: node.label ?? id,
      rpcUrl: node.rpcUrl ?? "",
    }))
    .filter((node) => node.rpcUrl.startsWith("http://") || node.rpcUrl.startsWith("https://"))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function usage(): string {
  return [
    "Usage:",
    "  fiber-dev-kit-inspector",
    "  fiber-dev-kit-inspector a=http://127.0.0.1:8227 [b=http://127.0.0.1:8237 ...] [--port=3030] [--host=127.0.0.1]",
    "  fiber-dev-kit-inspector --state=/path/to/state.json [--port=3030] [--host=127.0.0.1]",
    "",
    "No-arg mode reads Fiber Dev Kit state from:",
    `  ${defaultStatePath()}`,
    "",
    "Start managed nodes first with:",
    "  fiber start --nodes 2 --channel 200",
  ].join("\n");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const nodes = parsed.nodes.length > 0 ? parsed.nodes : loadDevkitNodes(parsed.statePath);

  if (nodes.length === 0) {
    console.error(usage());
    process.exit(1);
  }

  const handle = await startInspector({ nodes, port: parsed.port, host: parsed.host });
  const inspectorUrl = `http://${handle.host}:${handle.port}`;
  console.log(`fiber-dev-kit-inspector watching ${nodes.map((n) => `${n.id}=${n.rpcUrl}`).join(", ")}`);
  console.log(`${bold("Open in browser:")} ${linkText(inspectorUrl)}`);

  process.on("SIGINT", () => {
    handle.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  const error = err as ListenError;
  if (error.code === "EADDRINUSE") {
    console.error(`fiber-dev-kit-inspector: port is already in use. Try --port=${Number(error.port || 3030) + 1}.`);
  } else if (error.code === "EACCES" || error.code === "EPERM") {
    console.error(`fiber-dev-kit-inspector: cannot listen on ${error.address ?? "host"}:${error.port ?? "port"} (${error.code}).`);
    console.error("Try a different --port or --host=127.0.0.1.");
  } else {
    console.error(`fiber-dev-kit-inspector: ${(err as Error).message ?? err}`);
  }
  process.exit(1);
});
