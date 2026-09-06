import { resolveStarExpressions } from './statExpression';
import type {
  Token,
  TokenSheetSnapshot,
  TokenSkill,
  TokenSkillType,
  TokenSpeed,
  TokenSpeedType,
} from './types';

const SHEET_STRING_KEYS = [
  'initiative',
  'ac',
  'hp',
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
  'strMod',
  'dexMod',
  'conMod',
  'intMod',
  'wisMod',
  'chaMod',
  'strSave',
  'dexSave',
  'conSave',
  'intSave',
  'wisSave',
  'chaSave',
  'alignment',
  'passivePerception',
  'senses',
  'languages',
  'xp',
  'actions',
] as const satisfies ReadonlyArray<keyof TokenSheetSnapshot>;

const SPEED_TYPES = new Set<TokenSpeedType>(['walk', 'fly', 'swim', 'climb', 'burrow']);
const SKILL_TYPES = new Set<TokenSkillType>([
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
]);

export const TOKEN_SHEET_CLIPBOARD_FORMAT = 'battle-map-token-sheet' as const;
export const TOKEN_SHEET_CLIPBOARD_VERSION = 1 as const;

export const DEFAULT_SKILL_SLOTS: Array<TokenSkillType | null> = [
  'arcana',
  'nature',
  'perception',
];

/** Normalize to exactly three skill slots for the sheet UI. */
export function normalizeSkillSlots(
  slots: Array<TokenSkillType | null> | undefined,
): Array<TokenSkillType | null> {
  const out: Array<TokenSkillType | null> = [...DEFAULT_SKILL_SLOTS];
  if (!slots?.length) return out;
  for (let i = 0; i < 3; i++) {
    const s = slots[i];
    if (s === null) out[i] = null;
    else if (typeof s === 'string' && SKILL_TYPES.has(s)) out[i] = s;
  }
  return out;
}

function parseSkillSlots(value: unknown): Array<TokenSkillType | null> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<TokenSkillType | null> = [];
  for (let i = 0; i < 3; i++) {
    const s = value[i];
    if (s === null) out.push(null);
    else if (typeof s === 'string' && SKILL_TYPES.has(s as TokenSkillType)) {
      out.push(s as TokenSkillType);
    } else {
      out.push(DEFAULT_SKILL_SLOTS[i] ?? null);
    }
  }
  return out;
}

/** Human-readable clipboard payload for token character sheets. */
export type TokenSheetClipboard = {
  format: typeof TOKEN_SHEET_CLIPBOARD_FORMAT;
  version: typeof TOKEN_SHEET_CLIPBOARD_VERSION;
  name?: string;
} & TokenSheetSnapshot;

function hasSheetContent(sheet: TokenSheetSnapshot): boolean {
  for (const key of SHEET_STRING_KEYS) {
    if ((sheet[key] ?? '').trim()) return true;
  }
  if (sheet.speeds && sheet.speeds.length > 0) return true;
  if (sheet.skills && sheet.skills.length > 0) return true;
  if (sheet.skillSlots && sheet.skillSlots.length > 0) return true;
  if (sheet.sheetSection) return true;
  return false;
}

/** Snapshot sheet/stats fields from a map token for library storage. */
export function captureTokenSheet(token: Token): TokenSheetSnapshot | undefined {
  const sheet: TokenSheetSnapshot = {};
  for (const key of SHEET_STRING_KEYS) {
    const v = token[key];
    if (typeof v === 'string' && v.trim()) sheet[key] = v;
  }
  if (token.speeds && token.speeds.length > 0) {
    sheet.speeds = token.speeds.map((s) => ({ ...s }));
  }
  if (token.skills && token.skills.length > 0) {
    sheet.skills = token.skills.map((s) => ({ ...s }));
  }
  if (token.skillSlots && token.skillSlots.length > 0) {
    sheet.skillSlots = normalizeSkillSlots(token.skillSlots);
  }
  if (token.sheetSection) sheet.sheetSection = token.sheetSection;
  return hasSheetContent(sheet) ? sheet : undefined;
}

/**
 * Pretty-printed JSON for clipboard export (name + sheet fields).
 * Empty fields are omitted for readability.
 */
