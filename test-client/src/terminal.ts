import { Chalk } from "chalk";
import type { ChalkInstance } from "chalk";
import type { Diagnosis } from "@fiber-dev-kit/core";
import type { RouteConfidenceReport } from "./test-client";
import type { SimulationResult } from "./network";

export interface TerminalFormatOptions {
  color?: boolean;
  width?: number;
}

const DEFAULT_WIDTH = 72;

export function formatRouteConfidenceReport(
  report: RouteConfidenceReport,
  options: TerminalFormatOptions = {},
): string {
  const out = new TerminalFormatter(options);
  out.section("Route Confidence");
  out.rows([
    ["Can pay", report.canPay ? "yes" : "no"],
    ["Score", `${report.score}/100`],
    ["Level", report.level],
    ["Dry-run", report.dryRunPayment ? `accepted (${report.dryRunPayment.status})` : "rejected"],
  ]);
  out.list("Reasons", report.reasons);
  out.list("Suggestions", report.suggestions);
  if (report.diagnosis) out.diagnosis(report.diagnosis);
  return out.toString();
}

export function formatSimulationResult(
  title: string,
  result: SimulationResult,
  options: TerminalFormatOptions = {},
): string {
  const out = new TerminalFormatter(options);
  out.section(title);
  out.status(result.payment ? "INFO" : "FAIL", result.payment ? "Payment attempt returned a payment record." : "Payment attempt failed before submission.");
  if (result.payment) {
    out.rows([
      ["Payment", result.payment.payment_hash],
      ["Status", result.payment.status],
      ["Fee", result.payment.fee],
    ]);
  }
  if (result.diagnosis) out.diagnosis(result.diagnosis);
  return out.toString();
}

export function formatDiagnosis(diagnosis: Diagnosis, options: TerminalFormatOptions = {}): string {
  const out = new TerminalFormatter(options);
  out.diagnosis(diagnosis);
  return out.toString();
}

class TerminalFormatter {
  private readonly chalk: ChalkInstance;
  private readonly width: number;
  private readonly lines: string[] = [];

  constructor(options: TerminalFormatOptions) {
    const color = options.color ?? Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
    this.chalk = new Chalk({ level: color ? 1 : 0 });
    this.width = options.width ?? DEFAULT_WIDTH;
  }

  section(title: string): void {
    this.lines.push("");
    this.lines.push(this.chalk.bold(title));
    this.lines.push(this.chalk.dim("-".repeat(Math.min(title.length, this.width))));
  }

  status(kind: "PASS" | "FAIL" | "SKIP" | "INFO", message: string): void {
    this.lines.push(`  ${this.badge(kind)} ${message}`);
  }

  rows(rows: Array<[string, string]>, labelWidth = 14): void {
    for (const [label, value] of rows) {
      this.lines.push(`  ${this.chalk.dim(label.padEnd(labelWidth))} ${value}`);
    }
  }

  list(title: string, items: string[]): void {
    if (items.length === 0) return;
    this.lines.push("");
    this.lines.push(`  ${this.chalk.bold(title)}`);
    for (const item of items) {
      this.lines.push(`  - ${item}`);
    }
  }

  diagnosis(diagnosis: Diagnosis): void {
    this.lines.push("");
    this.lines.push(`  ${this.chalk.bold("Diagnosis")}`);
    this.rows(
      [
        ["Code", this.chalk.bold(diagnosis.code)],
        ["Summary", diagnosis.summary],
        ["Suggestion", diagnosis.suggestion],
      ],
      12,
    );
  }

  toString(): string {
    return this.lines.join("\n");
  }

  private badge(kind: "PASS" | "FAIL" | "SKIP" | "INFO"): string {
    const text = `[${kind}]`;
    if (kind === "PASS") return this.chalk.green(text);
    if (kind === "FAIL") return this.chalk.red(text);
    if (kind === "SKIP") return this.chalk.yellow(text);
    return this.chalk.cyan(text);
  }
}
