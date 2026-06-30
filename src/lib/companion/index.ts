export {
  chooseCompanionSaveFolder,
  deleteCampaignViaCompanion,
  getCompanionStatus,
  importCampaignFromCompanion,
  importGlobalFromCompanion,
  isCompanionReady,
  listCampaignsViaCompanion,
  loadCampaignViaCompanion,
  loadGlobalViaCompanion,
  postToExtension,
  probeCompanionExtension,
  saveCampaignViaCompanion,
  saveGlobalViaCompanion,
  syncFromCompanion,
  type CompanionStatus,
} from './companionBridge';

export {
  base64ToBlob,
  blobToBase64,
  blobToCompanionAsset,
  companionAssetToStored,
  companionAssetsToStored,
  storedAssetToCompanionPayload,
} from './companionAssets';

export {
  checkCompanionReady,
  deleteCampaignFromStorage,
  getUnifiedStorageStatus,
  isCompanionDiskEmpty,
  mirrorCampaignToCompanion,
  mirrorGlobalToCompanion,
  preferSyncCampaignFromDisk,
  preferSyncFromDisk,
  pushAllToStorage,
  runScheduledGlobalMirror,
  runScheduledMirror,
  syncCampaignFromCompanionDisk,
  syncGlobalFromCompanionDisk,
  type StorageBackend,
  type UnifiedStorageStatus,
} from './companionStorage';

export {
  folderBasename,
  foldersMayDiverge,
  isDivergentWarningDismissed,
  setDivergentWarningDismissed,
  shouldShowDivergentFolderWarning,
  storageBackendLabel,
} from './folderAlignment';

export type {
  CompanionAssetPayload,
  ExtensionToPageMessage,
  PageToExtensionMessage,
} from '@companion/protocol';
