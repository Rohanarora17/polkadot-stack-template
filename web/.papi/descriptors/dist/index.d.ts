import { default as stack_template, type Stack_templateWhitelistEntry } from "./stack_template";
export { stack_template };
export type * from "./stack_template";
import { default as bulletin, type BulletinWhitelistEntry } from "./bulletin";
export { bulletin };
export type * from "./bulletin";
import { default as paseo_hub, type Paseo_hubWhitelistEntry } from "./paseo_hub";
export { paseo_hub };
export type * from "./paseo_hub";
export { DigestItem, Phase, DispatchClass, TokenError, ArithmeticError, TransactionalError, BalanceStatus, TransactionPaymentEvent, XcmV5Junctions, XcmV5Junction, XcmV5NetworkId, XcmV3JunctionBodyId, XcmV2JunctionBodyPart, XcmV5Instruction, XcmV3MultiassetFungibility, XcmV3MultiassetAssetInstance, XcmV3MaybeErrorCode, XcmV2OriginKind, XcmV5AssetFilter, XcmV5WildAsset, XcmV2MultiassetWildFungibility, XcmV3WeightLimit, XcmVersionedAssets, XcmV3MultiassetAssetId, XcmV3Junctions, XcmV3Junction, XcmV3JunctionNetworkId, XcmVersionedLocation, UpgradeGoAhead, UpgradeRestriction, BalancesTypesReasons, TransactionPaymentReleases, XcmV3Response, XcmV3TraitsError, XcmV4Response, XcmPalletVersionMigrationStage, XcmVersionedAssetId, MultiAddress, BalancesAdjustmentDirection, XcmVersionedXcm, XcmV3Instruction, XcmV3MultiassetMultiAssetFilter, XcmV3MultiassetWildMultiAsset, XcmV4Instruction, XcmV4AssetAssetFilter, XcmV4AssetWildAsset, TransactionValidityUnknownTransaction, TransactionValidityTransactionSource, XcmVersionedAsset, PreimageEvent, PreimagePalletHoldReason, CommonClaimsEvent, ConvictionVotingVoteAccountVote, PreimagesBounded, ChildBountiesEvent, NominationPoolsPoolState, NominationPoolsCommissionClaimPermission, NominationPoolsClaimPermission, BagsListEvent, StakingRewardDestination, StakingForcing, PreimageOldRequestStatus, PreimageRequestStatus, GovernanceOrigin, WestendRuntimeRuntimeFreezeReason, NominationPoolsPalletFreezeReason, Version, ClaimsStatementKind, TreasuryPaymentState, ConvictionVotingVoteVoting, VotingConviction, TraitsScheduleDispatchTime, ChildBountyStatus, ReferendaTypesCurve, NominationPoolsBondExtra, StakingPalletConfigOpBig, StakingPalletConfigOp, NominationPoolsConfigOp } from './common-types';
export declare const getMetadata: (codeHash: string) => Promise<Uint8Array | null>;
export type WhitelistEntry = Stack_templateWhitelistEntry | BulletinWhitelistEntry | Paseo_hubWhitelistEntry;
export type WhitelistEntriesByChain = Partial<{
    "*": WhitelistEntry[];
    stack_template: WhitelistEntry[];
    bulletin: WhitelistEntry[];
    paseo_hub: WhitelistEntry[];
}>;
