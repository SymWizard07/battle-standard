import { TOKEN_COLORS } from './campaignFactory';

export type TemplateTokenIconCategory = 'animal' | 'beast' | 'monster' | 'humanoid';

export type TemplateTokenIconSource = {
  id: string;
  templateColor: string;
  /** Plain creature name (fallback). */
  label: string;
  /** Styled token name shown in library and when dropped. */
  displayName: string;
  category: TemplateTokenIconCategory;
  author: string;
  authorName: string;
  slug: string;
};

/** game-icons.net sources (CC BY 3.0) — one per template color. */
export const TEMPLATE_TOKEN_ICON_SOURCES: TemplateTokenIconSource[] = [
  {
    id: 'dragon',
    templateColor: TOKEN_COLORS[0]!,
    label: 'Dragon',
    displayName: '#f33*Dragon*#',
    category: 'beast',
    author: 'lorc',
    authorName: 'Lorc',
    slug: 'dragon-head',
  },
  {
    id: 'spider',
    templateColor: TOKEN_COLORS[1]!,
    label: 'Spider',
    displayName: '_Spider_',
    category: 'animal',
    author: 'lorc',
    authorName: 'Lorc',
    slug: 'hanging-spider',
  },
  {
    id: 'hawk',
    templateColor: TOKEN_COLORS[2]!,
    label: 'Hawk',
    displayName: '#fc0*Hawk*#',
    category: 'animal',
    author: 'lorc',
    authorName: 'Lorc',
    slug: 'hawk-emblem',
  },
  {
    id: 'snake',
    templateColor: TOKEN_COLORS[3]!,
    label: 'Snake',
    displayName: '~Snake~',
    category: 'animal',
    author: 'lorc',
    authorName: 'Lorc',
    slug: 'snake',
  },
  {
    id: 'wolf',
    templateColor: TOKEN_COLORS[4]!,
    label: 'Wolf',
    displayName: '#0bb*Wolf*#',
    category: 'animal',
    author: 'lorc',
    authorName: 'Lorc',
    slug: 'wolf-head',
  },
  {
    id: 'barbarian',
    templateColor: TOKEN_COLORS[5]!,
    label: 'Barbarian',
    displayName: '*Barbarian*',
    category: 'humanoid',
    author: 'delapouite',
    authorName: 'Delapouite',
    slug: 'barbarian',
  },
  {
    id: 'goblin',
    templateColor: TOKEN_COLORS[6]!,
    label: 'Goblin',
    displayName: '#93f_Goblin_',
    category: 'monster',
    author: 'delapouite',
    authorName: 'Delapouite',
    slug: 'goblin-head',
  },
  {
    id: 'minotaur',
    templateColor: TOKEN_COLORS[7]!,
    label: 'Minotaur',
    displayName: '#f6c~Minotaur~',
    category: 'beast',
    author: 'lorc',
    authorName: 'Lorc',
    slug: 'minotaur',
  },
];

export function templateTokenIconForColor(templateColor: string): TemplateTokenIconSource | undefined {
  const key = templateColor.toLowerCase();
  return TEMPLATE_TOKEN_ICON_SOURCES.find((s) => s.templateColor.toLowerCase() === key);
}
