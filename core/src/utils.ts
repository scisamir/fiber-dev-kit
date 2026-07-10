import type { HexString } from "./types/common";

const SHANNONS_PER_CKB = 100_000_000n;

/** Converts a human-readable CKB amount to a hex-encoded shannon amount, as FNN's RPC expects. */
export function ckbToShannonHex(ckb: number): HexString {
  if (!Number.isFinite(ckb) || ckb < 0) {
    throw new RangeError(`ckbToShannonHex: amount must be a non-negative finite number, got ${ckb}`);
  }
  const shannons = BigInt(Math.round(ckb * Number(SHANNONS_PER_CKB)));
  return toHex(shannons);
}

/** Converts a hex-encoded shannon amount from the RPC into a human-readable CKB amount. */
export function shannonHexToCkb(hex: HexString): number {
  const shannons = fromHex(hex);
  return Number(shannons) / Number(SHANNONS_PER_CKB);
}

/** Formats a hex-encoded shannon amount for display, e.g. `formatAmount("0x5F5E10000", "CKB")` → `"100 CKB"`. */
export function formatAmount(hex: HexString, unit: "CKB" | "shannon" = "CKB"): string {
  if (unit === "shannon") {
    return `${fromHex(hex).toString()} shannon`;
  }
  return `${shannonHexToCkb(hex)} CKB`;
}

export function toHex(value: bigint | number): HexString {
  const big = typeof value === "bigint" ? value : BigInt(value);
  if (big < 0n) {
    throw new RangeError(`toHex: value must be non-negative, got ${big}`);
  }
  return `0x${big.toString(16)}`;
}

export function fromHex(hex: HexString): bigint {
  return BigInt(hex);
}
