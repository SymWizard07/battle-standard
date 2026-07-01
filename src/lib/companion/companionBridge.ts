/**
 * Website ↔ extension bridge for Save Helper (protocol v2 via extension chunking).
 */
import {
  isCompanionExtensionEnvelope,
  wrapPageMessage,
  type CompanionAssetPayload,
  type ExtensionToPageMessage,
  type PageToExtensionMessage,
} from '@companion/protocol';
import type { Campaign, TokenLibraryLayout } from '../types';
import { GLOBAL_CAMPAIGN_ID } from '../types';
import {
  importCampaignBundleFromDisk,
  importGlobalBundle,
  loadCampaign,
  loadCampaignAssets,
  loadTokenLibraryLayout,
} from '../db';
import { referencedAssetIds } from '../campaignAssets';
import { companionAssetsToStored, storedAssetToCompanionPayload } from './companionAssets';

export type CompanionStatus = {
  available: boolean;
  connected: boolean;
  saveFolder: string | null;
  hostVersion: string | null;
  error: string | null;
};

const DEFAULT_TIMEOUT_MS = 60_000;
/** Fast fail when the extension is not installed or not injected on this page. */
const STATUS_TIMEOUT_MS = 2_500;

let postOverride:
  | ((message: PageToExtensionMessage, timeoutMs?: number) => Promise<ExtensionToPageMessage>)
  | null = null;

function newRequestId(): string {
  return crypto.randomUUID();
}

export function postToExtension(
  message: PageToExtensionMessage,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ExtensionToPageMessage> {
  if (postOverride) return postOverride(message, timeoutMs);
  return postToExtensionViaWindow(message, timeoutMs);
}

function postToExtensionViaWindow(
  message: PageToExtensionMessage,
  timeoutMs: number,
): Promise<ExtensionToPageMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onReply);
      reject(new Error('Companion extension did not respond'));
    }, timeoutMs);

    function onReply(event: MessageEvent) {
      if (event.source !== window) return;
      if (!isCompanionExtensionEnvelope(event.data)) return;
      if (event.data.payload.requestId !== message.requestId) return;

      clearTimeout(timeout);
      window.removeEventListener('message', onReply);
      resolve(event.data.payload);
    }

    window.addEventListener('message', onReply);
    window.postMessage(wrapPageMessage(message), window.location.origin);
  });
}

/** @internal Test hook */
export function __setPostToExtensionForTests(
  fn:
    | ((message: PageToExtensionMessage, timeoutMs?: number) => Promise<ExtensionToPageMessage>)
    | null,
): void {
  postOverride = fn;
}

export async function probeCompanionExtension(): Promise<boolean> {
  try {
    const response = await postToExtension(
      { type: 'ping', requestId: newRequestId() },
      STATUS_TIMEOUT_MS,
    );
    return response.type === 'pong';
  } catch {
    return false;
  }
}

export async function getCompanionStatus(): Promise<CompanionStatus> {
  try {
    const response = await postToExtension(
      { type: 'getStatus', requestId: newRequestId() },
      STATUS_TIMEOUT_MS,
    );
    if (response.type === 'status') {
      return {
        available: true,
        connected: response.connected,
        saveFolder: response.saveFolder,
        hostVersion: response.hostVersion,
        error: response.error,
      };
    }
    return {
      available: true,
      connected: false,
      saveFolder: null,
      hostVersion: null,
      error:
        response.type === 'error'
          ? response.error
          : `Unexpected reply type: ${response.type}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Extension unavailable';
    return {
      available: false,
      connected: false,
      saveFolder: null,
      hostVersion: null,
      error,
    };
  }
}

const CHOOSE_FOLDER_TIMEOUT_MS = 5 * 60_000;

export async function chooseCompanionSaveFolder(): Promise<CompanionStatus> {
  try {
    const response = await postToExtension(
      { type: 'chooseSaveFolder', requestId: newRequestId() },
      CHOOSE_FOLDER_TIMEOUT_MS,
    );
    if (response.type === 'status') {
      return {
        available: true,
        connected: true,
        saveFolder: response.saveFolder,
        hostVersion: response.hostVersion,
        error: response.error,
      };
    }
    return {
      available: true,
      connected: false,
      saveFolder: null,
      hostVersion: null,
      error:
        response.type === 'error'
          ? response.error
          : `Unexpected reply type: ${response.type}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Extension unavailable';
    return {
      available: false,
      connected: false,
      saveFolder: null,
      hostVersion: null,
      error,
    };
  }
}

/** Extension + host connected with save folder configured. */
export async function isCompanionReady(): Promise<boolean> {
  const status = await getCompanionStatus();
  return (
    status.available &&
    status.connected &&
    status.saveFolder != null &&
    status.error == null
  );
}

async function expectOk(response: ExtensionToPageMessage, action: string): Promise<void> {
  if (response.type === 'error') {
    throw new Error(`${action} failed: ${response.error}`);
  }
  if (response.type !== 'ok') {
    throw new Error(`${action} failed: unexpected ${response.type}`);
  }
}

export async function saveCampaignViaCompanion(campaignId: string): Promise<void> {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) return;

  const assetIds = referencedAssetIds(campaign);
  const stored = await loadCampaignAssets(campaignId);
  const assets: CompanionAssetPayload[] = await Promise.all(
    stored.filter((a) => assetIds.has(a.id)).map((a) => storedAssetToCompanionPayload(a)),
  );

  const response = await postToExtension({
    type: 'saveCampaign',
    requestId: newRequestId(),
    campaign,
    assets,
  });
  await expectOk(response, 'saveCampaign');
}

