import assert from 'node:assert/strict';
import {
  parseTokenSheetClipboard,
  serializeTokenSheetClipboard,
  TOKEN_SHEET_CLIPBOARD_FORMAT,
} from './tokenSheet';
import type { Token } from './types';

const token = {
  id: 't1',
  name: '*Goblin*',
  ac: '15',
  hp: '7',
  actions: '# Actions\nScimitar +4',
  skills: [{ type: 'stealth', value: '+6' }],
  speeds: [{ type: 'walk', value: '30' }],
  sheetSection: 'actions',
} as Token;

const text = serializeTokenSheetClipboard(token);
assert.ok(text.includes('"format": "battle-map-token-sheet"'));
assert.ok(text.includes('"name": "*Goblin*"'));
assert.ok(text.includes('"ac": "15"'));

const patch = parseTokenSheetClipboard(text);
assert.ok(patch);
assert.equal(patch!.name, '*Goblin*');
assert.equal(patch!.ac, '15');
assert.equal(patch!.hp, '7');
assert.equal(patch!.skills?.[0]?.type, 'stealth');
assert.equal(patch!.speeds?.[0]?.value, '30');
assert.equal(patch!.sheetSection, 'actions');

assert.equal(parseTokenSheetClipboard('{ "nope": true }'), null);
assert.equal(
  parseTokenSheetClipboard(
    JSON.stringify({ format: TOKEN_SHEET_CLIPBOARD_FORMAT, version: 1, ac: '12' }),
  )?.ac,
  '12',
);

console.log('tokenSheet.clipboard.test.ts: ok');
