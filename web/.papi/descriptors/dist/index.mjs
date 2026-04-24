// .papi/descriptors/src/common.ts
var table = new Uint8Array(128);
for (let i = 0; i < 64; i++) table[i < 26 ? i + 65 : i < 52 ? i + 71 : i < 62 ? i - 4 : i * 4 - 205] = i;
var toBinary = (base64) => {
  const n = base64.length, bytes = new Uint8Array((n - Number(base64[n - 1] === "=") - Number(base64[n - 2] === "=")) * 3 / 4 | 0);
  for (let i2 = 0, j = 0; i2 < n; ) {
    const c0 = table[base64.charCodeAt(i2++)], c1 = table[base64.charCodeAt(i2++)];
    const c2 = table[base64.charCodeAt(i2++)], c3 = table[base64.charCodeAt(i2++)];
    bytes[j++] = c0 << 2 | c1 >> 4;
    bytes[j++] = c1 << 4 | c2 >> 2;
    bytes[j++] = c2 << 6 | c3;
  }
  return bytes;
};

// .papi/descriptors/src/stack_template.ts
var descriptorValues = import("./descriptors-5D57NPAS.mjs").then((module) => module["Stack_template"]);
var metadataTypes = import("./metadataTypes-4X4QMKJA.mjs").then(
  (module) => toBinary("default" in module ? module.default : module)
);
var asset = {};
var extensions = {};
var getMetadata = () => import("./stack_template_metadata-VR46LRFX.mjs").then(
  (module) => toBinary("default" in module ? module.default : module)
);
var genesis = "0x4545454545454545454545454545454545454545454545454545454545454545";
var _allDescriptors = { descriptors: descriptorValues, metadataTypes, asset, extensions, getMetadata, genesis };
var stack_template_default = _allDescriptors;

// .papi/descriptors/src/bulletin.ts
var descriptorValues2 = import("./descriptors-5D57NPAS.mjs").then((module) => module["Bulletin"]);
var metadataTypes2 = import("./metadataTypes-4X4QMKJA.mjs").then(
  (module) => toBinary("default" in module ? module.default : module)
);
var asset2 = {};
var extensions2 = {};
var getMetadata2 = () => import("./bulletin_metadata-6D4OUQ3Y.mjs").then(
  (module) => toBinary("default" in module ? module.default : module)
);
var genesis2 = "0x744960c32e3a3df5440e1ecd4d34096f1ce2230d7016a5ada8a765d5a622b4ea";
var _allDescriptors2 = { descriptors: descriptorValues2, metadataTypes: metadataTypes2, asset: asset2, extensions: extensions2, getMetadata: getMetadata2, genesis: genesis2 };
var bulletin_default = _allDescriptors2;

// .papi/descriptors/src/paseo_hub.ts
var descriptorValues3 = import("./descriptors-5D57NPAS.mjs").then((module) => module["Paseo_hub"]);
var metadataTypes3 = import("./metadataTypes-4X4QMKJA.mjs").then(
  (module) => toBinary("default" in module ? module.default : module)
);
var asset3 = {};
var extensions3 = {};
var getMetadata3 = () => import("./paseo_hub_metadata-G4QNRMZH.mjs").then(
  (module) => toBinary("default" in module ? module.default : module)
);
var genesis3 = "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2";
var _allDescriptors3 = { descriptors: descriptorValues3, metadataTypes: metadataTypes3, asset: asset3, extensions: extensions3, getMetadata: getMetadata3, genesis: genesis3 };
var paseo_hub_default = _allDescriptors3;

