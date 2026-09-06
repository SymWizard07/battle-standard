import assert from 'node:assert/strict';
import { parseTokenSheetText, SHEET_HEADING_COLOR } from './tokenSheetTextMarkup';
import { DEFAULT_TOKEN_NAME_COLOR } from './tokenNameMarkup';

const plain = parseTokenSheetText('Bite. Melee attack.');
assert.equal(plain.length, 1);
assert.equal(plain[0]!.heading, false);
assert.equal(plain[0]!.segments.map((s) => s.text).join(''), 'Bite. Melee attack.');

const heading = parseTokenSheetText('# Actions\nBite deals *1d6* damage.');
assert.equal(heading.length, 2);
assert.equal(heading[0]!.heading, true);
assert.equal(heading[0]!.prefix, '# ');
assert.equal(heading[0]!.body, 'Actions');
assert.equal(heading[0]!.segments[0]!.text, 'Actions');
assert.equal(heading[1]!.heading, false);
assert.equal(heading[1]!.segments.some((s) => s.bold && s.text === '1d6'), true);

const colorNotHeading = parseTokenSheetText('#f00Fire breath');
assert.equal(colorNotHeading[0]!.heading, false);
assert.equal(colorNotHeading[0]!.segments[0]!.color, '#ff0000');

const multiSpace = parseTokenSheetText('#  Traits');
assert.equal(multiSpace[0]!.heading, true);
assert.equal(multiSpace[0]!.prefix, '#  ');
assert.equal(multiSpace[0]!.body, 'Traits');

assert.equal(SHEET_HEADING_COLOR.startsWith('#'), true);
assert.equal(DEFAULT_TOKEN_NAME_COLOR.startsWith('#'), true);

console.log('tokenSheetTextMarkup.test.ts: ok');
