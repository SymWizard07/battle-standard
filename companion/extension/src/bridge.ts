import { COMPANION_PROTOCOL_VERSION, NATIVE_HOST_NAME } from '../../protocol/constants.js';
import type {
  ExtensionToHostMessage,
  HostToExtensionMessage,
  PageToExtensionMessage,
  ExtensionToPageMessage,
} from '../../protocol/messages.js';
import {
  assembleLoadCampaignResponses,
  assembleLoadGlobalResponses,
  encodeSaveCampaignSession,
  encodeSaveGlobalSession,
  newSessionId,
} from '../../protocol/session.js';

export type HostSendFn = (message: ExtensionToHostMessage) => Promise<HostToExtensionMessage>;

export async function runHostSequence(
  send: HostSendFn,
  messages: ExtensionToHostMessage[],
): Promise<HostToExtensionMessage[]> {
  const responses: HostToExtensionMessage[] = [];
  for (const message of messages) {
    const response = await send(message);
    responses.push(response);
    if (response.type === 'error') break;
  }
  return responses;
}

export function pageMessageToHostPlan(
  message: PageToExtensionMessage,
): { mode: 'single'; message: ExtensionToHostMessage } | { mode: 'save'; messages: ExtensionToHostMessage[] } | { mode: 'load'; begin: ExtensionToHostMessage } | null {
  switch (message.type) {
    case 'ping':
      return { mode: 'single', message: { type: 'ping' } };
    case 'getStatus':
      return { mode: 'single', message: { type: 'getStatus' } };
    case 'deleteCampaign':
      return { mode: 'single', message: { type: 'deleteCampaign', campaignId: message.campaignId } };
    case 'saveCampaign':
      return {
        mode: 'save',
        messages: encodeSaveCampaignSession(message.campaign, message.assets, newSessionId()),
      };
    case 'saveGlobal':
      return {
        mode: 'save',
        messages: encodeSaveGlobalSession(message.tokenLibrary, message.assets, newSessionId()),
      };
    case 'loadCampaign':
      return {
        mode: 'load',
        begin: { type: 'loadCampaignBegin', sessionId: newSessionId(), campaignId: message.campaignId },
      };
    case 'loadGlobal':
      return { mode: 'load', begin: { type: 'loadGlobalBegin', sessionId: newSessionId() } };
    case 'listCampaigns':
      return { mode: 'single', message: { type: 'listCampaigns' } };
    case 'chooseSaveFolder':
      return { mode: 'single', message: { type: 'chooseSaveFolder' } };
    default:
      return null;
  }
}

export function hostResponsesToPageMessage(
  requestId: string,
  responses: HostToExtensionMessage[],
): ExtensionToPageMessage {
  const last = responses[responses.length - 1];
  if (!last) {
    return { type: 'error', requestId, error: 'Empty host response' };
  }

  if (last.type === 'error') {
    return { type: 'error', requestId, error: last.error };
  }

  switch (last.type) {
    case 'pong':
      return { type: 'pong', requestId, protocolVersion: COMPANION_PROTOCOL_VERSION };
    case 'status':
      return {
        type: 'status',
        requestId,
        connected: true,
        saveFolder: last.saveFolder,
        hostVersion: last.hostVersion,
        error: last.error,
      };
    case 'ok':
      return { type: 'ok', requestId };
    case 'loadCampaignComplete': {
      const assembled = assembleLoadCampaignResponses(responses);
      return {
        type: 'loadCampaignResult',
        requestId,
        campaign: assembled.campaign,
        assets: assembled.assets,
      };
    }
    case 'loadGlobalComplete': {
      const assembled = assembleLoadGlobalResponses(responses);
      return {
        type: 'loadGlobalResult',
        requestId,
        tokenLibrary: assembled.tokenLibrary,
        assets: assembled.assets,
      };
    }
    case 'listCampaignsResult':
      return { type: 'listCampaignsResult', requestId, campaignIds: last.campaignIds };
    default:
      return { type: 'error', requestId, error: 'Unknown host response sequence' };
  }
}

export { NATIVE_HOST_NAME };
