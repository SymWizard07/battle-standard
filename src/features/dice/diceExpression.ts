import { isDiceSides, MAX_DICE, type DiceSides } from './diceTypes';

export type ParsedDiceTerm = {
  count: number;
  sides: DiceSides;
  sign: 1 | -1;
};

export type ParsedDiceExpression = {
  terms: ParsedDiceTerm[];
  /** Flat numeric modifier (sum of non-dice terms). */
  modifier: number;
  /** Dice to spawn (positive terms only; negative dice terms contribute via modifier path as unsupported → rejected). */
  dice: DiceSides[];
};

function compact(s: string): string {
  return s.replace(/\s+/g, '');
}

const POLY = new Set([4, 6, 8, 10, 12, 20]);

/**
 * Parse a dice tray expression into spawnable polyset dice + flat modifier.
 * Supports forms like `2d6+3`, `d20`, `1d8+1d4-2`. Negative dice terms are rejected.
 */
export function parseDiceTrayExpression(raw: string): ParsedDiceExpression | null {
  let s = compact(raw.trim());
  if (!s) return null;
  if (s.startsWith('*')) s = s.slice(1);
  if (!s) return null;

  const terms: ParsedDiceTerm[] = [];
  let modifier = 0;
  const dice: DiceSides[] = [];

  let pos = 0;
  let expectSign = false;
  while (pos < s.length) {
    let sign: 1 | -1 = 1;
    const ch = s[pos];
    if (ch === '+' || ch === '-') {
      sign = ch === '-' ? -1 : 1;
      pos++;
    } else if (expectSign) {
      return null;
    }

    const diceMatch = /^(\d*)d(\d+)/i.exec(s.slice(pos));
    if (diceMatch) {
      const count = diceMatch[1] === '' ? 1 : Number.parseInt(diceMatch[1]!, 10);
      const sides = Number.parseInt(diceMatch[2]!, 10);
      if (!Number.isFinite(count) || count < 1 || count > MAX_DICE) return null;
      if (!POLY.has(sides) || !isDiceSides(sides)) return null;
      if (sign < 0) return null;
      if (dice.length + count > MAX_DICE) return null;
      terms.push({ count, sides, sign });
      for (let i = 0; i < count; i++) dice.push(sides);
      pos += diceMatch[0].length;
    } else {
      const num = /^\d+/.exec(s.slice(pos));
      if (!num) return null;
      modifier += sign * Number.parseInt(num[0], 10);
      pos += num[0].length;
    }
    expectSign = true;
  }

  if (dice.length === 0 && modifier === 0 && terms.length === 0) return null;
  return { terms, modifier, dice };
}
