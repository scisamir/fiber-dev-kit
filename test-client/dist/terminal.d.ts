import type { Diagnosis } from "@fiber-dev-kit/core";
import type { RouteConfidenceReport } from "./test-client";
import type { SimulationResult } from "./network";
export interface TerminalFormatOptions {
    color?: boolean;
    width?: number;
}
export declare function formatRouteConfidenceReport(report: RouteConfidenceReport, options?: TerminalFormatOptions): string;
export declare function formatSimulationResult(title: string, result: SimulationResult, options?: TerminalFormatOptions): string;
export declare function formatDiagnosis(diagnosis: Diagnosis, options?: TerminalFormatOptions): string;
