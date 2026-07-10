import type { HexString, Script } from "./common";
export interface UdtCellDep {
    type_id?: Script;
    cell_dep?: {
        out_point: {
            tx_hash: HexString;
            index: HexString;
        };
        dep_type: "code" | "dep_group";
    };
}
export interface UdtCfgInfo {
    name: string;
    script: Script;
    auto_accept_amount?: HexString;
    cell_deps: UdtCellDep[];
}
/** Raw `node_info` RPC result. All amount fields are hex-encoded shannons. */
export interface NodeInfo {
    version: string;
    commit_hash: string;
    pubkey: HexString;
    features: string[];
    node_name: string | null;
    addresses: string[];
    chain_hash: HexString;
    open_channel_auto_accept_min_ckb_funding_amount: HexString;
    auto_accept_channel_ckb_funding_amount: HexString;
    default_funding_lock_script: Script;
    tlc_expiry_delta: HexString;
    tlc_min_value: HexString;
    tlc_fee_proportional_millionths: HexString;
    channel_count: HexString;
    pending_channel_count: HexString;
    peers_count: HexString;
    udt_cfg_infos: UdtCfgInfo[];
}
/** Raw `list_peers` RPC result entry. */
export interface PeerInfo {
    pubkey: HexString;
    address: string;
}
export type PeerAddressType = "tcp" | "ws" | "wss";
export interface ConnectPeerParams {
    /** Multiaddr string of the peer. Either `address` or `pubkey` must be provided. */
    address?: string;
    /** Peer pubkey; the node resolves the address from locally synced graph data. */
    pubkey?: HexString;
    /** Whether to persist the peer address to the peer store. */
    save?: boolean;
    addrType?: PeerAddressType;
}
export interface DisconnectPeerParams {
    pubkey: HexString;
}
