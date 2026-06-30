/**
 * Automated — extension bridge page ↔ host session mapping.
 * Run: npm run test:companion-protocol
 */
import {
  hostResponsesToPageMessage,
  pageMessageToHostPlan,
  runHostSequence,
} from './bridge.js';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testPingMapsSingle() {
  const plan = pageMessageToHostPlan({ type: 'ping', requestId: 'r1' });
  assertEqual(plan?.mode, 'single');
}

function testSaveCampaignMapsToSession() {
  const plan = pageMessageToHostPlan({
    type: 'saveCampaign',
    requestId: 'r2',
    campaign: {
      id: 'c1',
      name: 'Test',
      sceneDeck: [],
      scenes: {},
      createdAt: 1,
      updatedAt: 2,
    },
    assets: [],
  });
  assertEqual(plan?.mode, 'save');
  if (!plan || plan.mode !== 'save') throw new Error('expected save plan');
  assertEqual(plan.messages[0]?.type, 'saveCampaignBegin');
  assertEqual(plan.messages[plan.messages.length - 1]?.type, 'saveCampaignCommit');
}

function testLoadCampaignMapsToBegin() {
  const plan = pageMessageToHostPlan({
    type: 'loadCampaign',
    requestId: 'r3',
    campaignId: 'c1',
  });
  assertEqual(plan?.mode, 'load');
  if (!plan || plan.mode !== 'load') throw new Error('expected load plan');
  assertEqual(plan.begin.type, 'loadCampaignBegin');
}

async function testRunHostSequence() {
  const sent: string[] = [];
  const responses = await runHostSequence(async (message) => {
    sent.push(message.type);
    return { type: 'sessionAck', sessionId: 's' };
  }, [
    { type: 'saveCampaignBegin', sessionId: 's', campaign: { id: 'c', name: 'n', sceneDeck: [], scenes: {}, createdAt: 0, updatedAt: 0 } },
    { type: 'saveCampaignCommit', sessionId: 's' },
  ]);
  assertEqual(sent.join(','), 'saveCampaignBegin,saveCampaignCommit');
  assertEqual(responses.length, 2);
}

function testHostResponsesToLoadCampaignResult() {
  const page = hostResponsesToPageMessage('req', [
    {
      type: 'loadCampaignData',
      sessionId: 's',
      campaign: { id: 'c1', name: 'Loaded', sceneDeck: [], scenes: {}, createdAt: 1, updatedAt: 2 },
    },
    {
      type: 'loadAsset',
      sessionId: 's',
      asset: {
        id: 'a1',
        name: 'x.png',
        mimeType: 'image/png',
        createdAt: 1,
        dataBase64: 'abc',
      },
    },
    { type: 'loadCampaignComplete', sessionId: 's' },
  ]);
  assertEqual(page.type, 'loadCampaignResult');
}

function testChooseSaveFolderMapsSingle() {
  const plan = pageMessageToHostPlan({ type: 'chooseSaveFolder', requestId: 'r4' });
  assertEqual(plan?.mode, 'single');
  if (!plan || plan.mode !== 'single') throw new Error('expected single plan');
  assertEqual(plan.message.type, 'chooseSaveFolder');
}

async function runTests() {
  testPingMapsSingle();
  testSaveCampaignMapsToSession();
  testLoadCampaignMapsToBegin();
  testChooseSaveFolderMapsSingle();
  await testRunHostSequence();
  testHostResponsesToLoadCampaignResult();
  console.log('[automated] companion/extension bridge tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