export function serializeTokenSheetClipboard(token: Token): string {
  const sheet = captureTokenSheet(token) ?? {};
  const payload: TokenSheetClipboard = {
    format: TOKEN_SHEET_CLIPBOARD_FORMAT,
    version: TOKEN_SHEET_CLIPBOARD_VERSION,
    name: token.name,
    ...sheet,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseSpeeds(value: unknown): TokenSpeed[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: TokenSpeed[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const type = (item as { type?: unknown }).type;
    const speedValue = (item as { value?: unknown }).value;
    if (typeof type !== 'string' || !SPEED_TYPES.has(type as TokenSpeedType)) continue;
    if (typeof speedValue !== 'string') continue;
    out.push({ type: type as TokenSpeedType, value: speedValue });
  }
  return out;
}

function parseSkills(value: unknown): TokenSkill[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: TokenSkill[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const type = (item as { type?: unknown }).type;
    const skillValue = (item as { value?: unknown }).value;
    if (typeof type !== 'string' || !SKILL_TYPES.has(type as TokenSkillType)) continue;
    if (typeof skillValue !== 'string') continue;
    out.push({ type: type as TokenSkillType, value: skillValue });
  }
  return out;
}

/**
 * Parse clipboard JSON into a token patch (name + sheet fields).
 * Replaces sheet fields: missing string keys clear to empty; missing speeds/skills clear to [].
 */
export function parseTokenSheetClipboard(raw: string): (Partial<Token> & { name?: string }) | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (obj.format !== TOKEN_SHEET_CLIPBOARD_FORMAT) return null;
  if (obj.version != null && obj.version !== TOKEN_SHEET_CLIPBOARD_VERSION) return null;

  const patch: Partial<Token> & { name?: string } = {};
  const name = asString(obj.name);
  if (name != null) patch.name = name;

  for (const key of SHEET_STRING_KEYS) {
    const v = asString(obj[key]);
    patch[key] = v ?? '';
  }

  const speeds = parseSpeeds(obj.speeds);
  patch.speeds = speeds ?? [];
  const skills = parseSkills(obj.skills);
  patch.skills = skills ?? [];
  const skillSlots = parseSkillSlots(obj.skillSlots);
  patch.skillSlots = skillSlots ?? [...DEFAULT_SKILL_SLOTS];

  if (obj.sheetSection === 'attributes' || obj.sheetSection === 'actions') {
    patch.sheetSection = obj.sheetSection;
  }

  return patch;
}

function resolveSpeeds(speeds: TokenSpeed[] | undefined, rng: () => number): TokenSpeed[] | undefined {
  if (!speeds?.length) return speeds;
  return speeds.map((s) => ({
    ...s,
    value: resolveStarExpressions(s.value, rng),
  }));
}

function resolveSkills(skills: TokenSkill[] | undefined, rng: () => number): TokenSkill[] | undefined {
  if (!skills?.length) return skills;
  return skills.map((s) => ({
    ...s,
    value: resolveStarExpressions(s.value, rng),
  }));
}

const MOD_SAVE_KEYS = new Set<keyof TokenSheetSnapshot>([
  'strMod',
  'dexMod',
  'conMod',
  'intMod',
  'wisMod',
  'chaMod',
  'strSave',
  'dexSave',
  'conSave',
  'intSave',
  'wisSave',
  'chaSave',
]);

/**
 * Resolve *-prefixed expressions (dice rolled) for placing a library token.
 * Returns a Partial&lt;Token&gt; suitable for addToken.
 */
export function resolveTokenSheetForPlace(
  sheet: TokenSheetSnapshot,
  rng: () => number = Math.random,
): Partial<Token> {
  const out: Partial<Token> = {};
  for (const key of SHEET_STRING_KEYS) {
    const v = sheet[key];
    if (typeof v === 'string' && v.length > 0) {
      out[key] = resolveStarExpressions(v, rng, MOD_SAVE_KEYS.has(key));
    }
  }
  if (sheet.speeds) out.speeds = resolveSpeeds(sheet.speeds, rng);
  if (sheet.skills) out.skills = resolveSkills(sheet.skills, rng);
  if (sheet.skillSlots) out.skillSlots = normalizeSkillSlots(sheet.skillSlots);
  if (sheet.sheetSection) out.sheetSection = sheet.sheetSection;
  return out;
}