export async function saveGlobalViaCompanion(): Promise<void> {
  const tokenLibrary = (await loadTokenLibraryLayout(GLOBAL_CAMPAIGN_ID)) ?? null;
  const stored = await loadCampaignAssets(GLOBAL_CAMPAIGN_ID);
  const assets = await Promise.all(stored.map((a) => storedAssetToCompanionPayload(a)));

  const response = await postToExtension({
    type: 'saveGlobal',
    requestId: newRequestId(),
    tokenLibrary,
    assets,
  });
  await expectOk(response, 'saveGlobal');
}

export async function deleteCampaignViaCompanion(campaignId: string): Promise<void> {
  const response = await postToExtension(
    {
      type: 'deleteCampaign',
      requestId: newRequestId(),
      campaignId,
    },
    STATUS_TIMEOUT_MS,
  );
  await expectOk(response, 'deleteCampaign');
}

export async function loadCampaignViaCompanion(
  campaignId: string,
): Promise<{ campaign: Campaign; assets: CompanionAssetPayload[] } | null> {
  const response = await postToExtension({
    type: 'loadCampaign',
    requestId: newRequestId(),
    campaignId,
  });
  if (response.type === 'error') {
    throw new Error(response.error);
  }
  if (response.type !== 'loadCampaignResult') {
    throw new Error('loadCampaign failed: unexpected response');
  }
  return { campaign: response.campaign, assets: response.assets };
}

export async function loadGlobalViaCompanion(): Promise<{
  tokenLibrary: TokenLibraryLayout | null;
  assets: CompanionAssetPayload[];
} | null> {
  const response = await postToExtension({
    type: 'loadGlobal',
    requestId: newRequestId(),
  });
  if (response.type === 'error') {
    throw new Error(response.error);
  }
  if (response.type !== 'loadGlobalResult') {
    throw new Error('loadGlobal failed: unexpected response');
  }
  return { tokenLibrary: response.tokenLibrary, assets: response.assets };
}

export async function listCampaignsViaCompanion(): Promise<string[]> {
  const response = await postToExtension({
    type: 'listCampaigns',
    requestId: newRequestId(),
  });
  if (response.type === 'error') {
    throw new Error(response.error);
  }
  if (response.type !== 'listCampaignsResult') {
    throw new Error('listCampaigns failed: unexpected response');
  }
  return response.campaignIds;
}

export async function importCampaignFromCompanion(campaignId: string): Promise<boolean> {
  const bundle = await loadCampaignViaCompanion(campaignId);
  if (!bundle) return false;
  return importCampaignBundleFromDisk(
    bundle.campaign,
    companionAssetsToStored(bundle.assets, bundle.campaign.id),
  );
}

export async function importGlobalFromCompanion(): Promise<boolean> {
  const bundle = await loadGlobalViaCompanion();
  if (!bundle) return false;
  if (!bundle.tokenLibrary && bundle.assets.length === 0) return false;
  await importGlobalBundle(
    bundle.tokenLibrary ?? undefined,
    companionAssetsToStored(bundle.assets, GLOBAL_CAMPAIGN_ID),
  );
  return true;
}

export async function syncFromCompanion(): Promise<{ imported: number; error?: string }> {
  try {
    let imported = 0;
    try {
      if (await importGlobalFromCompanion()) imported += 1;
    } catch {
      // Missing or empty global/ on disk is non-fatal — still import campaigns.
    }

    const ids = await listCampaignsViaCompanion();
    for (const id of ids) {
      const ok = await importCampaignFromCompanion(id);
      if (ok) imported += 1;
    }
    return { imported };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Companion sync failed.';
    return { imported: 0, error: message };
  }
}

export type {
  CompanionAssetPayload,
  ExtensionToPageMessage,
  PageToExtensionMessage,
} from '@companion/protocol';

export {
  base64ToBlob,
  blobToBase64,
  blobToCompanionAsset,
  companionAssetToStored,
  companionAssetsToStored,
  storedAssetToCompanionPayload,
} from './companionAssets';
