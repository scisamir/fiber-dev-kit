import type { HexString } from "./types/common";
/** Converts a human-readable CKB amount to a hex-encoded shannon amount, as FNN's RPC expects. */
export declare function ckbToShannonHex(ckb: number): HexString;
/** Converts a hex-encoded shannon amount from the RPC into a human-readable CKB amount. */
export declare function shannonHexToCkb(hex: HexString): number;
/** Formats a hex-encoded shannon amount for display, e.g. `formatAmount("0x5F5E10000", "CKB")` → `"100 CKB"`. */
export declare function formatAmount(hex: HexString, unit?: "CKB" | "shannon"): string;
export declare function toHex(value: bigint | number): HexString;
export declare function fromHex(hex: HexString): bigint;