// .papi/descriptors/src/common-types.ts
import { _Enum } from "polkadot-api";
var DigestItem = _Enum;
var Phase = _Enum;
var DispatchClass = _Enum;
var TokenError = _Enum;
var ArithmeticError = _Enum;
var TransactionalError = _Enum;
var BalanceStatus = _Enum;
var TransactionPaymentEvent = _Enum;
var XcmV5Junctions = _Enum;
var XcmV5Junction = _Enum;
var XcmV5NetworkId = _Enum;
var XcmV3JunctionBodyId = _Enum;
var XcmV2JunctionBodyPart = _Enum;
var XcmV5Instruction = _Enum;
var XcmV3MultiassetFungibility = _Enum;
var XcmV3MultiassetAssetInstance = _Enum;
var XcmV3MaybeErrorCode = _Enum;
var XcmV2OriginKind = _Enum;
var XcmV5AssetFilter = _Enum;
var XcmV5WildAsset = _Enum;
var XcmV2MultiassetWildFungibility = _Enum;
var XcmV3WeightLimit = _Enum;
var XcmVersionedAssets = _Enum;
var XcmV3MultiassetAssetId = _Enum;
var XcmV3Junctions = _Enum;
var XcmV3Junction = _Enum;
var XcmV3JunctionNetworkId = _Enum;
var XcmVersionedLocation = _Enum;
var UpgradeGoAhead = _Enum;
var UpgradeRestriction = _Enum;
var BalancesTypesReasons = _Enum;
var TransactionPaymentReleases = _Enum;
var XcmV3Response = _Enum;
var XcmV3TraitsError = _Enum;
var XcmV4Response = _Enum;
var XcmPalletVersionMigrationStage = _Enum;
var XcmVersionedAssetId = _Enum;
var MultiAddress = _Enum;
var BalancesAdjustmentDirection = _Enum;
var XcmVersionedXcm = _Enum;
var XcmV3Instruction = _Enum;
var XcmV3MultiassetMultiAssetFilter = _Enum;
var XcmV3MultiassetWildMultiAsset = _Enum;
var XcmV4Instruction = _Enum;
var XcmV4AssetAssetFilter = _Enum;
var XcmV4AssetWildAsset = _Enum;
var TransactionValidityUnknownTransaction = _Enum;
var TransactionValidityTransactionSource = _Enum;
var XcmVersionedAsset = _Enum;
var PreimageEvent = _Enum;
var PreimagePalletHoldReason = _Enum;
var CommonClaimsEvent = _Enum;
var ConvictionVotingVoteAccountVote = _Enum;
var PreimagesBounded = _Enum;
var ChildBountiesEvent = _Enum;
var NominationPoolsPoolState = _Enum;
var NominationPoolsCommissionClaimPermission = _Enum;
var NominationPoolsClaimPermission = _Enum;
var BagsListEvent = _Enum;
var StakingRewardDestination = _Enum;
var StakingForcing = _Enum;
var PreimageOldRequestStatus = _Enum;
var PreimageRequestStatus = _Enum;
var GovernanceOrigin = _Enum;
var WestendRuntimeRuntimeFreezeReason = _Enum;
var NominationPoolsPalletFreezeReason = _Enum;
var Version = _Enum;
var ClaimsStatementKind = _Enum;
var TreasuryPaymentState = _Enum;
var ConvictionVotingVoteVoting = _Enum;
var VotingConviction = _Enum;
var TraitsScheduleDispatchTime = _Enum;
var ChildBountyStatus = _Enum;
var ReferendaTypesCurve = _Enum;
var NominationPoolsBondExtra = _Enum;
var StakingPalletConfigOpBig = _Enum;
var StakingPalletConfigOp = _Enum;
var NominationPoolsConfigOp = _Enum;

// .papi/descriptors/src/index.ts
var metadatas = {
  ["0x5d82548ee8362ca123514269ea6df6f1ad252e4f120516b810bcb2cb29957eb8"]: stack_template_default,
  ["0x1a82e5143be3211ded412b0368b486ce83bd41a80ec95eb267f6c204adda8365"]: bulletin_default,
  ["0x8d6a039a69478214c5846f4504e80f3cd3d2374b4c964976b071aececac586fd"]: paseo_hub_default
};
var getMetadata4 = async (codeHash) => {
  try {
    return await metadatas[codeHash].getMetadata();
  } catch {
  }
  return null;
};
export {
  ArithmeticError,
  BagsListEvent,
  BalanceStatus,
  BalancesAdjustmentDirection,
  BalancesTypesReasons,
  ChildBountiesEvent,
  ChildBountyStatus,
  ClaimsStatementKind,
  CommonClaimsEvent,
  ConvictionVotingVoteAccountVote,
  ConvictionVotingVoteVoting,
  DigestItem,
  DispatchClass,
  GovernanceOrigin,
  MultiAddress,
  NominationPoolsBondExtra,
  NominationPoolsClaimPermission,
  NominationPoolsCommissionClaimPermission,
  NominationPoolsConfigOp,
  NominationPoolsPalletFreezeReason,
  NominationPoolsPoolState,
  Phase,
  PreimageEvent,
  PreimageOldRequestStatus,
  PreimagePalletHoldReason,
  PreimageRequestStatus,
  PreimagesBounded,
  ReferendaTypesCurve,
  StakingForcing,
  StakingPalletConfigOp,
  StakingPalletConfigOpBig,
  StakingRewardDestination,
  TokenError,
  TraitsScheduleDispatchTime,
  TransactionPaymentEvent,
  TransactionPaymentReleases,
  TransactionValidityTransactionSource,
  TransactionValidityUnknownTransaction,
  TransactionalError,
  TreasuryPaymentState,
  UpgradeGoAhead,
  UpgradeRestriction,
  Version,
  VotingConviction,
  WestendRuntimeRuntimeFreezeReason,
  XcmPalletVersionMigrationStage,
  XcmV2JunctionBodyPart,
  XcmV2MultiassetWildFungibility,
  XcmV2OriginKind,
  XcmV3Instruction,
  XcmV3Junction,
  XcmV3JunctionBodyId,
  XcmV3JunctionNetworkId,
  XcmV3Junctions,
  XcmV3MaybeErrorCode,
  XcmV3MultiassetAssetId,
  XcmV3MultiassetAssetInstance,
  XcmV3MultiassetFungibility,
  XcmV3MultiassetMultiAssetFilter,
  XcmV3MultiassetWildMultiAsset,
  XcmV3Response,
  XcmV3TraitsError,
  XcmV3WeightLimit,
  XcmV4AssetAssetFilter,
  XcmV4AssetWildAsset,
  XcmV4Instruction,
  XcmV4Response,
  XcmV5AssetFilter,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5NetworkId,
  XcmV5WildAsset,
  XcmVersionedAsset,
  XcmVersionedAssetId,
  XcmVersionedAssets,
  XcmVersionedLocation,
  XcmVersionedXcm,
  bulletin_default as bulletin,
  getMetadata4 as getMetadata,
  paseo_hub_default as paseo_hub,
  stack_template_default as stack_template
};
