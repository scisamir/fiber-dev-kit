import type { HexString, Script } from "./common";

export interface OpenChannelParams {
  /** Pubkey of the peer to open a channel with. The peer must already be connected via `connectPeer`. */
  pubkey: HexString;
  /** Funding amount in shannons (hex) or CKB (number) — ergonomic methods accept CKB and convert. */
  fundingAmount: HexString;
  /** Broadcast to the network so it can forward TLCs. Default: true. */
  public?: boolean;
  /** One-way channel: not broadcast, can only send payments in one direction. Default: false. */
  oneWay?: boolean;
  fundingUdtTypeScript?: Script;
  shutdownScript?: Script;
  commitmentDelayEpoch?: HexString;
  commitmentFeeRate?: HexString;
  fundingFeeRate?: HexString;
  tlcExpiryDelta?: HexString;
  tlcMinValue?: HexString;
  tlcFeeProportionalMillionths?: HexString;
  maxTlcValueInFlight?: HexString;
  maxTlcNumberInFlight?: HexString;
}

export interface OpenChannelResult {
  temporary_channel_id: HexString;
}

export interface AcceptChannelParams {
  temporaryChannelId: HexString;
  fundingAmount: HexString;
  shutdownScript?: Script;
  maxTlcValueInFlight?: HexString;
}

export interface AcceptChannelResult {
  channel_id: HexString;
}

export interface ListChannelsParams {
  pubkey?: HexString;
  includeClosed?: boolean;
  onlyPending?: boolean;
}

/**
 * PascalCase per FNN's serde convention, confirmed live via `ChannelReady`. The pending
 * states are named per `list_channels --only-pending`'s help text ("negotiating,
 * collaborating on funding tx, signing, awaiting tx signatures, awaiting channel ready").
 */
export type ChannelState =
  | "NegotiatingFunding"
  | "CollaboratingFundingTx"
  | "SigningCommitment"
  | "AwaitingTxSignatures"
  | "AwaitingChannelReady"
  | "ChannelReady"
  | "ShuttingDown"
  | "Closed";

/**
 * `list_channels` entry. `channel_id`, `channel_outpoint`, `state.state_name`,
 * `local_balance`, and `remote_balance` are confirmed against a real funded testnet
 * channel; the rest mirror `open_channel`'s snake_case parameter surface and should be
 * spot-checked as they come up.
 */
export interface Channel {
  channel_id: HexString;
  channel_outpoint: HexString;
  latest_commitment_transaction_hash?: HexString;
  peer_id?: HexString;
  state: { state_name: ChannelState; state_flags?: string[] };
  local_balance: HexString;
  remote_balance: HexString;
  offered_tlc_balance?: HexString;
  received_tlc_balance?: HexString;
  is_public?: boolean;
  funding_udt_type_script?: Script;
  created_at?: HexString;
}

export interface ListChannelsResult {
  channels: Channel[];
}

export interface AbandonChannelParams {
  channelId: HexString;
}

export interface ShutdownChannelParams {
  channelId: HexString;
  closeScript?: Script;
  feeRate?: HexString;
  force?: boolean;
}

export interface UpdateChannelParams {
  channelId: HexString;
  enabled?: boolean;
  tlcExpiryDelta?: HexString;
  tlcMinimumValue?: HexString;
  tlcFeeProportionalMillionths?: HexString;
}
