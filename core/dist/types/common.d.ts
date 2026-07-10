/** A `0x`-prefixed hex string, as returned by FNN's JSON-RPC for hashes, pubkeys, and amounts. */
export type HexString = `0x${string}`;
/** A CKB script (lock or type). */
export interface Script {
    code_hash: HexString;
    hash_type: "type" | "data" | "data1" | "data2";
    args: HexString;
}
/** Human-readable CKB amount, as accepted by the ergonomic client methods (converted to shannon hex on the wire). */
export type Ckb = number;
