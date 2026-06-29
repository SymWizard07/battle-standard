import {
  COMPANION_PROTOCOL_VERSION,
  type ExtensionToHostMessage,
  type HostToExtensionMessage,
} from '../../protocol/index.js';
import { HOST_VERSION, loadConfig } from './config.js';
import { deleteCampaignFromDisk, listCampaignIds } from './diskWriter.js';
import { handleSessionMessage, isSessionMessage } from './sessionState.js';

export type HostHandlerResult = HostToExtensionMessage | HostToExtensionMessage[];

function asArray(result: HostHandlerResult): HostToExtensionMessage[] {
  return Array.isArray(result) ? result : [result];
}

export async function handleHostMessage(
  message: ExtensionToHostMessage,
): Promise<HostHandlerResult> {
  const config = loadConfig();

  try {
    if (isSessionMessage(message)) {
      return await handleSessionMessage(config, message);
    }

    switch (message.type) {
      case 'ping':
        return {
          type: 'pong',
          protocolVersion: COMPANION_PROTOCOL_VERSION,
          hostVersion: HOST_VERSION,
        };

      case 'getStatus':
        return {
          type: 'status',
          saveFolder: config.saveFolder,
          hostVersion: HOST_VERSION,
          error: config.saveFolder ? null : 'Save folder not configured in host.',
        };

      case 'deleteCampaign':
        await deleteCampaignFromDisk(config, message.campaignId);
        return { type: 'ok' };

      case 'listCampaigns':
        return { type: 'listCampaignsResult', campaignIds: await listCampaignIds(config) };

      default:
        return { type: 'error', error: 'Unknown message type' };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Host handler failed';
    return { type: 'error', error };
  }
}

export async function handleHostMessages(
  messages: ExtensionToHostMessage[],
): Promise<HostToExtensionMessage[]> {
  const out: HostToExtensionMessage[] = [];
  for (const message of messages) {
    out.push(...asArray(await handleHostMessage(message)));
  }
  return out;
}
