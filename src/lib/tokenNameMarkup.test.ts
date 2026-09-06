import assert from 'node:assert/strict';
import {
  expandHex3,
  markupGroupsAtOffset,
  parseTokenNameMarkup,
  parseTokenNameMarkupPieces,
  plainTokenName,
} from './tokenNameMarkup';

function segmentTexts(raw: string) {
  return parseTokenNameMarkup(raw).map((segment) => segment.text).join('');
}

assert.equal(expandHex3('f00'), '#ff0000');
assert.equal(expandHex3('ABC'), '#aabbcc');

assert.equal(segmentTexts('Plain Goblin'), 'Plain Goblin');
assert.equal(plainTokenName('Plain Goblin'), 'Plain Goblin');

const bold = parseTokenNameMarkup('*Chief*');
assert.equal(bold.length, 1);
assert.equal(bold[0]!.text, 'Chief');
assert.equal(bold[0]!.bold, true);

const colored = parseTokenNameMarkup('#f00Fire#');
assert.equal(colored.map((s) => s.text).join(''), 'Fire');
assert.equal(colored[0]!.color, '#ff0000');

const mixed = parseTokenNameMarkup('Orc #f00*Chief*#');
assert.equal(mixed.map((s) => s.text).join(''), 'Orc Chief');
assert.equal(mixed[0]!.color, '#f8fafc');
assert.equal(mixed[1]!.color, '#ff0000');
assert.equal(mixed[1]!.bold, true);

const italic = parseTokenNameMarkup('_Scout_');
assert.equal(italic[0]!.italic, true);

const underline = parseTokenNameMarkup('~marked~');
assert.equal(underline[0]!.underline, true);

const strike = parseTokenNameMarkup('-dead-');
assert.equal(strike[0]!.text, 'dead');
assert.equal(strike[0]!.strikethrough, true);

const obfuscated = parseTokenNameMarkup('?Hidden?');
assert.equal(obfuscated[0]!.text, 'Hidden');
assert.equal(obfuscated[0]!.obfuscated, true);

assert.equal(plainTokenName('?Hidden?'), 'Hidden');
assert.equal(plainTokenName('Half-Orc'), 'Half-Orc');
assert.equal(plainTokenName('\\*literal\\*'), '*literal*');

const piecesRoundTrip = parseTokenNameMarkupPieces('#f00*Chief*#');
assert.equal(piecesRoundTrip.map((p) => p.text).join(''), '#f00*Chief*#');
assert.ok(piecesRoundTrip.some((p) => p.kind === 'delim' && p.text === '#f00'));
assert.ok(piecesRoundTrip.some((p) => p.kind === 'delim' && p.text === '*'));
assert.ok(
  piecesRoundTrip.some((p) => p.kind === 'text' && p.text === 'Chief' && p.style.bold),
);

assert.equal(parseTokenNameMarkupPieces('\\*lit\\*').map((p) => p.text).join(''), '\\*lit\\*');
const escaped = parseTokenNameMarkupPieces('a\\*b');
assert.ok(escaped.some((p) => p.kind === 'delim' && p.text === '\\'));
assert.ok(escaped.some((p) => p.kind === 'text' && p.text === '*' && p.groups.length >= 2));
const onStar = markupGroupsAtOffset(escaped, 2); // on "*"
assert.ok([...onStar].some((g) => escaped.some((p) => p.kind === 'delim' && p.groups.includes(g))));
const away = markupGroupsAtOffset(escaped, 0); // on "a"
assert.ok(![...away].some((g) => escaped.some((p) => p.kind === 'delim' && p.text === '\\' && p.groups.includes(g))));

const boldPieces = parseTokenNameMarkupPieces('*Chief*');
const inside = markupGroupsAtOffset(boldPieces, 3); // inside "Chief"
assert.ok([...inside].length > 0);
const outside = markupGroupsAtOffset(parseTokenNameMarkupPieces('x *Chief* y'), 0);
assert.equal(outside.size, 1); // only default color group

console.log('tokenNameMarkup.test.ts: ok');
